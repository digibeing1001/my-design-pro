import React from 'react';
import { Zap, Download, Menu, PackageCheck, Loader2, CheckCircle2, AlertCircle, Languages } from 'lucide-react';
import ModelSelector from './ModelSelector';
import { UI_LANGUAGES, uiText } from '../lib/uiLanguage';

export default function Header({
  onExport,
  onExportDelivery,
  onToggleMobileSidebar,
  currentProject,
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

        {/* Project context */}
        {currentProject && (
          <div className="hidden md:flex items-center gap-2 px-2.5 py-[4px] rounded-lg gdpro-project-chip">
            <span className="text-[9px] text-gdpro-text-muted font-semibold">{copy.projectLabel}</span>
            <span className="max-w-[150px] truncate text-[12px] font-medium text-gdpro-text-secondary">{currentProject.name}</span>
            <span className="text-[10px] px-1.5 py-[2px] rounded-md font-semibold bg-gdpro-accent/15 text-gdpro-accent">
              {copy.phaseLabel(currentProject.currentPhase)}
            </span>
          </div>
        )}
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
