import React, { useState, useEffect } from 'react';
import { Plug, X, Check, AlertCircle, Search } from 'lucide-react';
import { openclaw } from '../lib/api';
import { loadFromLocal, saveToLocal } from '../lib/storage';
import { uiText } from '../lib/uiLanguage';

const DEFAULT_MANUAL_URL = '';

const PARTNER_LABELS = {
  openclaw: 'OpenClaw',
  hermes: 'Hermes',
  workbuddy: 'WorkBuddy',
  qclaw: 'QClaw',
  codex: 'Codex',
};

function partnerLabel(agent) {
  return PARTNER_LABELS[agent?.env] || agent?.env || 'Local partner';
}

function chooseBestAgent(agents = []) {
  const running = agents.filter((agent) => agent.status === 'running');
  if (running.length !== 1) return null;
  return running[0] || null;
}

function readableError(error, copy) {
  const message = String(error?.message || error || '');
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return copy.fetchFailed;
  }
  return message || copy.unknownError;
}

export default function ConnectionSetup({ isOpen, onClose, onConnect, uiLanguage }) {
  const [url, setUrl] = useState(loadFromLocal('gateway_url') || DEFAULT_MANUAL_URL);
  const [token, setToken] = useState(loadFromLocal('gateway_token') || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const copy = uiText('connection', uiLanguage);

  useEffect(() => {
    if (isOpen) {
      setUrl(loadFromLocal('gateway_url') || DEFAULT_MANUAL_URL);
      setToken(loadFromLocal('gateway_token') || '');
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const discovered = await openclaw.discoverLocalAgents();
      const agents = Array.isArray(discovered?.agents) ? discovered.agents : [];
      const running = agents.filter((agent) => agent.status === 'running');
      if (running.length > 1) {
        setTestResult({
          ok: false,
          choose: true,
          agents,
          message: copy.multiFound(running.length),
        });
        return;
      }
      const agent = chooseBestAgent(agents);
      if (agent) {
        openclaw.setConfig(agent.gateway_url, agent.gateway_token);
        const result = await openclaw.healthCheck();
        setUrl(agent.gateway_url);
        setToken(agent.gateway_token || '');
        setTestResult({
          ok: true,
          data: result,
          agent,
          agents,
          message: copy.autoSuccess(partnerLabel(agent), result?.version || agent.version),
        });
        return;
      }

      if (!url.trim()) {
        setTestResult({ ok: false, error: copy.noAgentFound });
        return;
      }

      openclaw.setConfig(url, token);
      const result = await openclaw.healthCheck();
      setTestResult({
        ok: true,
        data: result,
        agent: null,
        agents,
        message: copy.manualSuccess(result?.version),
      });
    } catch (err) {
      if (url.trim()) {
        try {
          openclaw.setConfig(url, token);
          const result = await openclaw.healthCheck();
          setTestResult({
            ok: true,
            data: result,
            agent: null,
            agents: [],
            message: copy.manualSuccess(result?.version),
          });
          return;
        } catch (manualErr) {
          setTestResult({ ok: false, error: readableError(manualErr, copy) });
          return;
        }
      }
      setTestResult({ ok: false, error: readableError(err, copy) });
    } finally {
      setTesting(false);
    }
  };

  const handleSelectAgent = async (agent) => {
    if (!agent?.gateway_url) return;
    setTesting(true);
    openclaw.setConfig(agent.gateway_url, agent.gateway_token);
    try {
      const result = await openclaw.healthCheck();
      setUrl(agent.gateway_url);
      setToken(agent.gateway_token || '');
      setTestResult((prev) => ({
        ok: true,
        data: result,
        agent,
        agents: prev?.agents || [agent],
        message: copy.autoSuccess(partnerLabel(agent), result?.version || agent.version),
      }));
    } catch (err) {
      setTestResult((prev) => ({
        ok: false,
        choose: true,
        agents: prev?.agents || [agent],
        error: readableError(err, copy),
      }));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const selectedUrl = testResult?.agent?.gateway_url || url.trim();
    const selectedToken = testResult?.agent?.gateway_token || token;
    if (!selectedUrl) return;
    saveToLocal('gateway_url', selectedUrl);
    saveToLocal('gateway_token', selectedToken || '');
    openclaw.setConfig(selectedUrl, selectedToken);
    const connected = await onConnect(selectedUrl, selectedToken, testResult?.agent?.env, {
      agents: testResult?.agents,
    });
    if (connected !== false) onClose();
  };

  const selectableAgents = (testResult?.agents || []).filter((agent) => agent.status === 'running');
  const canSave = !!testResult?.ok && !!(testResult?.agent?.gateway_url || url.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop animate-fade-in p-4">
      <div className="w-full max-w-md p-5 animate-scale-in rounded-lg gdpro-modal-shell">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(56,189,248,0.1))', border: '1px solid rgba(45,212,191,0.15)' }}
            >
              <Plug className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
            </div>
            <h2 className="text-[15px] font-semibold text-gdpro-text tracking-tight">{copy.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-gdpro-text-secondary" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-gdpro-accent/15 bg-gdpro-accent/5 p-3">
            <div className="flex items-start gap-2">
              <Search className="w-4 h-4 text-gdpro-accent mt-0.5 shrink-0" strokeWidth={2} />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-gdpro-text">{copy.autoTitle}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-gdpro-text-secondary">{copy.autoHelp}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="gdpro-label">{copy.address}</label>
            <input className="gdpro-input font-mono text-[12px]" value={url}
              onChange={(e) => setUrl(e.target.value)} placeholder="/local-codex or /proxy/openclaw" />
            <p className="mt-1 text-[10px] text-gdpro-text-muted">{copy.addressHelp}</p>
          </div>

          <div>
            <label className="gdpro-label">{copy.token}</label>
            <input className="gdpro-input font-mono text-[12px]" type="password" value={token}
              onChange={(e) => setToken(e.target.value)} placeholder={copy.tokenPlaceholder} />
            <p className="mt-1 text-[10px] text-gdpro-text-muted">{copy.tokenHelp}</p>
          </div>

          {testResult && (
            <div className={`p-2.5 rounded-xl text-[12px] border ${testResult.ok ? 'text-gdpro-success' : testResult.choose ? 'text-gdpro-text' : 'text-gdpro-danger'}`}
              style={{
                background: testResult.ok ? 'rgba(52,211,153,0.08)' : testResult.choose ? 'rgba(45,212,191,0.08)' : 'rgba(248,113,113,0.08)',
                borderColor: testResult.ok ? 'rgba(52,211,153,0.15)' : testResult.choose ? 'rgba(45,212,191,0.16)' : 'rgba(248,113,113,0.15)',
              }}
            >
              {testResult.ok ? (
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                  <span>{testResult.message || copy.success(testResult.data?.version)}</span>
                </div>
              ) : testResult.choose ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Search className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gdpro-accent" strokeWidth={2.5} />
                    <span>{testResult.message || testResult.error || copy.noAgentFound}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {selectableAgents.map((agent) => (
                      <button
                        key={`${agent.env}-${agent.gateway_url}`}
                        type="button"
                        onClick={() => handleSelectAgent(agent)}
                        disabled={testing}
                        className="flex items-center justify-between rounded-lg border border-gdpro-border bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-gdpro-accent/40 hover:bg-gdpro-accent/10 disabled:opacity-60"
                      >
                        <span className="font-medium text-gdpro-text">{partnerLabel(agent)}</span>
                        <span className="text-[10px] text-gdpro-text-muted">{agent.version || agent.gateway_url}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="break-all">{testResult.error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={handleTest} disabled={testing}
            className="gdpro-button-secondary flex-1 text-[12px]">
            {testing ? copy.testing : copy.test}
          </button>
          <button onClick={handleSave} disabled={!canSave}
            className="gdpro-button flex-1 text-[12px]">
            {copy.save}
          </button>
        </div>
      </div>
    </div>
  );
}
