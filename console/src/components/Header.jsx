import React, { useEffect, useRef, useState } from 'react';
import { Zap, Download, Menu, PackageCheck, Loader2, CheckCircle2, AlertCircle, Languages, ChevronDown, Check, Plus, Trash2, X } from 'lucide-react';
import ModelSelector from './ModelSelector';
import { UI_LANGUAGES, uiText } from '../lib/uiLanguage';

function ProjectMenu({ projects = [], currentProject, onProjectSwitch, onProjectCreate, onProjectDelete, copy }) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const currentName = currentProject?.name || currentProject?.brandName || copy.noProjects;
  const createProject = () => {
    const name = newName.trim();
    if (!name) return;
    onProjectCreate?.(name);
    setNewName('');
    setShowCreate(false);
    setOpen(false);
  };

  const deleteProject = (event, project) => {
    event.stopPropagation();
    const name = project?.name || project?.brandName || 'Untitled project';
    if (!window.confirm(copy.deleteProjectConfirm?.(name) || `Delete "${name}"?`)) return;
    onProjectDelete?.(project.id);
  };

  return (
    <div className="relative hidden md:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 px-2.5 py-[4px] rounded-lg gdpro-project-chip text-left"
        aria-expanded={open}
        title={copy.switchProject}
      >
        <span className="text-[9px] text-gdpro-text-muted font-semibold">{copy.projectLabel}</span>
        <span className="max-w-[150px] truncate text-[12px] font-medium text-gdpro-text-secondary">{currentName}</span>
        {currentProject && (
          <span className="text-[10px] px-1.5 py-[2px] rounded-md font-semibold bg-gdpro-accent/15 text-gdpro-accent">
            {copy.phaseLabel(currentProject.currentPhase)}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 text-gdpro-text-muted transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.2} />
      </button>

      {open && (
        <div className="mac-menu left-0 top-full mt-1 w-72">
          <div className="px-2.5 py-1.5 text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-wider">{copy.switchProject}</div>
          <div className="max-h-56 overflow-y-auto py-0.5">
            {projects.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-gdpro-text-muted">{copy.noProjects}</div>
            ) : (
              projects.map((project) => {
                const active = currentProject?.id === project.id;
                const name = project.name || project.brandName || 'Untitled project';
                return (
                  <div
                    key={project.id}
                    className={`mac-menu-item group ${active ? 'text-gdpro-accent' : ''}`}
                    style={active ? { background: 'rgba(15,159,142,0.1)' } : {}}
                  >
                    <button
                      type="button"
                      onClick={() => { onProjectSwitch?.(project.id); setOpen(false); }}
                      className="min-w-0 flex flex-1 items-center gap-2 text-left"
                    >
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-md border border-gdpro-border bg-gdpro-bg-surface px-1 text-[9px] font-semibold text-gdpro-text-secondary">
                        {String(name).charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[12px] font-medium truncate ${active ? 'text-gdpro-accent' : 'text-gdpro-text'}`}>{name}</span>
                        <span className="block text-[10px] text-gdpro-text-muted">{copy.phaseLabel(project.currentPhase)}</span>
                      </span>
                      {active && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => deleteProject(event, project)}
                      className="ml-1 rounded-md p-1 text-gdpro-text-muted opacity-70 hover:bg-gdpro-danger/10 hover:text-gdpro-danger focus:opacity-100 group-hover:opacity-100"
                      title={copy.deleteProject}
                      aria-label={copy.deleteProject}
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={2} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="mac-divider" />

          {showCreate ? (
            <div className="px-2 py-1.5 flex items-center gap-1.5 animate-fade-in">
              <input
                autoFocus
                className="gdpro-input text-[12px] py-[3px] px-2 flex-1"
                placeholder={copy.newProjectPlaceholder}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') createProject();
                  if (event.key === 'Escape') { setShowCreate(false); setNewName(''); }
                }}
              />
              <button type="button" onClick={createProject} className="p-1 rounded-md gdpro-button">
                <Check className="w-3 h-3" strokeWidth={3} />
              </button>
              <button type="button" onClick={() => { setShowCreate(false); setNewName(''); }} className="p-1 rounded-md hover:bg-gdpro-bg-hover text-gdpro-text-muted">
                <X className="w-3 h-3" strokeWidth={2} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowCreate(true)} className="mac-menu-item text-gdpro-text-muted">
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              {copy.newProject}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Header({
  onExport,
  onExportDelivery,
  onToggleMobileSidebar,
  projects,
  currentProject,
  onProjectSwitch,
  onProjectCreate,
  onProjectDelete,
  llm,
  imageModel,
  onChangeLLM,
  onChangeImageModel,
  agentEnv,
  modelsDetected,
  deliveryExportState,
  uiLanguage,
  onUiLanguageChange,
}) {
  const copy = uiText('header', uiLanguage);

  const envLabel = copy.envLabels?.[agentEnv] || copy.envLabels?.unknown || '本地模式';
  const exportState = deliveryExportState?.state || 'idle';
  const exportBusy = exportState === 'preparing' || exportState === 'syncing';
  const exportDone = exportState === 'synced' || exportState === 'downloaded';
  const exportError = exportState === 'error';
  const deliveryTitle = deliveryExportState?.label || copy.deliveryTitle;

  return (
    <header
      className="h-[46px] gdpro-topbar flex items-center justify-between px-3 shrink-0 z-20 relative"
    >
      {/* Left: Hamburger + Logo + Project context */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="md:hidden gdpro-tool-icon"
          title={copy.menuTitle}
          aria-label={copy.menuAria}
        >
          <Menu className="w-4 h-4" strokeWidth={2} />
        </button>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg gdpro-icon-mark flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <div className="hidden sm:block min-w-0">
            <h1 className="text-[13px] font-semibold text-gdpro-text leading-tight">Graphic Design Pro</h1>
            <div className="text-[9px] text-gdpro-text-muted leading-tight">VI Design Studio · v3.1</div>
          </div>
          <span className="sm:hidden text-[10px] text-gdpro-text-muted font-medium">v3.1</span>
        </div>

        <ProjectMenu
          projects={projects}
          currentProject={currentProject}
          onProjectSwitch={onProjectSwitch}
          onProjectCreate={onProjectCreate}
          onProjectDelete={onProjectDelete}
          copy={copy}
        />
      </div>

      {/* Center: Agent Environment */}
      <div className="hidden lg:flex items-center gap-2 rounded-lg gdpro-project-chip px-2.5 py-[4px]">
        <span className={`w-1.5 h-1.5 rounded-full ${modelsDetected ? 'bg-gdpro-success' : 'bg-gdpro-text-muted'}`} />
        <span className="text-[9px] text-gdpro-text-muted font-semibold">{copy.serviceLabel}</span>
        <span className="text-[10px] text-gdpro-text-secondary font-medium">{envLabel}</span>
      </div>

      {/* Right: Model Selector + Export */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="hidden sm:flex gdpro-language-switch" role="group" aria-label={copy.languageLabel}>
          <Languages className="w-3.5 h-3.5 text-gdpro-text-muted" strokeWidth={1.7} />
          {UI_LANGUAGES.map((language) => {
            const active = language.id === uiLanguage;
            return (
              <button
                key={language.id}
                type="button"
                onClick={() => onUiLanguageChange?.(language.id)}
                className={active ? 'gdpro-language-switch-active' : ''}
                aria-pressed={active}
                title={language.label}
              >
                {language.shortLabel}
              </button>
            );
          })}
        </div>
        <div className="hidden md:block">
          <ModelSelector
            llm={llm}
            imageModel={imageModel}
            onChangeLLM={onChangeLLM}
            onChangeImageModel={onChangeImageModel}
            modelsDetected={modelsDetected}
            uiLanguage={uiLanguage}
          />
        </div>

        <button
          onClick={onExport}
          disabled={!currentProject}
          className="hidden sm:inline-flex gdpro-tool-icon"
          title={copy.backupTitle}
          aria-label={copy.backupAria}
        >
          <Download className="w-3.5 h-3.5 text-gdpro-text-muted" strokeWidth={1.5} />
        </button>
        <button
          onClick={onExportDelivery}
          disabled={!currentProject || exportBusy}
          className="hidden sm:inline-flex gdpro-tool-icon"
          title={deliveryTitle}
          aria-label={copy.deliveryAria}
        >
          {exportBusy ? (
            <Loader2 className="w-3.5 h-3.5 text-gdpro-accent animate-spin" strokeWidth={1.8} />
          ) : exportDone ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-gdpro-success" strokeWidth={1.8} />
          ) : exportError ? (
            <AlertCircle className="w-3.5 h-3.5 text-gdpro-danger" strokeWidth={1.8} />
          ) : (
            <PackageCheck className="w-3.5 h-3.5 text-gdpro-text-muted" strokeWidth={1.5} />
          )}
        </button>
        {exportState !== 'idle' && (
          <span className={`hidden xl:inline-flex max-w-[120px] truncate text-[10px] font-medium ${
            exportError ? 'text-gdpro-danger' : exportDone ? 'text-gdpro-success' : 'text-gdpro-text-muted'
          }`}>
            {deliveryExportState?.label}
          </span>
        )}
      </div>
    </header>
  );
}
