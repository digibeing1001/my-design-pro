import React, { useState } from 'react';
import { MessageSquare, Workflow, Image, BookOpen, User, ChevronLeft, FolderOpen, Plus, Check, X, Settings, Link, Link2, Unlink, Loader2 } from 'lucide-react';
import { uiText } from '../lib/uiLanguage';

const NAV_ITEMS = [
  { id: 'agent', icon: MessageSquare },
  { id: 'workflow', icon: Workflow },
  { id: 'assets', icon: Image },
  { id: 'references', icon: BookOpen },
  { id: 'profile', icon: User },
];

const STATUS_CONFIG = {
  connected: { dot: 'bg-gdpro-success', icon: Link2 },
  connecting: { dot: 'bg-gdpro-accent animate-pulse', icon: Loader2 },
  disconnected: { dot: 'bg-gdpro-danger', icon: Unlink },
  unknown: { dot: 'bg-gdpro-text-muted', icon: Unlink },
};

export default function Sidebar({ activeView, onChange, collapsed, onToggle, projects, currentProjectId, onProjectSwitch, onProjectCreate, mobileOpen, onCloseMobile, connectionStatus, onOpenSettings, agents, currentAgentEnv, onSwitchAgent, onDisconnect, uiLanguage }) {
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const copy = uiText('sidebar', uiLanguage);

  const handleCreate = () => {
    const name = newProjectName.trim();
    if (!name) return;
    onProjectCreate?.(name);
    setShowNewProject(false);
    setNewProjectName('');
  };

  const status = STATUS_CONFIG[connectionStatus] || STATUS_CONFIG.unknown;
  const statusCopy = copy.status?.[connectionStatus] || copy.status?.unknown || ['离线预览模式', '连接服务后可创建与交付'];
  const isConnected = connectionStatus === 'connected';
  const StatusIcon = status.icon;

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 gdpro-modal-backdrop z-30 md:hidden"
          onClick={onCloseMobile}
        />
      )}
      <div
        className={`shrink-0 flex flex-col transition-[width,transform,opacity] duration-300 ${
          collapsed ? 'w-[56px]' : 'w-[230px]'
        } ${
          mobileOpen
            ? 'fixed left-0 top-[46px] bottom-0 z-40 md:relative md:top-auto md:z-auto'
            : 'hidden md:flex'
        } gdpro-sidebar-shell`}
      >
      {/* Toggle */}
      <div className="h-[42px] flex items-center justify-between px-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(24,35,48,0.1)' }}
      >
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-wider leading-tight">{copy.navigation}</div>
            <div className="text-[9px] text-gdpro-text-muted/75 leading-tight">{copy.navigationSub}</div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="gdpro-tool-icon min-w-[26px] min-h-[26px]"
          title={collapsed ? copy.expand : copy.collapse}
          aria-label={collapsed ? copy.expandSidebar : copy.collapseSidebar}
        >
          <ChevronLeft
            className={`w-3.5 h-3.5 text-gdpro-text-muted transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
            strokeWidth={2}
          />
        </button>
      </div>

      {/* Main Nav */}
      <nav className="py-2 px-2 space-y-[2px] shrink-0">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          const labels = copy.nav?.[item.id] || [item.id, ''];
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`mac-sidebar-item ${isActive ? 'mac-sidebar-item-active' : ''} ${collapsed ? 'justify-center px-2' : ''}`}
              title={collapsed ? labels[0] : ''}
            >
              <Icon
                className={`w-[15px] h-[15px] shrink-0 ${isActive ? 'text-gdpro-accent' : 'text-gdpro-text-muted'}`}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              {!collapsed && (
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium leading-tight truncate">{labels[0]}</span>
                  <span className="block text-[9px] text-gdpro-text-muted leading-tight truncate">{labels[1]}</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <>
          {/* Divider */}
          <div className="mx-3 my-2 h-px shrink-0" style={{ background: 'rgba(24,35,48,0.1)' }} />

          {/* Projects Section */}
          <div className="px-3 mb-1 flex items-center justify-between shrink-0">
            <div>
              <div className="text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-wider leading-tight">{copy.projects}</div>
              <div className="text-[9px] text-gdpro-text-muted/75 leading-tight">{copy.projectsSub}</div>
            </div>
            {!showNewProject && (
              <button
                onClick={() => setShowNewProject(true)}
                className="gdpro-tool-icon min-w-[24px] min-h-[24px]"
                title={copy.newProject}
                aria-label={copy.newProject}
              >
                <Plus className="w-3 h-3" strokeWidth={2.5} />
              </button>
            )}
          </div>

          {showNewProject && (
            <div className="px-2 mb-1.5 animate-fade-in shrink-0">
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  className="gdpro-input text-[11px] py-[3px] px-2 flex-1"
                  placeholder={copy.newProjectPlaceholder}
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName(''); }
                  }}
                />
                <button onClick={handleCreate} className="p-1 rounded-lg gdpro-button text-gdpro-bg hover:brightness-110">
                  <Check className="w-3 h-3" strokeWidth={3} />
                </button>
                <button onClick={() => { setShowNewProject(false); setNewProjectName(''); }} className="p-1 rounded-lg hover:bg-gdpro-bg-hover text-gdpro-text-muted transition-colors">
                  <X className="w-3 h-3" strokeWidth={2} />
                </button>
              </div>
            </div>
          )}

          {/* Projects List — scrollable */}
          <div className="px-2 pb-1 space-y-[1px] overflow-y-auto min-h-0 flex-1">
            {projects.map((p) => {
              const isActive = currentProjectId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onProjectSwitch(p.id)}
                  className={`w-full flex items-center gap-2 px-2 py-[7px] rounded-lg text-left border transition-colors duration-150 ${
                    isActive
                      ? 'text-gdpro-accent'
                      : 'border-transparent text-gdpro-text-secondary hover:text-gdpro-text hover:bg-gdpro-bg-hover hover:border-gdpro-border'
                  }`}
                  style={isActive ? {
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(232,247,244,0.94)), linear-gradient(90deg, rgba(15,159,142,0.16), rgba(15,159,142,0.05))',
                    border: '1px solid rgba(15,159,142,0.24)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 7px 16px rgba(15,80,72,0.08)',
                  } : {}}
                  title={p.name || p.brandName || 'Untitled project'}
                >
                  <div className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[9px] font-bold shrink-0 ${
                    isActive ? 'bg-gdpro-accent/15 text-gdpro-accent' : 'bg-gdpro-bg-surface text-gdpro-text-muted'
                  }`}>
                    {String(p.name || p.brandName || 'P').charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[12px] font-medium truncate ${isActive ? 'text-gdpro-accent' : ''}`}>
                      {p.name || p.brandName || 'Untitled project'}
                    </div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-[1px] rounded-md shrink-0 font-medium ${
                    isActive ? 'bg-gdpro-accent/15 text-gdpro-accent' : 'bg-gdpro-bg-surface text-gdpro-text-muted'
                  }`}>
                    P{p.currentPhase}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom: Connection Status + Version */}
          <div className="mt-auto shrink-0" style={{ borderTop: '1px solid rgba(24,35,48,0.1)' }}>
            {/* Connection Status Panel */}
            <div className="px-3 pt-2.5 pb-2">
              <div
                className={`relative rounded-lg border overflow-hidden transition-colors duration-200`}
                style={{
                  background: isConnected
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(238,250,247,0.94)), rgba(36,161,96,0.06)'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,249,251,0.94))',
                  borderColor: isConnected ? 'rgba(36,161,96,0.18)' : 'rgba(24,35,48,0.12)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 10px 22px rgba(24,35,48,0.08)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
              >
                {/* Status header */}
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} />
                  <span className="text-[11px] font-semibold text-gdpro-text leading-none">{statusCopy[0]}</span>
                  {isConnected && agents && agents.length > 1 && (
                    <button
                      onClick={onSwitchAgent}
                      className="ml-auto p-1 rounded hover:bg-gdpro-bg-hover transition-colors"
                      title={copy.switchService}
                    >
                      <Settings className="w-3 h-3 text-gdpro-text-muted" strokeWidth={2} />
                    </button>
                  )}
                  {!isConnected && (
                    <button
                      onClick={onOpenSettings}
                      className="ml-auto p-1 rounded hover:bg-gdpro-bg-hover transition-colors"
                      title={copy.connectService}
                    >
                      <Settings className="w-3 h-3 text-gdpro-text-muted" strokeWidth={2} />
                    </button>
                  )}
                </div>

                {/* Expanded info for non-connected states */}
                {!isConnected && (
                  <div className="px-2.5 pb-2.5 pt-0">
                    <div className="h-px mb-2" style={{ background: 'rgba(24,35,48,0.1)' }} />
                    <p className="text-[10px] text-gdpro-text-muted leading-relaxed">
                      {copy.offlineNote}
                    </p>
                    <button
                      onClick={onOpenSettings}
                      className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-[5px] rounded-lg transition-[filter,background-color,border-color] duration-150 hover:brightness-110"
                      style={{
                        background: 'rgba(255,255,255,0.72)',
                        border: '1px solid rgba(24,35,48,0.12)',
                      }}
                    >
                      <StatusIcon className="w-3 h-3 text-gdpro-text-muted" strokeWidth={2} />
                      <span className="text-[10px] font-medium text-gdpro-text-secondary">{copy.connectService}</span>
                    </button>
                  </div>
                )}

                {isConnected && (
                  <div className="px-2.5 pb-2 pt-0">
                    <div className="text-[10px] text-gdpro-text-muted mb-1.5">{statusCopy[1]}</div>
                    <div className="flex gap-1.5">
                      {agents && agents.length > 1 && (
                        <button
                          onClick={onSwitchAgent}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-[4px] rounded-lg transition-[filter,background-color,border-color] duration-150 hover:brightness-110"
                          style={{
                            background: 'rgba(255,255,255,0.72)',
                            border: '1px solid rgba(24,35,48,0.12)',
                          }}
                        >
                          <Link className="w-3 h-3 text-gdpro-text-muted" strokeWidth={2} />
                          <span className="text-[10px] font-medium text-gdpro-text-secondary">{copy.switchServiceShort}</span>
                        </button>
                      )}
                      <button
                        onClick={onDisconnect}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-[4px] rounded-lg transition-colors duration-150"
                        style={{
                          background: 'rgba(248,113,113,0.08)',
                          border: '1px solid rgba(248,113,113,0.15)',
                        }}
                      >
                        <Unlink className="w-3 h-3 text-gdpro-danger" strokeWidth={2} />
                        <span className="text-[10px] font-medium text-gdpro-danger">{copy.disconnect}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Version */}
            <div className="px-3 pb-2.5 pt-0">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg gdpro-project-chip">
                <Workflow className="w-3 h-3 text-gdpro-accent shrink-0" strokeWidth={2} />
                <div>
                  <div className="text-[10px] font-medium text-gdpro-text-secondary leading-tight">Graphic Design Pro</div>
                  <div className="text-[9px] text-gdpro-text-muted leading-tight">Studio v3.1</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Collapsed state: mini status dot */}
      {collapsed && (
        <div className="mt-auto shrink-0 p-2 flex justify-center" style={{ borderTop: '1px solid rgba(24,35,48,0.1)' }}>
          <button
            onClick={onOpenSettings}
            className="relative p-1.5 rounded-lg hover:bg-gdpro-bg-hover transition-colors"
            title={isConnected ? copy.connectedMini : copy.connectService}
          >
            <span className={`block w-2 h-2 rounded-full ${status.dot}`} />
            {!isConnected && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-gdpro-danger border-2 border-gdpro-bg-sidebar" />
            )}
          </button>
        </div>
      )}
    </div>
    </>
  );
}
