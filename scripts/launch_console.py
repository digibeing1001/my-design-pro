#!/usr/bin/env python3
"""
Launch Graphic Design Pro Console (static file server + Gateway proxy)

Usage:
    python scripts/launch_console.py [--port 3005] [--no-open] [--silent] [--status] [--stop]

Serves the built console/dist/ directory over HTTP.
Acts as a reverse proxy to Agent Gateways at /proxy/{env}/* to bypass CORS.
Console must be built first: cd console && npm run build

Modes:
    (default)   Start the server and open browser
    --silent    Start in background, no browser, minimal output (for auto-launch)
    --status    Check if server is running, print URL and exit
    --stop      Stop a running server via PID file
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import socketserver
import threading
import webbrowser
import base64
import re
import signal
from datetime import datetime, timezone

# Fix Windows terminal encoding for emoji output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')


REPO_ROOT = Path(__file__).resolve().parents[1]
PARTNER_HANDOFF_ROOT = REPO_ROOT / ".gdpro" / "partner-handoffs"
PARTNER_RECEIPT_SCHEMA_VERSION = "gdpro.partner-handoff-receipt.v1"
CODEX_SERVICE_SCHEMA_VERSION = "gdpro.local-codex.v1"
LOCAL_AGENT_PATHS = {
    "codex": "/local-codex",
}
_CODEX_COMMAND_CACHE = None


def utc_now_iso():
    """Return a compact UTC timestamp for local handoff files."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ─── PID file management ──────────────────────────────────────
def get_pid_file_path():
    """Return path to PID file (stored in user home to survive across sessions)."""
    return Path.home() / ".gdpro" / "console.pid"


def get_url_file_path():
    """Return path to URL file (stores the running console URL)."""
    return Path.home() / ".gdpro" / "console.url"


def write_pid_file(port, pid=None):
    """Write PID and port info to PID file."""
    pid_dir = Path.home() / ".gdpro"
    pid_dir.mkdir(parents=True, exist_ok=True)
    pid_file = get_pid_file_path()
    url_file = get_url_file_path()
    actual_pid = pid or os.getpid()
    pid_file.write_text(f"{actual_pid}\n{port}\n", encoding="utf-8")
    url_file.write_text(f"http://localhost:{port}\n", encoding="utf-8")


def read_pid_file():
    """Read PID and port from PID file. Returns (pid, port) or (None, None)."""
    pid_file = get_pid_file_path()
    if not pid_file.exists():
        return None, None
    try:
        parts = pid_file.read_text(encoding="utf-8").strip().split("\n")
        pid = int(parts[0])
        port = int(parts[1]) if len(parts) > 1 else None
        return pid, port
    except (ValueError, IndexError):
        return None, None


def is_pid_running(pid):
    """Check if a process with given PID is running (cross-platform)."""
    if pid is None:
        return False
    try:
        if sys.platform == "win32":
            # On Windows, os.kill with signal 0 doesn't work the same way
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                capture_output=True, text=True, timeout=5
            )
            return str(pid) in result.stdout
        else:
            os.kill(pid, 0)
            return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


def cleanup_pid_file():
    """Remove PID and URL files."""
    for f in [get_pid_file_path(), get_url_file_path()]:
        try:
            f.unlink(missing_ok=True)
        except Exception:
            pass


def check_console_running():
    """
    Check if a Console server is already running.
    Returns (is_running: bool, url: str or None, port: int or None)
    """
    pid, port = read_pid_file()
    if pid is None:
        return False, None, None

    if not is_pid_running(pid):
        # Stale PID file, clean up
        cleanup_pid_file()
        return False, None, None

    # PID is running, verify it's actually our server by health check
    if port:
        url = f"http://localhost:{port}"
        try:
            req = urllib.request.Request(url, method="GET", headers={"Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    return True, url, port
        except Exception:
            pass

    # PID exists but health check failed — might be a different process
    # Don't clean up (could be starting up), but report as not running
    return False, None, None


def find_dist_dir():
    """Find console/dist directory relative to script location."""
    script_dir = Path(__file__).parent.resolve()
    skill_dir = script_dir.parent
    dist_dir = skill_dir / "console" / "dist"
    if dist_dir.exists() and (dist_dir / "index.html").exists():
        return dist_dir
    # Fallback: search up from CWD
    cwd = Path.cwd()
    for parent in [cwd] + list(cwd.parents):
        dist = parent / "console" / "dist"
        if dist.exists() and (dist / "index.html").exists():
            return dist
    return None


def get_available_port(start_port, max_attempts=10):
    """Find an available port, starting from start_port."""
    for offset in range(max_attempts):
        port = start_port + offset
        try:
            with socketserver.TCPServer(("", port), SimpleHTTPRequestHandler) as test_server:
                test_server.server_close()
                return port
        except OSError:
            continue
    return None


def get_parent_process_names():
    """Get parent process names using PowerShell (Windows)."""
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                f"""
                $pid = {os.getpid()};
                $names = @();
                for ($i = 0; $i -lt 5; $i++) {{
                    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$pid" -ErrorAction SilentlyContinue;
                    if (-not $proc) {{ break; }}
                    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)" -ErrorAction SilentlyContinue;
                    if (-not $parent) {{ break; }}
                    $names += $parent.Name;
                    $pid = $parent.ProcessId;
                    if ($pid -le 4) {{ break; }}
                }};
                $names -join ','
                """,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        names = result.stdout.strip().lower().split(",")
        return [n.strip() for n in names if n.strip()]
    except Exception:
        return []


def get_running_agent_process_names():
    """Return lower-cased process names for known local agent runtimes."""
    try:
        if sys.platform == "win32":
            result = subprocess.run(
                ["tasklist", "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                timeout=8,
            )
        else:
            result = subprocess.run(
                ["ps", "-A", "-o", "comm="],
                capture_output=True,
                text=True,
                timeout=5,
            )
        return result.stdout.lower()
    except Exception:
        return ""


def get_codex_command_and_version():
    """Return (command, version) for a runnable Codex CLI, or (None, None)."""
    global _CODEX_COMMAND_CACHE
    if _CODEX_COMMAND_CACHE:
        return _CODEX_COMMAND_CACHE

    candidates = []
    npm_vendor = (
        Path.home()
        / "AppData"
        / "Roaming"
        / "npm"
        / "node_modules"
        / "@openai"
        / "codex"
        / "node_modules"
        / "@openai"
        / "codex-win32-x64"
        / "vendor"
        / "x86_64-pc-windows-msvc"
        / "bin"
        / "codex.exe"
    )
    if npm_vendor.exists():
        candidates.append(str(npm_vendor))

    local_bin = Path.home() / "AppData" / "Local" / "OpenAI" / "Codex" / "bin"
    if local_bin.exists():
        for path in sorted(local_bin.glob("*/codex.exe"), reverse=True):
            text = str(path)
            if text not in candidates:
                candidates.append(text)

    for name in ("codex.cmd", "codex.exe", "codex"):
        path = shutil.which(name)
        if path and path not in candidates:
            candidates.append(path)

    for command in candidates:
        try:
            result = subprocess.run(
                [command, "--version"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=10,
            )
            if result.returncode == 0:
                version = result.stdout.strip() or "codex"
                _CODEX_COMMAND_CACHE = (command, version)
                return _CODEX_COMMAND_CACHE
        except Exception:
            continue
    return None, None


def get_codex_version():
    """Return the installed Codex CLI version, or None when Codex is unavailable."""
    return get_codex_command_and_version()[1]


def frontend_gateway_for_agent(agent):
    """Return the browser-facing gateway path for a discovered local partner."""
    env = agent.get("env")
    if env in LOCAL_AGENT_PATHS:
        return LOCAL_AGENT_PATHS[env]
    return f"/proxy/{env}"


def public_agent_payload(agents):
    """Return browser-safe agent metadata. Gateway tokens stay server-side."""
    payload = []
    for agent in agents:
        payload.append({
            "env": agent["env"],
            "gateway_url": frontend_gateway_for_agent(agent),
            "gateway_token": None,
            "status": agent["status"],
            "preferred": agent.get("preferred", False),
            "local": bool(agent.get("local")),
            "version": agent.get("version"),
        })
    return payload


def discover_all_agents():
    """
    Discover all configured and running Agent gateways.
    Returns a list of dicts: [{env, gateway_url, gateway_token, status}, ...]
    status: 'running' | 'configured'
    """
    home = Path.home()
    agents = []
    seen_urls = {}

    def add_agent(env, url, token=None, status="configured", preferred=False):
        if not env or not url:
            return
        normalized_url = str(url).rstrip("/")
        key = (env, normalized_url)
        existing = seen_urls.get(key)
        if existing:
            if token and not existing.get("gateway_token"):
                existing["gateway_token"] = token
            if status == "running":
                existing["status"] = "running"
            if preferred:
                existing["preferred"] = True
            return
        seen_urls[key] = {
            "env": env,
            "gateway_url": normalized_url,
            "gateway_token": token,
            "status": status,
            "preferred": bool(preferred),
        }

    # Helper to check health — verify it's a real Agent Gateway
    def check_health(url, token=None):
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        for timeout in (1.5, 5.0):
            try:
                req = urllib.request.Request(f"{url}/health", method="GET", headers=headers)
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    if resp.status != 200:
                        continue
                    body = resp.read().decode("utf-8", errors="replace")
                    data = json.loads(body) if body.strip() else {}
                    return isinstance(data, dict) and (
                        "version" in data
                        or "status" in data
                        or "gateway" in data
                        or data.get("ok") is True
                        or "service" in data
                        or "name" in data
                    )
            except Exception:
                continue
        return False

    def status_for(url, token=None):
        return "running" if check_health(url, token) else "configured"

    parents = get_parent_process_names()
    parent_str = " ".join(parents)
    launcher_env = None
    if "codex.exe" in parent_str or "codex" in parent_str:
        launcher_env = "codex"
    elif "hermes.exe" in parent_str or "hermes" in parent_str:
        launcher_env = "hermes"
    elif "workbuddy.exe" in parent_str or "workbuddy" in parent_str:
        launcher_env = "workbuddy"
    elif "qclaw.exe" in parent_str or "qclaw" in parent_str:
        launcher_env = "qclaw"
    elif "openclaw.exe" in parent_str or "openclaw" in parent_str:
        launcher_env = "openclaw"

    hermes_discovered = False

    # OpenClaw
    oc_cfg_path = home / ".openclaw" / "openclaw.json"
    if oc_cfg_path.exists():
        try:
            oc_cfg = json.loads(oc_cfg_path.read_text(encoding="utf-8"))
            port = oc_cfg.get("gateway", {}).get("port", 18789)
            auth = oc_cfg.get("gateway", {}).get("auth", {})
            token = auth.get("token") if auth.get("mode") == "token" else None
            url = f"http://127.0.0.1:{port}"
            add_agent("openclaw", url, token, status_for(url, token))
        except Exception:
            pass

    # WorkBuddy can share the OpenClaw gateway, but should not replace it.
    if oc_cfg_path.exists():
        try:
            oc_cfg = json.loads(oc_cfg_path.read_text(encoding="utf-8"))
            port = oc_cfg.get("gateway", {}).get("port", 18789)
            auth = oc_cfg.get("gateway", {}).get("auth", {})
            token = auth.get("token") if auth.get("mode") == "token" else None
            url = f"http://127.0.0.1:{port}"
            add_agent("workbuddy", url, token, status_for(url, token))
        except Exception:
            pass

    # QClaw
    qc_cfg_path = home / ".qclaw" / "openclaw.json"
    qc_meta_path = home / ".qclaw" / "qclaw.json"
    if qc_cfg_path.exists():
        try:
            qc_cfg = json.loads(qc_cfg_path.read_text(encoding="utf-8"))
            port = qc_cfg.get("gateway", {}).get("port", 28789)
            auth = qc_cfg.get("gateway", {}).get("auth", {})
            token = auth.get("token") if auth.get("mode") == "token" else None
            url = f"http://127.0.0.1:{port}"
            add_agent("qclaw", url, token, status_for(url, token))
        except Exception:
            pass
    elif qc_meta_path.exists():
        try:
            meta = json.loads(qc_meta_path.read_text(encoding="utf-8"))
            port = meta.get("port", 28789)
            url = f"http://127.0.0.1:{port}"
            add_agent("qclaw", url, None, status_for(url))
        except Exception:
            pass

    # Hermes (best-effort: supports common local JSON config shapes)
    hermes_cfg_paths = [
        home / ".hermes" / "hermes.json",
        home / ".hermes" / "config.json",
        home / ".config" / "hermes" / "config.json",
    ]
    for hermes_cfg_path in hermes_cfg_paths:
        if not hermes_cfg_path.exists():
            continue
        try:
            hermes_cfg = json.loads(hermes_cfg_path.read_text(encoding="utf-8"))
            raw_url = (
                hermes_cfg.get("gateway_url")
                or hermes_cfg.get("gatewayUrl")
                or hermes_cfg.get("gateway", {}).get("url")
                or hermes_cfg.get("server", {}).get("url")
            )
            port = (
                hermes_cfg.get("gateway", {}).get("port")
                or hermes_cfg.get("server", {}).get("port")
                or hermes_cfg.get("api", {}).get("port")
                or 17889
            )
            token = (
                hermes_cfg.get("gateway", {}).get("token")
                or hermes_cfg.get("gateway", {}).get("auth", {}).get("token")
                or hermes_cfg.get("auth", {}).get("token")
            )
            url = str(raw_url).rstrip("/") if raw_url else f"http://127.0.0.1:{port}"
            add_agent("hermes", url, token, status_for(url, token))
            hermes_discovered = True
            break
        except Exception:
            pass

    running_process_names = get_running_agent_process_names()
    if not hermes_discovered and "hermes" in running_process_names:
        openclaw_agent = next((a for a in seen_urls.values() if a["env"] == "openclaw"), None)
        if openclaw_agent and openclaw_agent["status"] == "running":
            add_agent(
                "hermes",
                openclaw_agent["gateway_url"],
                openclaw_agent.get("gateway_token"),
                "running",
                True,
            )
        else:
            for port in (17889, 18789):
                url = f"http://127.0.0.1:{port}"
                if check_health(url):
                    add_agent("hermes", url, None, "running", True)
                    break

    codex_version = get_codex_version()
    if codex_version:
        add_agent("codex", "local://codex", None, "running", launcher_env == "codex")
        seen_urls[("codex", "local://codex")]["version"] = codex_version
        seen_urls[("codex", "local://codex")]["local"] = True

    # Build agents list from discovered runtime aliases.
    for info in seen_urls.values():
        if launcher_env and info["env"] == launcher_env:
            info["preferred"] = True
        agents.append(info)

    # Sort: preferred first, then running, then others
    agents.sort(key=lambda a: (not a.get("preferred", False), a["status"] != "running", a["env"]))
    return agents


def discover_models_from_config():
    """
    Read actual model configurations from OpenClaw/WorkBuddy config.
    Returns {llm: [...], image: [...], defaults: {llm: str|None, image: str|None}}
    """
    home = Path.home()
    oc_cfg_path = home / ".openclaw" / "openclaw.json"
    if not oc_cfg_path.exists():
        return None
    try:
        cfg = json.loads(oc_cfg_path.read_text(encoding="utf-8"))
        providers = cfg.get("models", {}).get("providers", {})
        defaults = cfg.get("agents", {}).get("defaults", {}).get("model", {})
        primary = defaults.get("primary")
        fallbacks = defaults.get("fallbacks", [])

        llm_models = []
        image_models = []
        seen_ids = set()

        # Heuristic keywords for image generation models
        IMAGE_KEYWORDS = ["seed", "image", "flux", "imagen", "dall", "seedream", "picture", "drawing", "art", "generation", "sdxl", "stable-diffusion"]

        for provider_name, provider_cfg in providers.items():
            for m in provider_cfg.get("models", []):
                model_id = m.get("id", "")
                full_id = f"{provider_name}/{model_id}" if "/" not in model_id else model_id
                if full_id in seen_ids:
                    continue
                seen_ids.add(full_id)

                name = m.get("name") or model_id
                inputs = m.get("input", [])
                desc_parts = []
                if inputs:
                    desc_parts.append(", ".join(inputs))
                if m.get("reasoning"):
                    desc_parts.append("reasoning")
                desc = " · ".join(desc_parts) if desc_parts else ""

                model_entry = {
                    "id": full_id,
                    "name": name,
                    "provider": provider_name,
                    "icon": "🧠",
                    "desc": desc,
                }
                llm_models.append(model_entry)

                # Heuristic: check if model name/id suggests image generation
                lower_name = (name + " " + model_id).lower()
                if any(kw in lower_name for kw in IMAGE_KEYWORDS):
                    image_models.append({**model_entry, "icon": "🎨"})

        # Determine defaults
        default_llm = primary
        if default_llm and default_llm not in seen_ids:
            matched = next(
                (
                    item["id"]
                    for item in llm_models
                    if item["id"] == default_llm or item["id"].split("/")[-1] == default_llm
                ),
                None,
            )
            if matched:
                default_llm = matched
        if default_llm and not any(item["id"] == default_llm for item in llm_models):
            provider_name = default_llm.split("/")[0] if "/" in default_llm else "agent-default"
            model_name = default_llm.split("/")[-1]
            llm_models.insert(0, {
                "id": default_llm,
                "name": model_name,
                "provider": provider_name,
                "icon": "AI",
                "desc": "Agent 默认文字模型",
            })
        default_image = None
        # Prefer an image-heuristic model as default image model
        if image_models:
            default_image = image_models[0]["id"]

        return {
            "llm": llm_models,
            "image": image_models,
            "defaults": {"llm": default_llm, "image": default_image},
        }
    except Exception:
        return None


def inject_agents_into_html(dist_dir, agents):
    """
    Inject detected agents into index.html so Console can read them even without URL params.
    Gateway URLs are rewritten to /proxy/{env} so Console accesses them same-origin.
    """
    index_path = Path(dist_dir) / "index.html"
    if not index_path.exists():
        return
    try:
        html = index_path.read_text(encoding="utf-8")
        # Remove any previous injection
        html = re.sub(r'<script>window\.__AGENTS__ = .*?</script>\s*', '', html)
        html = re.sub(r'<script>window\.__AGENT_MAP__ = .*?</script>\s*', '', html)
        html = re.sub(r'<script>window\.__MODELS__ = .*?</script>\s*', '', html)

        # Build proxy agent list (frontend uses /proxy/{env})
        agent_map = {}
        for a in agents:
            if not a.get("local"):
                agent_map[a["env"]] = a["gateway_url"]

        # Inject agent map for proxy handler
        map_json = json.dumps(agent_map)
        map_injection = f'<script>window.__AGENT_MAP__ = {map_json};</script>\n'

        # Inject proxy agent list for frontend
        agents_json = json.dumps(public_agent_payload(agents))
        agents_injection = f'<script>window.__AGENTS__ = {agents_json};</script>\n'

        # Inject actual models from OpenClaw config
        models_data = discover_models_from_config()
        models_injection = ""
        if models_data:
            models_json = json.dumps(models_data)
            models_injection = f'<script>window.__MODELS__ = {models_json};</script>\n'

        injection = map_injection + agents_injection + models_injection
        if '</head>' in html:
            html = html.replace('</head>', injection + '</head>', 1)
        elif '<body>' in html:
            html = html.replace('<body>', injection + '<body>', 1)
        index_path.write_text(html, encoding="utf-8")
    except Exception as e:
        print(f"   ⚠️  Warning: Could not inject agents into index.html: {e}", file=sys.stderr)


class ProxyHandler(SimpleHTTPRequestHandler):
    """
    Static file handler + reverse proxy to Agent Gateways at /proxy/{env}/*.
    This bypasses browser CORS restrictions by making Gateway requests same-origin.
    """

    agent_map = {}
    agent_token_map = {}
    handoff_root = PARTNER_HANDOFF_ROOT

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/local-agents':
            self._local_agents_list()
        elif parsed.path == '/local-models':
            self._local_models_list()
        elif parsed.path == '/local-codex/health':
            self._local_codex_health()
        elif parsed.path == '/local-handoff/latest':
            self._local_handoff_latest(parsed)
        elif parsed.path == '/local-handoff/list':
            self._local_handoff_list(parsed)
        elif parsed.path.startswith('/proxy/'):
            self._proxy('GET')
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/local-handoff/save':
            self._local_handoff_save()
        elif parsed.path == '/local-handoff/claim':
            self._local_handoff_claim()
        elif parsed.path == '/local-handoff/status':
            self._local_handoff_status()
        elif parsed.path == '/local-gdpro/sync':
            self._local_gdpro_sync()
        elif parsed.path == '/local-codex/chat':
            self._local_codex_chat()
        elif parsed.path == '/local-codex/exec':
            self._local_codex_exec()
        elif parsed.path == '/local-codex/generate-image':
            self._local_codex_generate_image()
        elif parsed.path == '/local-codex/fs/read':
            self._local_codex_fs_read()
        elif parsed.path == '/local-codex/fs/write':
            self._local_codex_fs_write()
        elif parsed.path == '/local-codex/fs/list':
            self._local_codex_fs_list()
        elif parsed.path == '/local-codex/fs/exists':
            self._local_codex_fs_exists()
        elif parsed.path == '/local-codex/fs/sync-gdpro':
            self._local_gdpro_sync()
        elif parsed.path.startswith('/proxy/'):
            self._proxy('POST')
        else:
            super().do_POST()

    def do_PUT(self):
        if self.path.startswith('/proxy/'):
            self._proxy('PUT')
        else:
            self.send_error(405)

    def do_PATCH(self):
        if self.path.startswith('/proxy/'):
            self._proxy('PATCH')
        else:
            self.send_error(405)

    def do_DELETE(self):
        if self.path.startswith('/proxy/'):
            self._proxy('DELETE')
        else:
            self.send_error(405)

    def do_OPTIONS(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/proxy/') or parsed.path.startswith('/local-handoff/') or parsed.path.startswith('/local-gdpro/') or parsed.path.startswith('/local-codex/'):
            # Always allow CORS for local service paths (same-origin to frontend)
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.end_headers()
        else:
            super().do_OPTIONS()

    def _send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            return {}
        if content_length > 2_000_000:
            raise ValueError("Request body is too large")
        raw = self.rfile.read(content_length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _local_agents_list(self):
        try:
            agents = discover_all_agents()
            models = discover_models_from_config()
            self._send_json(200, {
                "success": True,
                "agents": public_agent_payload(agents),
                "models": models,
            })
        except Exception as exc:
            self._send_json(500, {
                "success": False,
                "agents": [],
                "error": str(exc),
            })

    def _local_models_list(self):
        try:
            models = discover_models_from_config()
            self._send_json(200, {
                "success": True,
                "models": models,
            })
        except Exception as exc:
            self._send_json(500, {
                "success": False,
                "models": None,
                "error": str(exc),
            })

    def _safe_gdpro_path(self, rel_path):
        if not isinstance(rel_path, str) or not rel_path.strip():
            return None
        text = urllib.parse.unquote(rel_path.strip()).replace("\\", "/")
        if not text.startswith(".gdpro/"):
            return None
        target = (REPO_ROOT / text).resolve()
        root = (REPO_ROOT / ".gdpro").resolve()
        try:
            target.relative_to(root)
        except ValueError:
            return None
        return target

    def _local_gdpro_sync(self):
        try:
            body = self._read_json_body()
        except Exception as exc:
            self._send_json(400, {"success": False, "error": f"Invalid JSON: {exc}"})
            return

        files = body.get("files") if isinstance(body, dict) else None
        if not isinstance(files, dict):
            self._send_json(400, {"success": False, "error": "Missing files map"})
            return

        written = []
        rejected = []
        for rel_path, content in files.items():
            target = self._safe_gdpro_path(rel_path)
            if target is None:
                rejected.append(str(rel_path))
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(content, (dict, list)):
                data = json.dumps(content, ensure_ascii=False, indent=2)
            else:
                data = str(content if content is not None else "")
            target.write_text(data, encoding="utf-8")
            written.append(str(rel_path).replace("\\", "/"))

        self._send_json(200, {
            "success": True,
            "written": written,
            "rejected": rejected,
        })

    def _local_codex_health(self):
        version = get_codex_version()
        if not version:
            self._send_json(503, {
                "ok": False,
                "service": "codex",
                "status": "missing",
                "schemaVersion": CODEX_SERVICE_SCHEMA_VERSION,
                "error": "Codex CLI was not found on PATH",
            })
            return
        self._send_json(200, {
            "ok": True,
            "service": "codex",
            "name": "Local Codex CLI",
            "status": "live",
            "version": version,
            "schemaVersion": CODEX_SERVICE_SCHEMA_VERSION,
            "capabilities": ["chat", "exec", "fs.read", "fs.write", "fs.list", "fs.sync-gdpro"],
        })

    def _run_codex_exec(self, prompt, *, model=None, timeout_seconds=180):
        codex_command, version = get_codex_command_and_version()
        if not codex_command or not version:
            return {
                "success": False,
                "exitCode": None,
                "text": "",
                "stdout": "",
                "stderr": "Codex CLI was not found on PATH",
                "durationMs": 0,
                "version": None,
            }

        timeout_seconds = max(30, min(600, int(timeout_seconds or 180)))
        output_path = None
        started = time.time()
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as output_file:
                output_path = Path(output_file.name)

            cmd = [
                codex_command,
                "exec",
                "--cd",
                str(REPO_ROOT),
                "-s",
                "read-only",
                "--ephemeral",
                "--ignore-rules",
                "--disable",
                "plugins",
                "--disable",
                "memories",
                "-c",
                "notify=[]",
                "-c",
                'model_reasoning_effort="low"',
                "--color",
                "never",
                "--output-last-message",
                str(output_path),
                "-",
            ]
            if model:
                cmd[2:2] = ["--model", str(model)]

            env = os.environ.copy()
            env.setdefault("NO_COLOR", "1")
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
            )
            try:
                stdout, stderr = proc.communicate(str(prompt or ""), timeout=timeout_seconds)
                timed_out = False
            except subprocess.TimeoutExpired:
                timed_out = True
                if sys.platform == "win32":
                    subprocess.run(
                        ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                        capture_output=True,
                        timeout=10,
                    )
                else:
                    proc.kill()
                try:
                    stdout, stderr = proc.communicate(timeout=10)
                except Exception:
                    stdout, stderr = "", ""

            final_text = ""
            if output_path and output_path.exists():
                final_text = output_path.read_text(encoding="utf-8", errors="replace").strip()
            if not final_text:
                final_text = (stdout or "").strip()
            return {
                "success": proc.returncode == 0 or (timed_out and bool(final_text)),
                "exitCode": proc.returncode,
                "text": final_text,
                "stdout": stdout or "",
                "stderr": stderr or (f"Codex timed out after {timeout_seconds}s" if timed_out else ""),
                "durationMs": int((time.time() - started) * 1000),
                "version": version,
                "timedOut": timed_out,
            }
        except subprocess.TimeoutExpired as exc:
            stdout = exc.stdout or ""
            stderr = exc.stderr or ""
            if isinstance(stdout, bytes):
                stdout = stdout.decode("utf-8", errors="replace")
            if isinstance(stderr, bytes):
                stderr = stderr.decode("utf-8", errors="replace")
            final_text = ""
            if output_path and output_path.exists():
                try:
                    final_text = output_path.read_text(encoding="utf-8", errors="replace").strip()
                except Exception:
                    final_text = ""
            if not final_text:
                final_text = str(stdout or "").strip()
            return {
                "success": bool(final_text),
                "exitCode": None,
                "text": final_text,
                "stdout": stdout,
                "stderr": str(stderr or f"Codex timed out after {timeout_seconds}s"),
                "durationMs": int((time.time() - started) * 1000),
                "version": version,
                "timedOut": True,
            }
        except Exception as exc:
            return {
                "success": False,
                "exitCode": None,
                "text": "",
                "stdout": "",
                "stderr": str(exc),
                "durationMs": int((time.time() - started) * 1000),
                "version": version,
            }
        finally:
            if output_path:
                try:
                    output_path.unlink(missing_ok=True)
                except Exception:
                    pass

    def _strip_code_fence(self, text):
        cleaned = str(text or "").strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        return cleaned.strip()

    def _parse_codex_json_response(self, text):
        cleaned = self._strip_code_fence(text)
        try:
            return json.loads(cleaned)
        except Exception:
            pass
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(cleaned[start:end + 1])
            except Exception:
                return None
        return None

    def _build_codex_chat_prompt(self, body):
        public_body = {
            "projectId": body.get("projectId"),
            "message": body.get("message"),
            "llm": body.get("llm"),
            "imageModel": body.get("imageModel"),
            "imageModelConfig": body.get("imageModelConfig"),
            "action": body.get("action"),
            "contextSummary": body.get("contextSummary"),
            "controlState": body.get("controlState"),
            "references": body.get("references"),
            "assets": body.get("assets"),
        }
        payload = json.dumps(public_body, ensure_ascii=False, indent=2)
        system_prompt = str(body.get("systemPrompt") or "").strip()
        return f"""You are Codex running as the local partner inside Graphic Design Pro Console.

Work as a design-production copilot. Use the project context to answer the user and, when useful, return deterministic GUI instructions under agentControl.

Rules:
- Do not edit repository files or run destructive commands.
- Return exactly one JSON object and no surrounding prose.
- The JSON object must include "text" as Markdown for the user.
- Optional "agentControl" may include schemaVersion "gdpro.agent-control.v1", documents, brandKit, operations, risks, and events.
- Prefer small auditable operations over broad rewrites. If you are unsure, explain the smallest next step in text.
- Codex can reason, plan, inspect context, and produce structured instructions. It does not directly generate bitmap images here; use the configured image channel for image assets.

Design system prompt from the console:
{system_prompt}

Request payload:
{payload}
"""

    def _local_codex_chat(self):
        try:
            body = self._read_json_body()
        except Exception as exc:
            self._send_json(400, {"success": False, "error": f"Invalid JSON: {exc}"})
            return
        if not isinstance(body, dict):
            self._send_json(400, {"success": False, "error": "Missing chat payload"})
            return

        prompt = self._build_codex_chat_prompt(body)
        result = self._run_codex_exec(
            prompt,
            model=body.get("codexModel") or body.get("llm") or None,
            timeout_seconds=body.get("timeoutSeconds") or 240,
        )
        if not result.get("success"):
            self._send_json(502, {
                "success": False,
                "service": "codex",
                "error": result.get("stderr") or "Codex execution failed",
                "stdout": result.get("stdout", "")[-4000:],
                "durationMs": result.get("durationMs"),
            })
            return

        parsed = self._parse_codex_json_response(result.get("text"))
        if isinstance(parsed, dict):
            response = parsed
            response.setdefault("text", result.get("text") or "")
        else:
            response = {"text": result.get("text") or ""}
        response["codex"] = {
            "schemaVersion": CODEX_SERVICE_SCHEMA_VERSION,
            "version": result.get("version"),
            "durationMs": result.get("durationMs"),
        }
        self._send_json(200, response)

    def _local_codex_exec(self):
        try:
            body = self._read_json_body()
        except Exception as exc:
            self._send_json(400, {"success": False, "error": f"Invalid JSON: {exc}"})
            return
        if not isinstance(body, dict):
            self._send_json(400, {"success": False, "error": "Missing exec payload"})
            return
        prompt = body.get("prompt") or body.get("message") or body.get("instruction") or ""
        if not str(prompt).strip():
            self._send_json(400, {"success": False, "error": "Missing prompt"})
            return
        result = self._run_codex_exec(
            prompt,
            model=body.get("model") or None,
            timeout_seconds=body.get("timeoutSeconds") or 180,
        )
        status = 200 if result.get("success") else 502
        self._send_json(status, {
            "service": "codex",
            "schemaVersion": CODEX_SERVICE_SCHEMA_VERSION,
            **result,
        })

    def _local_codex_generate_image(self):
        self._send_json(501, {
            "success": False,
            "service": "codex",
            "error": "Codex is connected for reasoning and execution. Use a configured image channel for bitmap image generation.",
        })

    def _local_codex_fs_read(self):
        try:
            body = self._read_json_body()
            target = self._safe_gdpro_path(body.get("path") if isinstance(body, dict) else "")
            if target is None:
                self._send_json(400, {"exists": False, "error": "Invalid .gdpro path"})
                return
            if not target.exists() or not target.is_file():
                self._send_json(200, {"exists": False, "content": ""})
                return
            self._send_json(200, {"exists": True, "content": target.read_text(encoding="utf-8", errors="replace")})
        except Exception as exc:
            self._send_json(500, {"exists": False, "error": str(exc)})

    def _local_codex_fs_write(self):
        try:
            body = self._read_json_body()
            target = self._safe_gdpro_path(body.get("path") if isinstance(body, dict) else "")
            if target is None:
                self._send_json(400, {"success": False, "error": "Invalid .gdpro path"})
                return
            content = body.get("content", "") if isinstance(body, dict) else ""
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(str(content), encoding="utf-8")
            self._send_json(200, {"success": True, "path": str(body.get("path")).replace("\\", "/")})
        except Exception as exc:
            self._send_json(500, {"success": False, "error": str(exc)})

    def _local_codex_fs_list(self):
        try:
            body = self._read_json_body()
            target = self._safe_gdpro_path(body.get("path") if isinstance(body, dict) else "")
            if target is None:
                self._send_json(400, {"entries": [], "error": "Invalid .gdpro path"})
                return
            if not target.exists() or not target.is_dir():
                self._send_json(200, {"entries": []})
                return
            entries = []
            for item in sorted(target.iterdir(), key=lambda entry: entry.name.lower()):
                entries.append({
                    "name": item.name,
                    "type": "dir" if item.is_dir() else "file",
                })
            self._send_json(200, {"entries": entries})
        except Exception as exc:
            self._send_json(500, {"entries": [], "error": str(exc)})

    def _local_codex_fs_exists(self):
        try:
            body = self._read_json_body()
            target = self._safe_gdpro_path(body.get("path") if isinstance(body, dict) else "")
            if target is None:
                self._send_json(400, {"exists": False, "error": "Invalid .gdpro path"})
                return
            self._send_json(200, {"exists": target.exists()})
        except Exception as exc:
            self._send_json(500, {"exists": False, "error": str(exc)})

    def _slug_text(self, value, fallback="project"):
        text = str(value or fallback).strip().lower()
        text = re.sub(r"[^a-z0-9\u4e00-\u9fa5]+", "-", text)
        text = re.sub(r"^-+|-+$", "", text)
        return text[:80] or fallback

    def _safe_handoff_path(self, rel_path):
        if not isinstance(rel_path, str) or not rel_path.strip():
            return None
        text = urllib.parse.unquote(rel_path.strip()).replace("\\", "/")
        while text.startswith("/"):
            text = text[1:]
        if text.startswith(".gdpro/partner-handoffs/"):
            text = text[len(".gdpro/partner-handoffs/"):]
        elif text.startswith("partner-handoffs/"):
            text = text[len("partner-handoffs/"):]
        else:
            return None

        root = self.handoff_root.resolve()
        candidate = (root / text).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            return None
        return candidate

    def _handoff_rel_path(self, path):
        root = self.handoff_root.resolve()
        try:
            rel = path.resolve().relative_to(root)
        except ValueError:
            return ""
        return ".gdpro/partner-handoffs/" + str(rel).replace("\\", "/")

    def _load_json_file(self, path):
        return json.loads(path.read_text(encoding="utf-8"))

    def _latest_handoff_candidate(self, parsed):
        query = urllib.parse.parse_qs(parsed.query)
        requested_path = (query.get("path") or [""])[0]
        if requested_path:
            return self._safe_handoff_path(requested_path)

        project_id = (query.get("project") or [""])[0]
        if project_id:
            project_slug = self._slug_text(project_id)
            candidate = (self.handoff_root / project_slug / "latest.json").resolve()
            try:
                candidate.relative_to(self.handoff_root.resolve())
            except ValueError:
                return None
            return candidate

        latest_files = list(self.handoff_root.glob("*/latest.json")) if self.handoff_root.exists() else []
        if not latest_files:
            return None
        return max(latest_files, key=lambda item: item.stat().st_mtime)

    def _local_handoff_latest(self, parsed):
        candidate = self._latest_handoff_candidate(parsed)
        if not candidate or not candidate.exists() or candidate.suffix.lower() != ".json":
            self._send_json(200, {"success": True, "exists": False})
            return
        try:
            task = self._load_json_file(candidate)
            self._send_json(200, {
                "success": True,
                "exists": True,
                "path": self._handoff_rel_path(candidate),
                "task": task,
            })
        except Exception as e:
            self._send_json(500, {"success": False, "error": str(e)})

    def _local_handoff_list(self, parsed):
        try:
            query = urllib.parse.parse_qs(parsed.query)
            project_id = (query.get("project") or [""])[0]
            limit_raw = (query.get("limit") or ["8"])[0]
            try:
                limit = max(1, min(20, int(limit_raw)))
            except ValueError:
                limit = 8

            root = self.handoff_root.resolve()
            if project_id:
                project_slug = self._slug_text(project_id)
                project_dirs = [(root / project_slug).resolve()]
            else:
                project_dirs = [item.resolve() for item in root.iterdir() if item.is_dir()] if root.exists() else []

            tasks = []
            receipts = []
            for project_dir in project_dirs:
                try:
                    project_dir.relative_to(root)
                except ValueError:
                    continue
                if not project_dir.exists():
                    continue

                for task_path in project_dir.glob("*.json"):
                    if task_path.name in ("latest.json", "latest-receipt.json"):
                        continue
                    try:
                        task = self._load_json_file(task_path)
                        updated_at = datetime.fromtimestamp(task_path.stat().st_mtime, timezone.utc) \
                            .replace(microsecond=0) \
                            .isoformat() \
                            .replace("+00:00", "Z")
                        tasks.append({
                            "path": self._handoff_rel_path(task_path),
                            "updatedAt": updated_at,
                            "sortAt": task.get("createdAt") or updated_at,
                            "task": task,
                        })
                    except Exception:
                        continue

                receipt_root = project_dir / "receipts"
                if receipt_root.exists():
                    for receipt_path in receipt_root.glob("*.json"):
                        try:
                            receipt = self._load_json_file(receipt_path)
                            receipts.append({
                                "path": self._handoff_rel_path(receipt_path),
                                "updatedAt": datetime.fromtimestamp(receipt_path.stat().st_mtime, timezone.utc)
                                    .replace(microsecond=0)
                                    .isoformat()
                                    .replace("+00:00", "Z"),
                                "receipt": receipt,
                            })
                        except Exception:
                            continue

            tasks.sort(key=lambda item: item.get("sortAt", ""), reverse=True)
            receipts.sort(key=lambda item: item.get("updatedAt", ""), reverse=True)
            self._send_json(200, {
                "success": True,
                "tasks": [{key: value for key, value in item.items() if key != "sortAt"} for item in tasks[:limit]],
                "receipts": receipts[:limit],
            })
        except Exception as e:
            self._send_json(500, {"success": False, "error": str(e)})

    def _local_handoff_save(self):
        try:
            payload = self._read_json_body()
            task = payload.get("task") if isinstance(payload, dict) else None
            if not isinstance(task, dict):
                self._send_json(400, {"success": False, "error": "Missing handoff task"})
                return

            raw_paths = [task.get("primaryPath"), task.get("latestPath")]
            targets = []
            for rel_path in raw_paths:
                target = self._safe_handoff_path(rel_path)
                if target and target.suffix.lower() == ".json" and target not in targets:
                    targets.append(target)
            if not targets:
                self._send_json(400, {"success": False, "error": "Missing valid handoff path"})
                return

            task_to_write = {
                **task,
                "localConsole": {
                    "savedAt": utc_now_iso(),
                    "state": "saved-on-this-workstation",
                },
            }
            content = json.dumps(task_to_write, ensure_ascii=False, indent=2)
            written = []
            for target in targets:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
                written.append(self._handoff_rel_path(target))

            self._send_json(200, {
                "success": True,
                "written": written,
                "primaryPath": task.get("primaryPath"),
                "latestPath": task.get("latestPath"),
            })
        except Exception as e:
            self._send_json(500, {"success": False, "error": str(e)})

    def _local_handoff_claim(self):
        try:
            payload = self._read_json_body()
            task_path = payload.get("path") if isinstance(payload, dict) else ""
            project_id = payload.get("projectId") if isinstance(payload, dict) else ""
            candidate = self._safe_handoff_path(task_path)
            if not candidate and project_id:
                project_slug = self._slug_text(project_id)
                candidate = (self.handoff_root / project_slug / "latest.json").resolve()
                try:
                    candidate.relative_to(self.handoff_root.resolve())
                except ValueError:
                    candidate = None

            if not candidate or not candidate.exists() or candidate.suffix.lower() != ".json":
                self._send_json(200, {"success": True, "exists": False})
                return

            task = self._load_json_file(candidate)
            task_id = self._slug_text(task.get("id") or candidate.stem, fallback="handoff")
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            receipt_dir = candidate.parent / "receipts"
            receipt_path = (receipt_dir / f"{task_id}-{stamp}.json").resolve()
            try:
                receipt_path.relative_to(self.handoff_root.resolve())
            except ValueError:
                self._send_json(400, {"success": False, "error": "Invalid receipt path"})
                return

            receipt = {
                "schemaVersion": PARTNER_RECEIPT_SCHEMA_VERSION,
                "createdAt": utc_now_iso(),
                "action": "continue-requested",
                "taskId": task.get("id") or candidate.stem,
                "taskPath": self._handoff_rel_path(candidate),
                "queueStatus": task.get("queueStatus") or "",
                "project": task.get("project") or {"id": project_id or ""},
                "requestedBy": "console",
            }
            receipt_dir.mkdir(parents=True, exist_ok=True)
            receipt_content = json.dumps(receipt, ensure_ascii=False, indent=2)
            receipt_path.write_text(receipt_content, encoding="utf-8")
            latest_receipt = (candidate.parent / "latest-receipt.json").resolve()
            latest_receipt.write_text(receipt_content, encoding="utf-8")

            self._send_json(200, {
                "success": True,
                "exists": True,
                "path": self._handoff_rel_path(candidate),
                "receiptPath": self._handoff_rel_path(receipt_path),
                "task": task,
            })
        except Exception as e:
            self._send_json(500, {"success": False, "error": str(e)})

    def _local_handoff_status(self):
        try:
            payload = self._read_json_body()
            task_path = payload.get("path") if isinstance(payload, dict) else ""
            project_id = payload.get("projectId") if isinstance(payload, dict) else ""
            requested_status = payload.get("status") if isinstance(payload, dict) else ""
            note = str(payload.get("note") or "")[:400] if isinstance(payload, dict) else ""
            allowed_statuses = {"saved", "in-progress", "completed", "needs-help"}
            if requested_status not in allowed_statuses:
                self._send_json(400, {"success": False, "error": "Invalid status"})
                return

            candidate = self._safe_handoff_path(task_path)
            if not candidate and project_id:
                project_slug = self._slug_text(project_id)
                candidate = (self.handoff_root / project_slug / "latest.json").resolve()
                try:
                    candidate.relative_to(self.handoff_root.resolve())
                except ValueError:
                    candidate = None

            if not candidate or not candidate.exists() or candidate.suffix.lower() != ".json":
                self._send_json(200, {"success": True, "exists": False})
                return

            task = self._load_json_file(candidate)
            now = utc_now_iso()
            task_id = self._slug_text(task.get("id") or candidate.stem, fallback="handoff")
            status_record = {
                "schemaVersion": PARTNER_RECEIPT_SCHEMA_VERSION,
                "createdAt": now,
                "action": "status-updated",
                "taskId": task.get("id") or candidate.stem,
                "taskPath": self._handoff_rel_path(candidate),
                "status": requested_status,
                "note": note,
                "requestedBy": "console",
            }
            updated_task = {
                **task,
                "localConsole": {
                    **(task.get("localConsole") if isinstance(task.get("localConsole"), dict) else {}),
                    "workStatus": requested_status,
                    "statusUpdatedAt": now,
                    "statusNote": note,
                },
            }
            content = json.dumps(updated_task, ensure_ascii=False, indent=2)
            candidate.write_text(content, encoding="utf-8")

            latest_path = (candidate.parent / "latest.json").resolve()
            try:
                latest_path.relative_to(self.handoff_root.resolve())
                latest_task = self._load_json_file(latest_path) if latest_path.exists() else None
                if not isinstance(latest_task, dict) or latest_task.get("id") == task.get("id"):
                    latest_path.write_text(content, encoding="utf-8")
            except Exception:
                pass

            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            status_dir = candidate.parent / "status"
            status_path = (status_dir / f"{task_id}-{stamp}.json").resolve()
            try:
                status_path.relative_to(self.handoff_root.resolve())
            except ValueError:
                self._send_json(400, {"success": False, "error": "Invalid status path"})
                return
            status_dir.mkdir(parents=True, exist_ok=True)
            status_content = json.dumps(status_record, ensure_ascii=False, indent=2)
            status_path.write_text(status_content, encoding="utf-8")
            latest_status = (candidate.parent / "latest-status.json").resolve()
            latest_status.write_text(status_content, encoding="utf-8")

            self._send_json(200, {
                "success": True,
                "exists": True,
                "path": self._handoff_rel_path(candidate),
                "statusPath": self._handoff_rel_path(status_path),
                "status": requested_status,
                "task": updated_task,
            })
        except Exception as e:
            self._send_json(500, {"success": False, "error": str(e)})

    def _proxy(self, method):
        # Parse /proxy/{env}/path
        parts = self.path.split('/', 3)
        if len(parts) < 3 or not parts[2]:
            self.send_error(404, "Missing agent env in proxy path")
            return
        env = parts[2]
        target_path = '/' + parts[3] if len(parts) > 3 else '/'

        gateway_url = self.agent_map.get(env)
        if not gateway_url:
            self.send_error(404, f"Unknown agent env: {env}")
            return

        target_url = f"{gateway_url}{target_path}"
        try:
            req = urllib.request.Request(target_url, method=method)
            # Copy relevant headers
            for header in ['Content-Type', 'Authorization']:
                value = self.headers.get(header)
                if value:
                    req.add_header(header, value)
            if not self.headers.get('Authorization'):
                token = self.agent_token_map.get(env)
                if token:
                    req.add_header('Authorization', f'Bearer {token}')
            # Copy body for non-GET methods
            if method in ('POST', 'PUT', 'PATCH'):
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 0:
                    req.data = self.rfile.read(content_length)

            resp = urllib.request.urlopen(req, timeout=60)
            self.send_response(resp.status)
            for key, value in resp.headers.items():
                if key.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for key, value in e.headers.items():
                if key.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            msg = str(e).encode('ascii', 'replace').decode('ascii')
            self.send_error(502, msg)


def build_console_url(base_url, agents, args):
    """Build the full Console URL with appropriate query parameters."""
    running_agents = [a for a in agents if a["status"] == "running"]
    url = base_url

    if args.gateway:
        params = [f"gateway={urllib.parse.quote(args.gateway, safe=':/')}"]
        if args.token:
            params.append(f"token={urllib.parse.quote(args.token, safe='')}")
        if args.env:
            params.append(f"env={urllib.parse.quote(args.env, safe='')}")
        url = f"{url}?{'&'.join(params)}"
    elif len(running_agents) == 1:
        agent = running_agents[0]
        proxy_url = frontend_gateway_for_agent(agent)
        params = [f"gateway={urllib.parse.quote(proxy_url, safe='/')}"]
        params.append(f"env={urllib.parse.quote(agent['env'], safe='')}")
        url = f"{url}?{'&'.join(params)}"
    elif len(agents) > 0:
        agents_payload = base64.b64encode(json.dumps(public_agent_payload(agents)).encode("utf-8")).decode("utf-8")
        params = [f"agents={urllib.parse.quote(agents_payload, safe='')}"]
        url = f"{url}?{'&'.join(params)}"

    return url


def print_startup_info(dist_dir, agents, url, args, silent=False):
    """Print startup information (suppressed in silent mode)."""
    if silent:
        return

    running_agents = [a for a in agents if a["status"] == "running"]

    print(f"\n🎨 Graphic Design Pro Console")
    print(f"   Serving: {dist_dir}")

    if args.gateway:
        print(f"   Agent:   {args.env or 'unknown'} (override)")
        print(f"   Gateway: {args.gateway}")
    elif len(running_agents) == 1:
        agent = running_agents[0]
        frontend_gateway = frontend_gateway_for_agent(agent)
        print(f"   Agent:   {agent['env']}")
        if agent.get("local"):
            print(f"   Gateway: {frontend_gateway} (local service)")
        else:
            print(f"   Gateway: {agent['gateway_url']} (proxied via {frontend_gateway})")
        if agent.get("gateway_token"):
            mask = "*" * min(len(agent["gateway_token"]), 8)
            print(f"   Token:   {mask}")
    elif len(agents) > 0:
        print(f"   Detected {len(agents)} agent(s):")
        for a in agents:
            status_icon = "🟢" if a["status"] == "running" else "⚪"
            pref = " ← 启动来源" if a.get("preferred") else ""
            frontend_gateway = frontend_gateway_for_agent(a)
            print(f"     {status_icon} {a['env']:12} {a['gateway_url']} → {frontend_gateway}{pref}")
    else:
        print(f"   ⚠️  未检测到任何 Agent Gateway")

    print(f"   URL:     {url}")
    print(f"   Press Ctrl+C to stop\n")


def main():
    parser = argparse.ArgumentParser(description="Launch Graphic Design Pro Console")
    parser.add_argument("--port", type=int, default=3005, help="Server port (default: 3005)")
    parser.add_argument("--no-open", action="store_true", help="Don't open browser automatically")
    parser.add_argument("--silent", action="store_true", help="Silent mode: start in background, no browser, minimal output")
    parser.add_argument("--status", action="store_true", help="Check if Console server is running, print URL and exit")
    parser.add_argument("--stop", action="store_true", help="Stop a running Console server")
    parser.add_argument("--gateway", type=str, default=None, help="Gateway URL override")
    parser.add_argument("--token", type=str, default=None, help="Gateway token override")
    parser.add_argument("--env", type=str, default=None, help="Agent environment override")
    args = parser.parse_args()

    # ─── Handle --status ──────────────────────────────────
    if args.status:
        is_running, url, port = check_console_running()
        if is_running:
            print(f"RUNNING|{url}|{port}")
        else:
            print("STOPPED")
        sys.exit(0 if is_running else 1)

    # ─── Handle --stop ────────────────────────────────────
    if args.stop:
        pid, port = read_pid_file()
        if pid is None or not is_pid_running(pid):
            cleanup_pid_file()
            print("Console is not running.")
            sys.exit(0)
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, timeout=5)
            else:
                os.kill(pid, signal.SIGTERM)
            print(f"Console (PID {pid}) stopped.")
        except Exception as e:
            print(f"Failed to stop Console: {e}", file=sys.stderr)
        finally:
            cleanup_pid_file()
        sys.exit(0)

    # ─── Check if already running ─────────────────────────
    is_running, existing_url, existing_port = check_console_running()
    if is_running:
        if args.silent:
            print(f"ALREADY_RUNNING|{existing_url}")
        else:
            print(f"\n🎨 Console already running at {existing_url}")
            if not args.no_open:
                webbrowser.open(existing_url)
        sys.exit(0)

    # ─── Start the server ─────────────────────────────────
    dist_dir = find_dist_dir()
    if not dist_dir:
        print("❌ Error: console/dist/index.html not found.", file=sys.stderr)
        print("   Please build the console first:", file=sys.stderr)
        print("   cd console && npm install && npm run build", file=sys.stderr)
        sys.exit(1)

    os.chdir(dist_dir)

    port = get_available_port(args.port)
    if port is None:
        print(f"❌ Error: Could not find an available port starting from {args.port}", file=sys.stderr)
        sys.exit(1)

    # Discover agents and inject into HTML before serving
    agents = discover_all_agents()
    inject_agents_into_html(dist_dir, agents)

    # Build proxy agent map
    agent_map = {}
    agent_token_map = {}
    for a in agents:
        if a.get("local"):
            continue
        agent_map[a["env"]] = a["gateway_url"]
        if a.get("gateway_token"):
            agent_token_map[a["env"]] = a["gateway_token"]
    ProxyHandler.agent_map = agent_map
    ProxyHandler.agent_token_map = agent_token_map

    # Write PID file before starting server
    write_pid_file(port)

    ThreadingHTTPServer.allow_reuse_address = True
    with ThreadingHTTPServer(("", port), ProxyHandler) as httpd:
        base_url = f"http://localhost:{port}"
        url = build_console_url(base_url, agents, args)

        print_startup_info(dist_dir, agents, url, args, silent=args.silent)

        if args.silent:
            # Silent mode: just print the URL for programmatic consumption
            print(f"STARTED|{base_url}")

        # Open browser unless --no-open or --silent
        if not args.no_open and not args.silent:
            threading.Timer(0.5, lambda: webbrowser.open(url)).start()

        # Register cleanup on exit
        def cleanup_on_exit(*_args):
            cleanup_pid_file()
            sys.exit(0)

        signal.signal(signal.SIGTERM, cleanup_on_exit)
        try:
            signal.signal(signal.SIGINT, cleanup_on_exit)
        except (OSError, ValueError):
            pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            if not args.silent:
                print("\n👋 Console server stopped.")
            cleanup_pid_file()


if __name__ == "__main__":
    main()
