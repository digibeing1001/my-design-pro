import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ConnectionSetup from './components/ConnectionSetup';
import AgentSelector from './components/AgentSelector';
import ErrorBoundary from './components/ErrorBoundary';
import { openclaw } from './lib/api';
import { saveToLocal, loadFromLocal, saveProjectsToLocalAndSync, pullFromGateway, syncWorkspaceFiles } from './lib/storage';
import {
  buildDeliveryBundleZipArchive,
  downloadDeliveryBundleArchive,
  exportGdproProject,
  getDeliveryBundleWorkspaceFiles,
  prepareDeliveryExportProject,
} from './lib/exportGdpro';
import { createProject, DEMO_PROJECTS } from './data/projects';
import { getConfiguredModels, saveModelConfig, saveCustomModels, getCustomModels, addCustomModel, removeCustomModel, getDetectedDefaults, getLanguageModels, getImageModels, buildImageModelRuntimeConfig, setDetectedModels } from './data/modelConfig';
import { loadUiLanguage, normalizeUiLanguage, saveUiLanguage, uiText } from './lib/uiLanguage';

const DesignerAgent = lazy(() => import('./components/DesignerAgent'));
const WorkflowCanvas = lazy(() => import('./components/WorkflowCanvas'));
const AssetLibrary = lazy(() => import('./components/AssetLibrary'));
const ReferenceLibrary = lazy(() => import('./components/ReferenceLibrary'));
const DesignerProfile = lazy(() => import('./components/DesignerProfile'));

const VIEW_COMPONENTS = {
  agent: DesignerAgent,
  workflow: WorkflowCanvas,
  assets: AssetLibrary,
  references: ReferenceLibrary,
  profile: DesignerProfile,
};

function ViewLoadingFallback({ view, uiLanguage }) {
  const copy = uiText('loading', uiLanguage);
  const label = copy.views?.[view] || copy.defaultView || '工作台';

  return (
    <div className="h-full flex items-center justify-center bg-gdpro-bg">
      <div className="w-[280px] rounded-xl border border-gdpro-border bg-gdpro-bg-sidebar/95 px-5 py-4 shadow-[0_24px_80px_rgba(20,35,50,0.16)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg gdpro-icon-mark flex items-center justify-center">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-white/35 border-t-white animate-spin" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-gdpro-text truncate">{copy.loadingPrefix} {label}</div>
            <div className="text-[10px] text-gdpro-text-muted mt-0.5">{copy.loadingSub}</div>
          </div>
        </div>
        <div className="mt-4 h-1 rounded-full bg-gdpro-bg-surface overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-gdpro-accent animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// Parse URL params for agent injection
function getUrlParams() {
  if (typeof window === 'undefined') return {};
  const url = new URL(window.location.href);
  const params = {
    env: url.searchParams.get('env') || null,
    llm: url.searchParams.get('llm') || null,
    imageModel: url.searchParams.get('imageModel') || url.searchParams.get('image_model') || null,
    modelsDetected: url.searchParams.get('modelsDetected') === 'true' || url.searchParams.get('detected') === 'true',
    gatewayUrl: url.searchParams.get('gateway') || null,
    gatewayToken: url.searchParams.get('token') || null,
    view: url.searchParams.get('view') || null,
    lang: url.searchParams.get('lang') || null,
    injected: url.searchParams.get('injected') === 'true',
    agents: null,
  };
  // Parse base64-encoded agents list for multi-agent selection
  const agentsB64 = url.searchParams.get('agents');
  if (agentsB64) {
    try {
      const agentsJson = atob(decodeURIComponent(agentsB64));
      params.agents = JSON.parse(agentsJson);
    } catch (e) {
      console.warn('[Console] Failed to parse agents param:', e);
    }
  }
  // Also check for agents injected by launch_console.py into index.html
  if (!params.agents && window.__AGENTS__ && Array.isArray(window.__AGENTS__)) {
    params.agents = window.__AGENTS__;
  }
  return params;
}

// Sync model config back to parent agent
function syncToParentAgent(type, data) {
  if (typeof window !== 'undefined' && window.parent !== window) {
    window.parent.postMessage({
      source: 'graphic-design-pro-console',
      type,
      data,
    }, '*');
  }
}

export default function App() {
  const urlParams = getUrlParams();
  const [activeView, setActiveView] = useState(() => (VIEW_COMPONENTS[urlParams.view] ? urlParams.view : 'agent'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [uiLanguage, setUiLanguage] = useState(() => normalizeUiLanguage(urlParams.lang || loadUiLanguage('zh')));
  const [connectionStatus, setConnectionStatus] = useState('unknown');
  const [queuedDesignRequest, setQueuedDesignRequest] = useState(null);
  const [deliveryExportState, setDeliveryExportState] = useState({ state: 'idle', label: '' });
  const [availableAgents, setAvailableAgents] = useState(() => urlParams.agents || []);
  // Determine if we need to show agent selector
  // Count running agents from injected data
  const runningAgents = availableAgents.filter((a) => a.status === 'running');
  const hasGatewayInUrl = !!urlParams.gatewayUrl;

  const [showAgentSelector, setShowAgentSelector] = useState(() => {
    // Show selector whenever multiple local partners are running.
    return !hasGatewayInUrl && runningAgents.length > 1;
  });

  // Models — auto-injected from URL params if available
  const [llm, setLlm] = useState(() => {
    if (urlParams.llm) {
      const cfg = getConfiguredModels();
      saveModelConfig({ ...cfg, llm: urlParams.llm });
      return urlParams.llm;
    }
    const cfg = getConfiguredModels();
    return cfg.llm || 'gpt-4o';
  });
  const [imageModel, setImageModel] = useState(() => {
    if (urlParams.imageModel) {
      const cfg = getConfiguredModels();
      saveModelConfig({ ...cfg, imageModel: urlParams.imageModel });
      return urlParams.imageModel;
    }
    const cfg = getConfiguredModels();
    return cfg.imageModel || 'seedream';
  });
  const [modelsDetected, setModelsDetected] = useState(() => {
    // If injected from agent, trust it
    if (urlParams.modelsDetected) return true;
    return false;
  });

  // Projects
  const [projects, setProjects] = useState(() => loadFromLocal('projects', DEMO_PROJECTS));
  const [currentProjectId, setCurrentProjectId] = useState(() => loadFromLocal('current_project', DEMO_PROJECTS[0]?.id || null));

  useEffect(() => {
    saveUiLanguage(uiLanguage);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = uiLanguage === 'en' ? 'en' : 'zh-CN';
    }
  }, [uiLanguage]);

  const handleUiLanguageChange = useCallback((language) => {
    setUiLanguage(saveUiLanguage(language));
  }, []);

  // Agent environment — auto-detected from URL or window globals
  const [agentEnv, setAgentEnv] = useState(() => {
    if (urlParams.env) return urlParams.env;
    if (typeof window !== 'undefined') {
      if (window?.__OPENCLAW__) return 'openclaw';
      if (window?.__HERMES__) return 'hermes';
      if (window?.__WORKBUDDY__) return 'workbuddy';
      if (window?.__QCLAW__) return 'qclaw';
      if (window?.__CODEX__) return 'codex';
    }
    return 'unknown';
  });

  const selectDetectedDefault = (currentId, defaultId, models) => {
    if (!defaultId) return null;
    if (!currentId) return defaultId;
    const currentExists = models.some((model) => model.id === currentId);
    return currentExists ? null : defaultId;
  };

  // Apply detected models from Agent config without overwriting a valid user choice.
  const applyDetectedModels = (modelsData = null) => {
    const normalizedModels = modelsData ? setDetectedModels(modelsData) : null;
    const defaults = getDetectedDefaults();
    if (!defaults) return;
    const cfg = getConfiguredModels();
    const next = { ...cfg };
    const languageModels = getLanguageModels(true);
    const imageModels = getImageModels(true);
    const nextLlm = selectDetectedDefault(cfg.llm || llm, defaults.llm, languageModels);
    const nextImageModel = selectDetectedDefault(cfg.imageModel || imageModel, defaults.image, imageModels);

    if (nextLlm) {
      setLlm(nextLlm);
      next.llm = nextLlm;
    }
    if (nextImageModel) {
      setImageModel(nextImageModel);
      next.imageModel = nextImageModel;
    }
    if (nextLlm || nextImageModel || normalizedModels) saveModelConfig(next);
  };

  const refreshDetectedModels = useCallback(async (envName = null) => {
    try {
      const res = await openclaw.discoverLocalModels(envName && envName !== 'unknown' ? envName : null);
      const modelsData = res?.models || res;
      if (modelsData?.defaults || modelsData?.llm?.length || modelsData?.image?.length) {
        setModelsDetected(true);
        applyDetectedModels(modelsData);
      }
      return modelsData;
    } catch {
      return null;
    }
  }, []);

  // Auto-connect if single gateway params injected or only one running agent discovered
  useEffect(() => {
    if (urlParams.gatewayUrl) {
      // Direct gateway URL from launch_console.py (single agent mode)
      openclaw.setConfig(urlParams.gatewayUrl, urlParams.gatewayToken);
      setConnectionStatus('connecting');
      openclaw.healthCheck()
        .then(() => {
          setConnectionStatus('connected');
          setModelsDetected(true);
          refreshDetectedModels(urlParams.env || agentEnv);
          // Pull .gdpro/ data from workspace on connect
          pullFromGateway().then((res) => {
            if (res.success && res.pulled?.length) {
              // Refresh projects from localStorage after pull
              const refreshed = loadFromLocal('projects', DEMO_PROJECTS);
              setProjects(refreshed);
            }
          });
        })
        .catch(() => { setConnectionStatus('disconnected'); });
    } else if (runningAgents.length === 1) {
      // Auto-connect when launch_console.py found a single clear runtime.
      const agent = runningAgents[0];
      setAgentEnv(agent.env);
      openclaw.setConfig(agent.gateway_url, agent.gateway_token);
      setConnectionStatus('connecting');
      openclaw.healthCheck()
        .then(() => {
          setConnectionStatus('connected');
          setModelsDetected(true);
          refreshDetectedModels(agent.env);
          pullFromGateway().then((res) => {
            if (res.success && res.pulled?.length) {
              const refreshed = loadFromLocal('projects', DEMO_PROJECTS);
              setProjects(refreshed);
            }
          });
        })
        .catch(() => { setConnectionStatus('disconnected'); });
    }
  }, []);

  const currentProject = projects.find((p) => p.id === currentProjectId) || null;

  const handleConnect = async (url, token, envName, options = {}) => {
    if (Array.isArray(options.agents)) setAvailableAgents(options.agents);
    openclaw.setConfig(url, token);
    if (envName) setAgentEnv(envName);
    setConnectionStatus('connecting');
    try {
      await openclaw.healthCheck();
      setConnectionStatus('connected');
      setModelsDetected(true);
      await refreshDetectedModels(envName);
      const res = await pullFromGateway();
      if (res.success && res.pulled?.length) {
        const refreshed = loadFromLocal('projects', DEMO_PROJECTS);
        setProjects(refreshed);
      }
      return true;
    } catch {
      setConnectionStatus('disconnected');
      setModelsDetected(false);
      return false;
    }
  };

  const handleDisconnect = () => {
    openclaw.setConfig(null, null);
    setConnectionStatus('disconnected');
    setModelsDetected(false);
    setAgentEnv('unknown');
  };

  const handleSwitchAgent = () => {
    setShowAgentSelector(true);
    openclaw.discoverLocalAgents()
      .then((res) => {
        if (Array.isArray(res?.agents)) setAvailableAgents(res.agents);
        if (res?.models) {
          setModelsDetected(true);
          applyDetectedModels(res.models);
        } else {
          refreshDetectedModels(agentEnv);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    openclaw.discoverLocalAgents()
      .then((res) => {
        if (cancelled || !Array.isArray(res?.agents)) return;
        const agents = res.agents;
        setAvailableAgents(agents);
        if (res?.models) {
          setModelsDetected(true);
          applyDetectedModels(res.models);
        } else {
          const preferredEnv = agents.find((agent) => agent.preferred)?.env
            || agents.find((agent) => agent.status === 'running')?.env
            || agentEnv;
          refreshDetectedModels(preferredEnv);
        }
        if (urlParams.gatewayUrl) return;
        const liveAgents = agents.filter((agent) => agent.status === 'running');
        if (!urlParams.agents?.length && liveAgents.length === 1) {
          const agent = liveAgents[0];
          handleConnect(agent.gateway_url, agent.gateway_token, agent.env, { agents });
        } else if (!urlParams.agents?.length && liveAgents.length > 1) {
          setShowAgentSelector(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleProjectCreate = useCallback((name) => {
    const newProject = createProject(name);
    const updated = [newProject, ...projects];
    setProjects(updated);
    setCurrentProjectId(newProject.id);
    saveProjectsToLocalAndSync(updated);
    saveToLocal('current_project', newProject.id);
  }, [projects]);

  const handleProjectSwitch = useCallback((id) => {
    setCurrentProjectId(id);
    saveToLocal('current_project', id);
  }, []);

  const handleAssetsChange = useCallback((projectId, newAssets) => {
    setProjects((prev) => {
      const updated = prev.map((p) => p.id === projectId ? { ...p, assets: newAssets, updatedAt: Date.now() } : p);
      saveProjectsToLocalAndSync(updated);
      return updated;
    });
  }, []);

  const handleReferencesChange = useCallback((projectId, newRefs) => {
    setProjects((prev) => {
      const updated = prev.map((p) => p.id === projectId ? { ...p, references: newRefs, updatedAt: Date.now() } : p);
      saveProjectsToLocalAndSync(updated);
      return updated;
    });
  }, []);

  const handleProjectUpdate = useCallback((projectId, updater) => {
    setProjects((prev) => {
      let changed = false;
      const updated = prev.map((p) => {
        if (p.id !== projectId) return p;
        changed = true;
        return typeof updater === 'function' ? updater(p) : { ...p, ...updater, updatedAt: Date.now() };
      });
      if (changed) saveProjectsToLocalAndSync(updated);
      return updated;
    });
  }, []);

  const handleAskAssistantFromWorkflow = useCallback(({ prompt, action } = {}) => {
    if (!prompt) return;
    setQueuedDesignRequest({
      id: `workflow_ask_${Date.now()}`,
      text: prompt,
      action: action || 'inspect_workflow_node',
    });
    setActiveView('agent');
    setMobileSidebarOpen(false);
  }, []);

  const handleAssistantRequestConsumed = useCallback((id) => {
    setQueuedDesignRequest((current) => (current?.id === id ? null : current));
  }, []);

  const handleAssetAdopted = useCallback((asset) => {
    const proj = projects.find((p) => p.id === asset.projectId);
    if (!proj) return;
    const updatedAssets = { ...proj.assets };
    let found = false;
    Object.keys(updatedAssets).forEach((cat) => {
      updatedAssets[cat] = updatedAssets[cat].map((a) =>
        a.id === asset.id
          ? (() => {
            found = true;
            return { ...a, status: 'adopted', adoptedAt: Date.now() };
          })()
          : a
      );
    });
    if (!found) {
      const category = asset.category || 'draft';
      updatedAssets[category] = [
        ...(updatedAssets[category] || []),
        {
          ...asset,
          category,
          status: 'adopted',
          projectId: asset.projectId || proj.id,
          adoptedAt: Date.now(),
        },
      ];
    }
    handleAssetsChange(asset.projectId, updatedAssets);
  }, [projects, handleAssetsChange]);

  const handleAssetRejected = useCallback((asset) => {
    const proj = projects.find((p) => p.id === asset.projectId);
    if (!proj) return;
    const updatedAssets = { ...proj.assets };
    Object.keys(updatedAssets).forEach((cat) => {
      updatedAssets[cat] = updatedAssets[cat].filter((a) => a.id !== asset.id);
    });
    handleAssetsChange(asset.projectId, updatedAssets);
  }, [projects, handleAssetsChange]);

  const handleChangeLLM = useCallback((id) => {
    setLlm(id);
    const cfg = getConfiguredModels();
    const next = { ...cfg, llm: id };
    saveModelConfig(next);
    syncToParentAgent('model_change', { type: 'llm', id });
  }, []);

  const handleChangeImageModel = useCallback((id) => {
    setImageModel(id);
    const cfg = getConfiguredModels();
    const next = { ...cfg, imageModel: id };
    saveModelConfig(next);
    syncToParentAgent('model_change', { type: 'imageModel', id, config: buildImageModelRuntimeConfig(id) });
  }, []);

  const handleExportDelivery = useCallback(async () => {
    if (!currentProject) return;
    setDeliveryExportState({ state: 'preparing', label: '正在整理交付包' });
    try {
      const preparedProject = prepareDeliveryExportProject(currentProject);
      if (!preparedProject) return;
      const zipResult = buildDeliveryBundleZipArchive(preparedProject, { prepare: false });
      handleProjectUpdate(currentProject.id, preparedProject);

      let syncResult = { success: false, error: '本地创作服务未连接', written: [] };
      if (openclaw.url) {
        setDeliveryExportState({ state: 'syncing', label: '正在同步到本地服务' });
        syncResult = await syncWorkspaceFiles(getDeliveryBundleWorkspaceFiles(zipResult.bundle));
      }

      downloadDeliveryBundleArchive(preparedProject, zipResult.archive);
      setDeliveryExportState({
        state: syncResult.success ? 'synced' : 'downloaded',
        label: syncResult.success ? '已下载并同步' : '已下载，未同步',
      });
      window.setTimeout(() => {
        setDeliveryExportState({ state: 'idle', label: '' });
      }, 2600);
    } catch (err) {
      setDeliveryExportState({ state: 'error', label: err.message || '导出失败' });
      window.setTimeout(() => {
        setDeliveryExportState({ state: 'idle', label: '' });
      }, 3600);
    }
  }, [currentProject, handleProjectUpdate]);

  const handleAddCustomModel = useCallback((type, model) => {
    const updated = addCustomModel(type, model);
    syncToParentAgent('custom_model_added', { type, model });
    return updated;
  }, []);

  const handleRemoveCustomModel = useCallback((type, id) => {
    const updated = removeCustomModel(type, id);
    syncToParentAgent('custom_model_removed', { type, id });
    return updated;
  }, []);

  // Listen for model sync from parent
  useEffect(() => {
    function handleMessage(e) {
      const msg = e.data;
      if (!msg || msg.source !== 'graphic-design-pro-agent') return;
      if (msg.type === 'model_sync') {
        if (msg.data.llm) setLlm(msg.data.llm);
        if (msg.data.imageModel) setImageModel(msg.data.imageModel);
        if (msg.data.modelsDetected) setModelsDetected(true);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Dynamic props per view
  const getViewProps = () => {
    switch (activeView) {
      case 'agent':
        return {
          project: currentProject,
          projects,
          onProjectSwitch: handleProjectSwitch,
          onProjectCreate: handleProjectCreate,
          onAssetAdopted: handleAssetAdopted,
          onAssetRejected: handleAssetRejected,
          onAssetsChange: handleAssetsChange,
          onProjectUpdate: handleProjectUpdate,
          llm, imageModel,
          references: currentProject?.references || [],
          assets: currentProject?.assets || {},
          queuedDesignRequest,
          onQueuedDesignRequestConsumed: handleAssistantRequestConsumed,
          uiLanguage,
        };
      case 'assets':
        return { projects, onAssetsChange: handleAssetsChange, uiLanguage };
      case 'workflow':
        return {
          project: currentProject,
          projects,
          onProjectSwitch: handleProjectSwitch,
          onProjectCreate: handleProjectCreate,
          onProjectUpdate: handleProjectUpdate,
          onAskAssistant: handleAskAssistantFromWorkflow,
          llm,
          imageModel,
          imageModelConfig: buildImageModelRuntimeConfig(imageModel),
          agentEnv,
          connectionStatus,
          uiLanguage,
        };
      case 'references':
        return { projects, onReferencesChange: handleReferencesChange, uiLanguage };
      case 'profile':
        return { llm, uiLanguage };
      default:
        return {};
    }
  };

  const ActiveComponent = VIEW_COMPONENTS[activeView] || DesignerAgent;

  return (
    <div className="h-screen w-screen flex flex-col bg-gdpro-bg text-gdpro-text overflow-hidden relative">
      <Header
        onExport={() => exportGdproProject(currentProject)}
        onExportDelivery={handleExportDelivery}
        onToggleMobileSidebar={() => setMobileSidebarOpen((v) => !v)}
        currentProject={currentProject}
        llm={llm}
        imageModel={imageModel}
        onChangeLLM={handleChangeLLM}
        onChangeImageModel={handleChangeImageModel}
        agentEnv={agentEnv}
        modelsDetected={modelsDetected}
        deliveryExportState={deliveryExportState}
        uiLanguage={uiLanguage}
        onUiLanguageChange={handleUiLanguageChange}
      />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          activeView={activeView}
          onChange={(view) => { setActiveView(view); setMobileSidebarOpen(false); }}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          projects={projects}
          currentProjectId={currentProjectId}
          onProjectSwitch={handleProjectSwitch}
          onProjectCreate={handleProjectCreate}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          connectionStatus={connectionStatus}
          onOpenSettings={() => setShowSettings(true)}
          agents={availableAgents}
          currentAgentEnv={agentEnv}
          onSwitchAgent={handleSwitchAgent}
          onDisconnect={handleDisconnect}
          uiLanguage={uiLanguage}
        />

        <main className="flex-1 min-w-0 overflow-hidden">
          <ErrorBoundary>
            <Suspense fallback={<ViewLoadingFallback view={activeView} uiLanguage={uiLanguage} />}>
              <ActiveComponent {...getViewProps()} />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <ConnectionSetup
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onConnect={handleConnect}
        uiLanguage={uiLanguage}
      />

      {showAgentSelector && (
        <AgentSelector
          agents={availableAgents}
          currentEnv={agentEnv}
          isConnected={connectionStatus === 'connected'}
          onSelect={(agent) => {
            setShowAgentSelector(false);
            handleConnect(agent.gateway_url, agent.gateway_token, agent.env);
          }}
          onClose={() => setShowAgentSelector(false)}
          onDisconnect={() => {
            setShowAgentSelector(false);
            handleDisconnect();
          }}
          uiLanguage={uiLanguage}
        />
      )}
    </div>
  );
}
