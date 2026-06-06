import React from 'react';
import { Server, Zap, Check, AlertCircle, X, Unlink, TerminalSquare } from 'lucide-react';
import { uiText } from '../lib/uiLanguage';

const ENV_META = {
  openclaw: { label: 'OpenClaw', color: 'text-gdpro-accent', bg: 'bg-gdpro-accent/10' },
  hermes: { label: 'Hermes', color: 'text-gdpro-warning', bg: 'bg-gdpro-warning/10' },
  workbuddy: { label: 'WorkBuddy', color: 'text-gdpro-info', bg: 'bg-gdpro-info/10' },
  qclaw: { label: 'QClaw', color: 'text-gdpro-success', bg: 'bg-gdpro-success/10' },
  codex: { label: 'Codex', color: 'text-gdpro-accent', bg: 'bg-gdpro-accent/10', Icon: TerminalSquare },
};

export default function AgentSelector({ agents, onSelect, onClose, currentEnv, isConnected, onDisconnect, uiLanguage }) {
  if (!agents || agents.length === 0) return null;

  const isSwitchMode = !!currentEnv && currentEnv !== 'unknown';
  const copy = uiText('agentSelector', uiLanguage);
  const currentLabel = ENV_META[currentEnv]?.label || currentEnv;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop animate-fade-in p-4"
         onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-full max-w-md gdpro-modal-shell p-5 animate-scale-in rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-gdpro-accent" strokeWidth={2} />
            <h2 className="text-[15px] font-semibold text-gdpro-text tracking-tight">
              {isSwitchMode ? copy.switchTitle : copy.selectTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gdpro-bg-hover transition-colors text-gdpro-text-muted"
            title={copy.close}
            aria-label={copy.close}
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-[12px] text-gdpro-text-secondary mb-4">
          {isSwitchMode
            ? copy.switchIntro(currentLabel)
            : copy.selectIntro}
        </p>

        {/* Agent list */}
        <div className="space-y-2">
          {agents.map((agent, idx) => {
            const meta = ENV_META[agent.env] || { label: agent.env, color: 'text-gdpro-text', bg: 'bg-gdpro-bg-hover' };
            const Icon = meta.Icon || Zap;
            const isRunning = agent.status === 'running';
            const isPreferred = agent.preferred;
            const isCurrent = agent.env === currentEnv;

            return (
              <button
                key={idx}
                onClick={() => !isCurrent && onSelect(agent)}
                disabled={isCurrent}
                className={`w-full text-left p-3 rounded-[8px] border transition-all duration-150 ${
                  isCurrent
                    ? 'border-gdpro-success/40 bg-gdpro-success/5 cursor-default'
                    : isPreferred
                    ? 'border-gdpro-accent/40 bg-gdpro-accent/5 hover:bg-gdpro-accent/10 hover:scale-[1.01]'
                    : 'border-gdpro-border bg-gdpro-bg-surface hover:bg-gdpro-bg-hover hover:scale-[1.01]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center ${meta.bg}`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} strokeWidth={2} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-gdpro-text">{meta.label}</span>
                        {isCurrent && (
                          <span className="text-[9px] px-1 py-[1px] rounded bg-gdpro-success/15 text-gdpro-success font-bold">
                            {copy.current}
                          </span>
                        )}
                        {isPreferred && !isCurrent && (
                          <span className="text-[9px] px-1 py-[1px] rounded bg-gdpro-accent/15 text-gdpro-accent font-bold">
                            {copy.launchSource}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-gdpro-text-muted mt-0.5">{agent.gateway_url}</div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {isRunning ? (
                      <span className="flex items-center gap-1 text-[10px] text-gdpro-success font-medium">
                        <Check className="w-3 h-3" strokeWidth={2.5} /> {copy.running}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-gdpro-text-muted font-medium">
                        <AlertCircle className="w-3 h-3" strokeWidth={2.5} /> {copy.notStarted}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Disconnect button in switch mode */}
        {isSwitchMode && isConnected && onDisconnect && (
          <button
            onClick={onDisconnect}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-gdpro-danger/30 bg-gdpro-danger/5 hover:bg-gdpro-danger/10 hover:border-gdpro-danger/50 transition-all duration-150"
          >
            <Unlink className="w-3.5 h-3.5 text-gdpro-danger" strokeWidth={2} />
            <span className="text-[12px] font-medium text-gdpro-danger">{copy.disconnect}</span>
          </button>
        )}

        <div className="mt-3 p-2.5 rounded-md bg-gdpro-bg-hover text-[11px] text-gdpro-text-secondary leading-relaxed">
          {isSwitchMode
            ? copy.switchNote
            : copy.selectNote}
        </div>

        <div className="mt-2 rounded-md border border-gdpro-accent/15 bg-gdpro-accent/5 p-2.5 text-[11px] leading-relaxed text-gdpro-text-secondary">
          <span className="font-semibold text-gdpro-text">{copy.partnerTitle}</span>
          <span className="ml-1">{copy.partnerNote}</span>
        </div>
      </div>
    </div>
  );
}
