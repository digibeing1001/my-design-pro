import React, { useState, useRef, useEffect } from 'react';
import { Brain, Image as ImageIcon, ChevronDown, Check, Settings, Plus, Trash2, ExternalLink, KeyRound, PlugZap } from 'lucide-react';
import {
  getLanguageModels,
  getImageModels,
  addCustomModel,
  removeCustomModel,
  getCustomModels,
  IMAGE_PROVIDER_PRESETS,
  getImageProviderById,
  getImageProviderForModel,
  getImageProviderCapabilities,
  getImageModelConnection,
  saveImageModelConnection,
  removeImageModelConnection,
  isImageProviderConfigured,
} from '../data/modelConfig';
import { uiText } from '../lib/uiLanguage';

const MODEL_TEXT = {
  en: {
    example: {
      name: 'Preview model',
      provider: 'Not configured',
      desc: 'Connect a local studio partner or add a provider key to use it',
    },
    names: {
      wanxiang: 'Wanxiang',
      hunyuan: 'Hunyuan Image',
      cogview: 'CogView',
      'recraft-vector': 'Recraft Vector',
      'fal-media': 'fal Multi-model',
      'flux-2': 'FLUX.2',
      'liblib-star': 'Liblib Star',
      'custom-image-endpoint': 'Custom visual channel',
    },
    desc: {
      'gpt-4o': 'Strong general planning for complex design reasoning',
      'claude-sonnet': 'Strong visual judgment for design analysis',
      'claude-opus': 'Deep reasoning for brand strategy',
      'gemini-pro': 'Multimodal planning for image and text analysis',
      deepseek: 'Strong Chinese reasoning with efficient cost',
      kimi: 'Long-context reading for documents and briefs',
      'gpt-image': 'Reliable instruction following and image editing for concept refinement',
      'recraft-vector': 'Vector, icon, and brand-style graphics for deliverable assets',
      'fal-media': 'A shared channel for switching visual generators quickly',
      'flux-2': 'High-control visual exploration with the FLUX family',
      seedream: 'Strong Chinese understanding and multi-reference brand exploration',
      wanxiang: 'Good for Chinese commercial materials, editing, and ecommerce scenes',
      'liblib-star': 'Domestic creator-platform access for common Chinese design workflows',
      hunyuan: 'Useful for Chinese aesthetics and local service setups',
      'stable-image': 'Broad style coverage for moodboards and visual directions',
      flux: 'Open generator access for teams that swap versions often',
      ideogram: 'Good for poster directions and text-heavy visual exploration',
      imagen: 'Stable natural-image quality for references and concepts',
      cogview: 'Friendly to Chinese briefs and quick visual exploration',
      'custom-image-endpoint': 'Use a local partner or team-hosted visual channel',
    },
    providerNames: {
      volcengine: 'Volcengine Ark',
      'alibaba-dashscope': 'Alibaba Model Studio',
      'tencent-hunyuan': 'Tencent Hunyuan',
      'custom-openai-compatible': 'Custom connection',
      zhipu: 'Zhipu',
      'liblib-xingliu': 'LiblibAI Star',
    },
    providerModelNames: {
      'alibaba-dashscope': 'Wanxiang',
      'tencent-hunyuan': 'Hunyuan Image',
      'liblib-xingliu': 'Star Image',
      'custom-openai-compatible': 'Custom visual channel',
    },
    providerRegion: {
      'custom-openai-compatible': 'Custom',
    },
  },
};

function modelName(model, language) {
  if (language === 'en' && model?.id === 'example') return MODEL_TEXT.en.example.name;
  if (language === 'en' && MODEL_TEXT.en.names[model?.id]) return MODEL_TEXT.en.names[model.id];
  return model?.name || '';
}

function modelProvider(model, language) {
  if (language === 'en' && model?.id === 'example') return MODEL_TEXT.en.example.provider;
  return model?.provider || '';
}

function modelDescription(model, language) {
  if (language === 'en' && model?.id === 'example') return MODEL_TEXT.en.example.desc;
  if (language === 'en') return MODEL_TEXT.en.desc[model?.id] || model?.desc || '';
  return model?.desc || '';
}

function providerName(provider, language) {
  if (language === 'en') return MODEL_TEXT.en.providerNames[provider?.id] || provider?.name || '';
  return provider?.name || '';
}

function providerModelName(provider, language) {
  if (language === 'en') return MODEL_TEXT.en.providerModelNames[provider?.id] || provider?.modelName || '';
  return provider?.modelName || '';
}

function providerRegion(provider, language) {
  if (language === 'en') return MODEL_TEXT.en.providerRegion[provider?.id] || provider?.region || '';
  return provider?.region || '';
}

function providerDescription(provider, language) {
  if (language === 'en') return MODEL_TEXT.en.desc[provider?.modelId] || MODEL_TEXT.en.desc[provider?.id] || provider?.desc || '';
  return provider?.desc || '';
}

function localizedCapabilityValue(value, language) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[language] || value.zh || value.en || '';
}

function capabilityOutputs(provider, language) {
  const capabilities = getImageProviderCapabilities(provider);
  return (capabilities?.outputs || [])
    .map((item) => localizedCapabilityValue(item, language))
    .filter(Boolean);
}

function capabilityGuidance(provider, language) {
  return localizedCapabilityValue(getImageProviderCapabilities(provider)?.guidance, language);
}

function capabilityRouteLabel(provider, copy) {
  const capabilities = getImageProviderCapabilities(provider);
  return copy.routeLabels?.[capabilities?.role] || copy.routeLabels?.custom || capabilities?.role || '';
}

function capabilityDeliveryLabel(provider, copy) {
  const capabilities = getImageProviderCapabilities(provider);
  if (capabilities?.finalDelivery) return copy.sourceCandidate;
  if (capabilities?.editableSource || capabilities?.vectorOutput) return copy.editableSource;
  return copy.conceptOnly;
}

function ModelDropdown({ label, selected, onSelect, icon: Icon, isDetected, onConfigure, getModels, alwaysAvailable = false, copy, language }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const models = getModels(isDetected);
  const selectedModel = models.find((m) => m.id === selected) || models[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-[3px] rounded-lg text-[11px] border ${
          open ? 'text-gdpro-accent' : 'text-gdpro-text-secondary hover:text-gdpro-text'
        }`}
        style={open ? { background: 'rgba(15,159,142,0.1)', borderColor: 'rgba(15,159,142,0.22)' } : { background: 'rgba(255,255,255,0.92)', borderColor: 'rgba(24,35,48,0.12)' }}
      >
        <Icon className="w-3 h-3" strokeWidth={2} />
        <span className="hidden sm:inline max-w-[80px] truncate font-medium">{modelName(selectedModel, language)}</span>
        {!isDetected && !alwaysAvailable && (
          <span className="text-[9px] px-1 py-[1px] rounded bg-gdpro-text-muted/15 text-gdpro-text-muted ml-0.5 font-medium">{copy.previewBadge}</span>
        )}
        <ChevronDown className={`w-2.5 h-2.5 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} strokeWidth={2.5} />
      </button>

      {open && (
        <div className="mac-menu right-0 top-full mt-1 w-64">
          <div className="px-2.5 py-1.5 text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-wider">{label}</div>

          {!isDetected && !alwaysAvailable && (
            <div className="px-2.5 py-1.5" style={{ background: 'rgba(45,212,191,0.06)' }}>
              <p className="text-[11px] text-gdpro-text-secondary leading-relaxed">
                {copy.previewNote}
              </p>
            </div>
          )}

          <div className="max-h-52 overflow-y-auto py-0.5">
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => { onSelect(model.id); setOpen(false); }}
                className={`mac-menu-item ${selected === model.id ? 'text-gdpro-accent' : ''}`}
                style={selected === model.id ? { background: 'rgba(15,159,142,0.1)' } : {}}
              >
                <span className="flex h-6 min-w-6 items-center justify-center rounded-md border border-gdpro-border bg-gdpro-bg-surface px-1 text-[8px] font-semibold text-gdpro-text-secondary">
                  {model.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[12px] font-medium ${selected === model.id ? 'text-gdpro-accent' : 'text-gdpro-text'}`}>
                    {modelName(model, language)}
                  </div>
                  <div className="text-[10px] text-gdpro-text-muted">{modelProvider(model, language)} · {modelDescription(model, language)}</div>
                </div>
                {selected === model.id && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />}
              </button>
            ))}
          </div>

          <div className="mac-divider" />

          <button
            onClick={() => { onConfigure?.(); setOpen(false); }}
            className="mac-menu-item text-gdpro-text-muted"
          >
            <Settings className="w-3.5 h-3.5" strokeWidth={2} />
            {copy.manageConnections}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ModelSelector({ llm, imageModel, onChangeLLM, onChangeImageModel, modelsDetected, uiLanguage }) {
  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState('image');
  const createEmptyModel = () => ({
    name: '',
    provider: '',
    icon: 'CU',
    desc: '',
    type: 'image',
    apiKey: '',
    baseUrl: '',
    model: '',
    size: '1024x1024',
  });
  const [newModel, setNewModel] = useState(() => createEmptyModel());
  const [customModels, setCustomModels] = useState(() => getCustomModels());
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [selectedProviderId, setSelectedProviderId] = useState(() => getImageProviderForModel(imageModel)?.id || IMAGE_PROVIDER_PRESETS[0]?.id || 'openai');
  const selectedProvider = getImageProviderById(selectedProviderId)
    || (getImageProviderForModel(imageModel)?.id === selectedProviderId ? getImageProviderForModel(imageModel) : null)
    || IMAGE_PROVIDER_PRESETS[0];
  const [connectionValues, setConnectionValues] = useState(() => ({
    ...(selectedProvider?.defaultValues || {}),
    ...getImageModelConnection(selectedProviderId),
  }));
  const copy = uiText('modelSelector', uiLanguage);

  useEffect(() => {
    const provider = getImageProviderForModel(imageModel);
    if (provider) setSelectedProviderId(provider.id);
  }, [imageModel]);

  useEffect(() => {
    const provider = getImageProviderById(selectedProviderId)
      || (getImageProviderForModel(imageModel)?.id === selectedProviderId ? getImageProviderForModel(imageModel) : null);
    setConnectionValues({
      ...(provider?.defaultValues || {}),
      ...getImageModelConnection(selectedProviderId),
    });
  }, [selectedProviderId, connectionRevision, imageModel, customModels]);

  const handleAddModel = () => {
    if (!newModel.name.trim() || !newModel.provider.trim()) return;
    const id = `custom_${Date.now()}`;
    const payload = {
      ...newModel,
      id,
      name: newModel.name.trim(),
      provider: newModel.provider.trim(),
      icon: (newModel.icon || 'CU').slice(0, 3).toUpperCase(),
      model: newModel.model.trim() || newModel.name.trim(),
      baseUrl: newModel.baseUrl.trim(),
      size: newModel.size.trim() || '1024x1024',
    };
    const { apiKey, ...modelRecord } = payload;
    const updated = addCustomModel(newModel.type, modelRecord);
    if (newModel.type === 'image') {
      saveImageModelConnection(id, {
        apiKey,
        baseUrl: payload.baseUrl,
        model: payload.model,
        size: payload.size,
      });
      onChangeImageModel?.(id);
      setSelectedProviderId(id);
    }
    setCustomModels(updated);
    setConnectionRevision((value) => value + 1);
    setNewModel(createEmptyModel());
  };

  const handleRemoveModel = (type, id) => {
    const updated = removeCustomModel(type, id);
    if (type === 'image') {
      removeImageModelConnection(id);
      if (imageModel === id) {
        const fallback = IMAGE_PROVIDER_PRESETS[0]?.modelId || 'seedream';
        onChangeImageModel?.(fallback);
        setSelectedProviderId(IMAGE_PROVIDER_PRESETS[0]?.id || 'openai');
      }
      setConnectionRevision((value) => value + 1);
    }
    setCustomModels(updated);
  };

  const handleUseCustomImageConnection = (model) => {
    if (!model?.id) return;
    setSelectedProviderId(model.id);
    onChangeImageModel?.(model.id);
    setConnectionRevision((value) => value + 1);
  };

  const handleSaveConnection = () => {
    if (!selectedProvider) return;
    saveImageModelConnection(selectedProvider.id, connectionValues);
    setConnectionRevision((value) => value + 1);
    onChangeImageModel?.(selectedProvider.modelId);
  };

  const requiredMissing = (selectedProvider?.fields || [])
    .filter((field) => field.required && !String(connectionValues[field.key] || '').trim())
    .map((field) => field.key);
  const selectedCapabilityOutputs = capabilityOutputs(selectedProvider, uiLanguage);
  const selectedCapabilityGuidance = capabilityGuidance(selectedProvider, uiLanguage);
  const getFieldCopy = (field) => ({
    label: copy.fieldLabels?.[field.key] || field.label,
    placeholder: field.secret ? copy.accessKeyPlaceholder : field.placeholder,
    help: copy.fieldHelp?.[field.key] || field.help,
  });

  return (
    <>
      <div className="flex items-center gap-1.5">
        <ModelDropdown
          label={copy.planning}
          selected={llm}
          onSelect={onChangeLLM}
          icon={Brain}
          isDetected={modelsDetected}
          getModels={(d) => getLanguageModels(d)}
          copy={copy}
          language={uiLanguage}
        />
        <div className="w-px h-3" style={{ background: 'rgba(24,35,48,0.14)' }} />
        <ModelDropdown
          label={copy.imageService}
          selected={imageModel}
          onSelect={onChangeImageModel}
          icon={ImageIcon}
          isDetected={modelsDetected}
          getModels={(d) => getImageModels(d)}
          onConfigure={() => { setConfigTab('image'); setShowConfig(true); }}
          alwaysAvailable
          copy={copy}
          language={uiLanguage}
        />
        <button
          type="button"
          onClick={() => { setConfigTab('image'); setShowConfig(true); }}
          className="hidden sm:inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gdpro-border bg-gdpro-bg-elevated text-gdpro-text-muted hover:text-gdpro-text hover:border-gdpro-border-light focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
          title={copy.configureImageService}
          aria-label={copy.configureImageService}
        >
          <Settings className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>

      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop animate-fade-in p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfig(false); }}>
          <div className="w-full max-w-lg p-5 animate-scale-in max-h-[85vh] overflow-y-auto rounded-lg gdpro-modal-shell">
            <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-gdpro-text tracking-tight">{copy.settingsTitle}</h2>
              <button onClick={() => setShowConfig(false)} className="p-1.5 rounded-lg hover:bg-gdpro-bg-hover transition-colors">
                <Settings className="w-4 h-4 text-gdpro-text-secondary" strokeWidth={1.5} />
              </button>
            </div>

            <div className="mac-segment mb-4">
              {[
                { id: 'image', label: copy.tabs.image },
                { id: 'llm', label: copy.tabs.llm },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setConfigTab(tab.id)}
                  className={`mac-segment-btn ${configTab === tab.id ? 'mac-segment-btn-active' : ''}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {configTab === 'image' && (
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <h3 className="text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-wider">{copy.connectionTitle}</h3>
                    <p className="text-[10px] text-gdpro-text-muted mt-0.5">
                      {copy.connectionIntro}
                    </p>
                  </div>
                  <div className="text-[10px] text-gdpro-text-muted shrink-0">{copy.presetsCount(IMAGE_PROVIDER_PRESETS.length)}</div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {IMAGE_PROVIDER_PRESETS.map((provider) => {
                    const selectedProviderActive = provider.id === selectedProviderId;
                    const configured = isImageProviderConfigured(provider.id);
                    return (
                      <button
                        type="button"
                        key={provider.id}
                        onClick={() => setSelectedProviderId(provider.id)}
                        className={`text-left rounded-lg px-2.5 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent ${
                          selectedProviderActive
                            ? 'gdpro-provider-card-active'
                            : 'gdpro-provider-card'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`w-7 h-7 rounded-md border flex items-center justify-center text-[9px] font-semibold shrink-0 ${
                            selectedProviderActive
                              ? 'border-gdpro-accent/45 bg-gdpro-accent/15 text-gdpro-accent'
                              : 'border-gdpro-border bg-gdpro-bg-surface text-gdpro-text-secondary'
                          }`}>
                            {provider.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <div className="text-[11px] font-semibold text-gdpro-text truncate">{providerName(provider, uiLanguage)}</div>
                              {configured && <span className="w-1.5 h-1.5 rounded-full bg-gdpro-success shrink-0" />}
                            </div>
                            <div className="text-[9px] text-gdpro-text-muted truncate">{providerModelName(provider, uiLanguage)} · {providerRegion(provider, uiLanguage)}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedProvider && (
                  <div className="mt-3 rounded-lg gdpro-surface-tile p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <PlugZap className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
                          <div className="text-[12px] font-semibold text-gdpro-text">{providerName(selectedProvider, uiLanguage)} / {providerModelName(selectedProvider, uiLanguage)}</div>
                        </div>
                        <p className="text-[10px] leading-relaxed text-gdpro-text-muted mt-1">{providerDescription(selectedProvider, uiLanguage)}</p>
                      </div>
                      <span className={`px-1.5 py-[2px] rounded-md border text-[9px] shrink-0 ${
                        requiredMissing.length
                          ? 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20'
                          : 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20'
                      }`}>
                        {requiredMissing.length ? copy.missing : copy.ready}
                      </span>
                    </div>

                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(24,35,48,0.1)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-wider">{copy.capabilityTitle}</span>
                        <span className="rounded-md border border-gdpro-accent/20 bg-gdpro-accent/10 px-1.5 py-[2px] text-[9px] font-semibold text-gdpro-accent">
                          {capabilityRouteLabel(selectedProvider, copy)}
                        </span>
                      </div>
                      {selectedCapabilityGuidance && (
                        <p className="mt-1 text-[10px] leading-relaxed text-gdpro-text-secondary">{selectedCapabilityGuidance}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] text-gdpro-text-muted">{copy.outputFormats}</span>
                        {selectedCapabilityOutputs.map((item) => (
                          <span key={item} className="rounded-md border border-gdpro-border bg-gdpro-bg-surface px-1.5 py-[2px] text-[9px] text-gdpro-text-secondary">
                            {item}
                          </span>
                        ))}
                        <span className="rounded-md border border-gdpro-border-light bg-white px-1.5 py-[2px] text-[9px] font-medium text-gdpro-text-secondary">
                          {capabilityDeliveryLabel(selectedProvider, copy)}
                        </span>
                      </div>
                      <div className="mt-2 rounded-md border border-gdpro-accent/15 bg-gdpro-accent/5 px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold text-gdpro-text">{copy.partnerHandoffTitle}</span>
                          <span className="text-[9px] font-semibold text-gdpro-accent">{copy.partnerHandoffBadge}</span>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-gdpro-text-secondary">
                          {requiredMissing.length ? copy.partnerHandoffMissing : copy.partnerHandoffReady}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {selectedProvider.fields.map((field) => {
                        const fieldCopy = getFieldCopy(field);
                        return (
                        <div key={field.key}>
                          <label className="gdpro-label flex items-center gap-1.5">
                            {field.secret && <KeyRound className="w-3 h-3" strokeWidth={2} />}
                            {fieldCopy.label}{field.required ? ' *' : ''}
                          </label>
                          <input
                            className="gdpro-input text-[12px] py-[5px] font-mono"
                            type={field.type || 'text'}
                            value={connectionValues[field.key] || ''}
                            onChange={(e) => setConnectionValues((values) => ({ ...values, [field.key]: e.target.value }))}
                            placeholder={fieldCopy.placeholder}
                          />
                          {fieldCopy.help && <p className="text-[9px] text-gdpro-text-muted mt-0.5">{fieldCopy.help}</p>}
                        </div>
                      );
                      })}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveConnection}
                        className="gdpro-button text-[12px] flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={2.4} />
                        {copy.saveAndUse}
                      </button>
                      {selectedProvider.keyUrl && (
                        <a
                          href={selectedProvider.keyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-[7px] rounded-md border border-gdpro-border bg-gdpro-bg-surface text-[12px] text-gdpro-text-secondary hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent inline-flex items-center gap-1.5"
                        >
                          {copy.getKey}
                          <ExternalLink className="w-3 h-3" strokeWidth={2} />
                        </a>
                      )}
                      {selectedProvider.docsUrl && (
                        <a
                          href={selectedProvider.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-[7px] rounded-md border border-gdpro-border bg-gdpro-bg-surface text-[12px] text-gdpro-text-secondary hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent inline-flex items-center gap-1.5"
                        >
                          {copy.viewDocs}
                          <ExternalLink className="w-3 h-3" strokeWidth={2} />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mb-4">
              <h3 className="text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-wider mb-1.5">{copy.customConnections}</h3>
              {(customModels[configTab] || []).length === 0 ? (
                <p className="text-[11px] text-gdpro-text-muted py-1">{copy.noCustom}</p>
              ) : (
                <div className="space-y-1">
                  {(customModels[configTab] || []).map((m) => (
                    <div key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg gdpro-surface-tile">
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-md border border-gdpro-border bg-gdpro-bg-surface px-1 text-[8px] font-semibold text-gdpro-text-secondary">{m.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-gdpro-text truncate">{m.name}</div>
                        <div className="text-[10px] text-gdpro-text-muted truncate">
                          {m.provider}{configTab === 'image' && m.model ? ` · ${m.model}` : ''}
                        </div>
                      </div>
                      {configTab === 'image' && (
                        <span className={`rounded-md border px-1.5 py-[2px] text-[9px] shrink-0 ${
                          isImageProviderConfigured(m.id)
                            ? 'border-gdpro-success/20 bg-gdpro-success/10 text-gdpro-success'
                            : 'border-gdpro-warning/20 bg-gdpro-warning/10 text-gdpro-warning'
                        }`}>
                          {isImageProviderConfigured(m.id) ? copy.ready : copy.incomplete}
                        </span>
                      )}
                      {configTab === 'image' && (
                        <button
                          type="button"
                          onClick={() => handleUseCustomImageConnection(m)}
                          className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 transition-colors ${
                            imageModel === m.id
                              ? 'border-gdpro-accent/25 bg-gdpro-accent/10 text-gdpro-accent'
                              : 'border-gdpro-border bg-gdpro-bg-elevated text-gdpro-text-muted hover:text-gdpro-text'
                          }`}
                        >
                          {imageModel === m.id ? copy.current : copy.use}
                        </button>
                      )}
                      <button onClick={() => handleRemoveModel(configTab, m.id)}
                        className="p-1 rounded-lg hover:bg-gdpro-danger/10 text-gdpro-text-muted hover:text-gdpro-danger transition-colors">
                        <Trash2 className="w-3 h-3" strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3" style={{ borderTop: '1px solid rgba(24,35,48,0.12)' }}>
              <h3 className="text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-wider mb-2">{copy.addCustom}</h3>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="gdpro-label">{copy.connectionName}</label>
                    <input className="gdpro-input text-[12px] py-[5px]" value={newModel.name}
                      onChange={(e) => setNewModel((m) => ({ ...m, name: e.target.value }))}
                      placeholder={copy.connectionNamePlaceholder} />
                  </div>
                  <div>
                    <label className="gdpro-label">{copy.provider}</label>
                    <input className="gdpro-input text-[12px] py-[5px]" value={newModel.provider}
                      onChange={(e) => setNewModel((m) => ({ ...m, provider: e.target.value }))}
                      placeholder={copy.providerPlaceholder} />
                  </div>
                </div>
                <div>
                  <label className="gdpro-label">{copy.description}</label>
                  <input className="gdpro-input text-[12px] py-[5px]" value={newModel.desc}
                    onChange={(e) => setNewModel((m) => ({ ...m, desc: e.target.value }))}
                    placeholder={copy.descriptionPlaceholder} />
                </div>
                {newModel.type === 'image' && (
                  <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated/70 p-2.5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <PlugZap className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
                    <h4 className="text-[11px] font-semibold text-gdpro-text-secondary">{copy.imageInfo}</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="gdpro-label">{copy.modelName}</label>
                        <input className="gdpro-input text-[12px] py-[5px]" value={newModel.model}
                          onChange={(e) => setNewModel((m) => ({ ...m, model: e.target.value }))}
                          placeholder="provider/model-id" />
                      </div>
                      <div>
                        <label className="gdpro-label">{copy.defaultSize}</label>
                        <input className="gdpro-input text-[12px] py-[5px]" value={newModel.size}
                          onChange={(e) => setNewModel((m) => ({ ...m, size: e.target.value }))}
                          placeholder="1024x1024" />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="gdpro-label">{copy.connectionAddress}</label>
                      <input className="gdpro-input text-[12px] py-[5px]" value={newModel.baseUrl}
                        onChange={(e) => setNewModel((m) => ({ ...m, baseUrl: e.target.value }))}
                        placeholder="https://your-gateway.example/v1" />
                    </div>
                    <div className="mt-2">
                      <label className="gdpro-label">{copy.accessKey}</label>
                      <input className="gdpro-input text-[12px] py-[5px] font-mono" type="password" value={newModel.apiKey}
                        onChange={(e) => setNewModel((m) => ({ ...m, apiKey: e.target.value }))}
                        placeholder={copy.accessKeyPlaceholder} />
                      <p className="text-[10px] text-gdpro-text-muted mt-0.5">{copy.localOnly}</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="gdpro-label">{copy.icon}</label>
                    <input className="gdpro-input text-[12px] py-[5px]" value={newModel.icon}
                      onChange={(e) => setNewModel((m) => ({ ...m, icon: e.target.value.slice(0, 2) }))}
                      placeholder="CU" maxLength={3} />
                  </div>
                  <div>
                    <label className="gdpro-label">{copy.purpose}</label>
                    <select className="gdpro-input text-[12px] py-[5px]"
                      value={newModel.type}
                      onChange={(e) => setNewModel((m) => ({ ...m, type: e.target.value }))}>
                      <option value="image">{copy.imageService}</option>
                      <option value="llm">{copy.planning}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <button onClick={handleAddModel} disabled={!newModel.name.trim() || !newModel.provider.trim()}
                  className="gdpro-button flex-1 disabled:opacity-40 text-[12px] flex items-center justify-center gap-1">
                  <Plus className="w-3 h-3" strokeWidth={2.5} />
                  {copy.addConnection}
                </button>
                <button onClick={() => setShowConfig(false)} className="gdpro-button-secondary flex-1 text-[12px]">{copy.close}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
