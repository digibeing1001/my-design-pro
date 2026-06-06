// Local creative service bridge for OpenClaw / Hermes / WorkBuddy / Codex.
const API = {
  url: null,
  token: null,

  setConfig(url, token) {
    this.url = url?.replace(/\/$/, '') || null;
    this.token = token || null;
  },

  async fetch(path, options = {}) {
    if (!this.url) throw new Error('本地创作服务地址未配置');
    // Build headers: avoid Content-Type on GET/HEAD requests to prevent CORS preflight
    // (some Gateways like OpenClaw do not handle OPTIONS requests)
    const hasBody = options.body != null;
    const headers = {
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    };
    const res = await fetch(`${this.url}${path}`, {
      ...options,
      headers,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new Error(`本地创作服务 ${res.status}: ${text}`);
    }
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  },

  async consoleFetch(path, options = {}) {
    const hasBody = options.body != null;
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new Error(`本机工作台 ${res.status}: ${text}`);
    }
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  },

  async healthCheck() {
    const data = await this.fetch('/health');
    // Verify it's a real creative service, not just any HTTP 200 service.
    if (!data || typeof data !== 'object') {
      throw new Error('本地创作服务返回格式异常');
    }
    if (!('version' in data || 'status' in data || 'gateway' in data || data.ok === true || 'service' in data || 'name' in data)) {
      throw new Error('本地创作服务响应缺少必要字段');
    }
    return data;
  },

  async sendMessage(projectId, message, { llm, imageModel, imageModelConfig, systemPrompt, references, assets, action, contextSummary, controlState } = {}) {
    return this.fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ projectId, message, llm, imageModel, imageModelConfig, systemPrompt, references, assets, action, contextSummary, controlState }),
    });
  },

  async generateImage(prompt, { model, imageModelConfig, size = '1024x1024', n = 1 } = {}) {
    return this.fetch('/generate-image', {
      method: 'POST',
      body: JSON.stringify({ prompt, model, imageModelConfig, size, n }),
    });
  },

  async codexExec(prompt, { model, timeoutSeconds = 180 } = {}) {
    return this.consoleFetch('/local-codex/exec', {
      method: 'POST',
      body: JSON.stringify({ prompt, model, timeoutSeconds }),
    });
  },

  // ── File System Bridge (.gdpro/ sync) ──

  /**
   * Read a file from the agent workspace via Gateway.
   * @param {string} relPath - Relative path (e.g. '.gdpro/designer-profile.json')
   * @returns {Promise<{content: string, exists: boolean}>}
   */
  async fsRead(relPath) {
    return this.fetch('/fs/read', {
      method: 'POST',
      body: JSON.stringify({ path: relPath }),
    });
  },

  /**
   * Write a file to the agent workspace via Gateway.
   * @param {string} relPath - Relative path
   * @param {string} content - File content (JSON string)
   * @returns {Promise<{success: boolean, path: string}>}
   */
  async fsWrite(relPath, content) {
    return this.fetch('/fs/write', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, content }),
    });
  },

  /**
   * List directory contents.
   * @param {string} relPath - Directory path
   * @returns {Promise<{entries: Array<{name: string, type: 'file'|'dir'}>}>}
   */
  async fsList(relPath) {
    return this.fetch('/fs/list', {
      method: 'POST',
      body: JSON.stringify({ path: relPath }),
    });
  },

  /**
   * Check if a file exists.
   * @param {string} relPath
   * @returns {Promise<{exists: boolean}>}
   */
  async fsExists(relPath) {
    return this.fetch('/fs/exists', {
      method: 'POST',
      body: JSON.stringify({ path: relPath }),
    });
  },

  /**
   * Batch sync .gdpro/ directory to workspace.
   * @param {Object} files - Map of relPath -> content
   * @returns {Promise<{success: boolean, written: string[]}>}
   */
  async fsSyncGdpro(files) {
    try {
      return await this.fetch('/fs/sync-gdpro', {
        method: 'POST',
        body: JSON.stringify({ files }),
      });
    } catch (err) {
      return this.consoleFetch('/local-gdpro/sync', {
        method: 'POST',
        body: JSON.stringify({ files }),
      });
    }
  },

  async savePartnerHandoffTask(task) {
    return this.consoleFetch('/local-handoff/save', {
      method: 'POST',
      body: JSON.stringify({ task }),
    });
  },

  async latestPartnerHandoffTask({ projectId, path } = {}) {
    const params = new URLSearchParams();
    if (projectId) params.set('project', projectId);
    if (path) params.set('path', path);
    const query = params.toString();
    return this.consoleFetch(`/local-handoff/latest${query ? `?${query}` : ''}`);
  },

  async listPartnerHandoffTasks({ projectId, limit = 8 } = {}) {
    const params = new URLSearchParams();
    if (projectId) params.set('project', projectId);
    if (limit) params.set('limit', String(limit));
    const query = params.toString();
    return this.consoleFetch(`/local-handoff/list${query ? `?${query}` : ''}`);
  },

  async claimPartnerHandoffTask({ projectId, path } = {}) {
    return this.consoleFetch('/local-handoff/claim', {
      method: 'POST',
      body: JSON.stringify({ projectId, path }),
    });
  },

  async updatePartnerHandoffStatus({ projectId, path, status, note } = {}) {
    return this.consoleFetch('/local-handoff/status', {
      method: 'POST',
      body: JSON.stringify({ projectId, path, status, note }),
    });
  },
};

export const openclaw = API;
