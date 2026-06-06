import React, { useState, useEffect } from 'react';
import { Plug, X, Check, AlertCircle } from 'lucide-react';
import { openclaw } from '../lib/api';
import { loadFromLocal, saveToLocal } from '../lib/storage';
import { uiText } from '../lib/uiLanguage';

export default function ConnectionSetup({ isOpen, onClose, onConnect, uiLanguage }) {
  const [url, setUrl] = useState(loadFromLocal('gateway_url') || 'http://127.0.0.1:18789');
  const [token, setToken] = useState(loadFromLocal('gateway_token') || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const copy = uiText('connection', uiLanguage);

  useEffect(() => {
    if (isOpen) {
      setUrl(loadFromLocal('gateway_url') || 'http://127.0.0.1:18789');
      setToken(loadFromLocal('gateway_token') || '');
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    openclaw.setConfig(url, token);
    try {
      const result = await openclaw.healthCheck();
      setTestResult({ ok: true, data: result });
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    saveToLocal('gateway_url', url);
    saveToLocal('gateway_token', token);
    openclaw.setConfig(url, token);
    onConnect(url, token);
    onClose();
  };

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
          <div>
            <label className="gdpro-label">{copy.address}</label>
            <input className="gdpro-input font-mono text-[12px]" value={url}
              onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:18789" />
            <p className="mt-1 text-[10px] text-gdpro-text-muted">{copy.addressHelp}</p>
          </div>

          <div>
            <label className="gdpro-label">{copy.token}</label>
            <input className="gdpro-input font-mono text-[12px]" type="password" value={token}
              onChange={(e) => setToken(e.target.value)} placeholder={copy.tokenPlaceholder} />
            <p className="mt-1 text-[10px] text-gdpro-text-muted">{copy.tokenHelp}</p>
          </div>

          {testResult && (
            <div className={`p-2.5 rounded-xl text-[12px] border ${testResult.ok ? 'text-gdpro-success' : 'text-gdpro-danger'}`}
              style={{
                background: testResult.ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
                borderColor: testResult.ok ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
              }}
            >
              {testResult.ok ? (
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                  <span>{copy.success(testResult.data?.version)}</span>
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
          <button onClick={handleSave} disabled={!testResult?.ok}
            className="gdpro-button flex-1 text-[12px]">
            {copy.save}
          </button>
        </div>
      </div>
    </div>
  );
}
