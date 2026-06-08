import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Compass, Paperclip, Send, Plus, Check, X, PenLine, Loader2, FolderOpen, FolderPlus, Wand2, Trash2 } from 'lucide-react';
import MarkdownRender from './MarkdownRender';
import AssetMentionDropdown from './AssetMentionDropdown';
import StructuredOutputRenderer from './StructuredOutputRenderer';
import DesignControlPanel from './DesignControlPanel';
import { parseFile } from '../lib/parser';

import { saveToLocal, loadFromLocal } from '../lib/storage';
import { openclaw } from '../lib/api';
import { PHASES } from '../data/projects';
import { buildSystemPrompt, buildContextSummary } from '../lib/contextAssembler';
import { applyAgentControl } from '../lib/agentControl';
import { buildDesignControlState } from '../lib/designControl';
import { getQuickActions, canProceedToNext, getPhaseDescription, canGenerateImage, PHASE_CONFIG } from '../lib/phaseGuard';
import { buildImageModelRuntimeConfig } from '../data/modelConfig';
import { candidateFromAssetDecision, extractPreferenceCandidatesFromText, queuePreferenceCandidates } from '../lib/designerPreferenceLearning';
import { uiText } from '../lib/uiLanguage';

const RISK_LABELS = {
  critical: '高风险',
  high: '需注意',
  medium: '可控',
  low: '稳定',
  info: '稳定',
};

const BUTTON_TYPES = {
  ADOPT: 'adopt', REJECT: 'reject', CHOOSE: 'choose',
  CONFIRM: 'confirm', NEXT_PHASE: 'next_phase', MODIFY: 'modify',
};

function ActionButton({ type, label, onClick, disabled }) {
  const styles = {
    [BUTTON_TYPES.ADOPT]: 'bg-gdpro-success/10 text-gdpro-success border-gdpro-success/20 hover:bg-gdpro-success/15',
    [BUTTON_TYPES.REJECT]: 'bg-gdpro-danger/10 text-gdpro-danger border-gdpro-danger/20 hover:bg-gdpro-danger/15',
    [BUTTON_TYPES.CHOOSE]: 'bg-gdpro-accent-dim text-gdpro-accent border-gdpro-accent/20 hover:bg-gdpro-accent/15',
    [BUTTON_TYPES.CONFIRM]: 'bg-gdpro-accent text-gdpro-bg border-gdpro-accent hover:bg-gdpro-accent-hover',
    [BUTTON_TYPES.NEXT_PHASE]: 'bg-gdpro-accent-dim text-gdpro-accent border-gdpro-accent/20 hover:bg-gdpro-accent/15',
    [BUTTON_TYPES.MODIFY]: 'bg-gdpro-bg-hover text-gdpro-text-secondary border-gdpro-border hover:border-gdpro-border-light',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-3 py-[5px] rounded-md text-[12px] font-medium border transition-colors duration-100 ${styles[type] || styles[BUTTON_TYPES.CHOOSE]} disabled:opacity-40`}>
      {label}
    </button>
  );
}

function AssetCard({ asset, onAdopt, onReject }) {
  const isImage = asset.type === 'image' || asset.type === 'svg';
  const phaseInfo = PHASES.find((p) => p.id === asset.phase);
  return (
    <div className="gdpro-card gdpro-card-hover overflow-hidden hover:border-gdpro-border-light rounded-lg">
      <div className="aspect-video relative flex items-center justify-center" style={{ background: 'rgba(238,242,245,0.75)' }}>
        {isImage ? (
          <img src={asset.previewUrl || asset.url} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-mono font-bold text-gdpro-accent">{asset.type?.toUpperCase()}</span>
        )}
        {asset.status === 'adopted' && (
          <div className="absolute top-2 right-2 px-1.5 py-[2px] rounded-md bg-gdpro-success text-gdpro-bg text-[10px] font-bold flex items-center gap-0.5">
            <Check className="w-2.5 h-2.5" strokeWidth={3} /> 已归档
          </div>
        )}
      </div>
      <div className="p-2.5">
        <span className="text-[10px] px-1.5 py-[1px] rounded bg-gdpro-bg-hover text-gdpro-text-muted font-medium">{phaseInfo?.name}</span>
        <p className="text-[12px] text-gdpro-text font-medium truncate mt-1">{asset.name}</p>
        {asset.status === 'pending' && (
          <div className="flex gap-1.5 mt-2">
            <ActionButton type={BUTTON_TYPES.ADOPT} label="采用" onClick={() => onAdopt(asset)} />
            <ActionButton type={BUTTON_TYPES.REJECT} label="不采用" onClick={() => onReject(asset)} />
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectSelector({ projects, currentProjectId, onSwitch, onCreate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const current = projects.find((p) => p.id === currentProjectId);

  const handleDelete = (event, project) => {
    event.stopPropagation();
    const name = project?.name || project?.brandName || 'Untitled project';
    if (!window.confirm(`删除「${name}」？项目记录会从工作台移除。`)) return;
    onDelete?.(project.id);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-2.5 py-[5px] rounded-md text-[12px] font-medium transition-colors border ${
          open
            ? 'border-gdpro-info bg-gdpro-info/10 text-gdpro-info'
            : 'border-gdpro-border bg-gdpro-bg-surface text-gdpro-text-secondary hover:text-gdpro-text hover:border-gdpro-border-light'
        }`}
      >
        <FolderOpen className="w-3.5 h-3.5" strokeWidth={2} />
        <span className="max-w-[120px] truncate">{current?.name || '选择项目'}</span>
        <svg className={`w-3 h-3 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mac-menu left-0 top-full mt-1 w-56">
          <div className="px-2.5 py-1.5 text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-wider">切换项目</div>

          {projects.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-gdpro-text-muted">暂无项目</div>
          ) : (
            projects.map((p) => {
              const active = currentProjectId === p.id;
              const name = p.name || p.brandName || 'Untitled project';
              return (
                <div
                  key={p.id}
                  className={`mac-menu-item group ${active ? 'bg-gdpro-info text-white' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => { onSwitch(p.id); setOpen(false); }}
                    className="min-w-0 flex flex-1 items-center gap-2 text-left"
                  >
                    <div className={`w-5 h-5 rounded-[4px] flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      active ? 'bg-white/20 text-white' : 'bg-gdpro-bg-hover text-gdpro-text-muted'
                    }`}>
                      {String(name).charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[12px] font-medium truncate ${active ? 'text-white' : 'text-gdpro-text'}`}>
                        {name}
                      </div>
                    </div>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => handleDelete(event, p)}
                    className={`ml-1 rounded-md p-1 opacity-75 focus:opacity-100 group-hover:opacity-100 ${
                      active
                        ? 'text-white/80 hover:bg-white/15 hover:text-white'
                        : 'text-gdpro-text-muted hover:bg-gdpro-danger/10 hover:text-gdpro-danger'
                    }`}
                    title="删除项目"
                    aria-label="删除项目"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={2} />
                  </button>
                </div>
              );
            })
          )}

          <div className="mac-divider" />

          {showNew ? (
            <div className="px-2 py-1.5 flex items-center gap-1.5 animate-fade-in">
              <input
                autoFocus
                className="gdpro-input text-[12px] py-[3px] px-2 flex-1"
                placeholder="项目名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) {
                    onCreate(newName.trim()); setShowNew(false); setNewName(''); setOpen(false);
                  }
                }}
              />
              <button onClick={() => { if (newName.trim()) { onCreate(newName.trim()); setShowNew(false); setNewName(''); setOpen(false); } }}
                className="p-1 rounded-md bg-gdpro-accent text-gdpro-bg hover:bg-gdpro-accent-hover">
                <Check className="w-3 h-3" strokeWidth={3} />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowNew(true)} className="mac-menu-item text-gdpro-text-muted hover:text-gdpro-text">
              <FolderPlus className="w-3.5 h-3.5" strokeWidth={2} />
              新建项目
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, onButtonClick }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-5`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg gdpro-icon-mark flex items-center justify-center mr-2.5 shrink-0 mt-0.5">
          <PenLine className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
        </div>
      )}
      <div className={`max-w-[90%] sm:max-w-[80%] ${isUser ? 'ml-auto' : 'mr-auto'}`}>
        {message.phase && !isUser && (
          <div className="mb-1.5">
            <span className="text-[10px] px-2.5 py-[3px] rounded-lg font-medium"
              style={{ background: 'rgba(45,212,191,0.1)', color: '#2DD4BF', border: '1px solid rgba(45,212,191,0.12)' }}
            >
              第 {message.phase} 阶段 · {PHASES.find((p) => p.id === message.phase)?.name}
            </span>
          </div>
        )}
        <div className={`${isUser ? 'bubble-user px-4 py-2.5 rounded-lg rounded-tr-[4px]' : 'bubble-assistant px-4 py-2.5 rounded-lg rounded-tl-[4px]'} `}>
          {message.isMarkdown !== false ? (
            <MarkdownRender content={message.text} />
          ) : (
            <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{message.text}</p>
          )}
        </div>

        {message._skillData && (
          <StructuredOutputRenderer data={message._skillData} />
        )}

        {message.controlEvents && message.controlEvents.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.controlEvents.map((event) => (
              <span key={event.id} className="text-[10px] px-2 py-[3px] rounded-md bg-gdpro-accent/10 text-gdpro-accent border border-gdpro-accent/20">
                {event.label}
              </span>
            ))}
          </div>
        )}

        {message.assets && message.assets.length > 0 && (
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {message.assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset}
                onAdopt={(a) => onButtonClick?.(BUTTON_TYPES.ADOPT, a, message.id)}
                onReject={(a) => onButtonClick?.(BUTTON_TYPES.REJECT, a, message.id)}
              />
            ))}
          </div>
        )}

        {message.buttons && message.buttons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.buttons.map((btn, i) => (
              <ActionButton key={i} type={btn.type} label={btn.label}
                onClick={() => onButtonClick?.(btn.type, btn.payload, message.id)} />
            ))}
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2.5 py-[4px] rounded-lg text-[11px] gdpro-surface-tile">
                <Paperclip className="w-3 h-3 text-gdpro-text-muted" strokeWidth={2} />
                <span className="text-gdpro-text-secondary truncate max-w-[100px]">{att.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function imageModelDisplayName(config, fallback) {
  return config?.displayName || fallback || 'Image service';
}

function imageModelRouteTone(config) {
  if (config?.deliveryRoute?.finalDeliveryAllowed) return 'border-gdpro-success/20 bg-gdpro-success/10 text-gdpro-success';
  if (config?.deliveryRoute?.vectorOutput || config?.deliveryRoute?.editableSource) return 'border-gdpro-accent/20 bg-gdpro-accent/10 text-gdpro-accent';
  return 'border-gdpro-border bg-gdpro-bg-surface text-gdpro-text-secondary';
}

export default function DesignerAgent({ project, projects, onProjectSwitch, onProjectCreate, onProjectDelete, onAssetAdopted, onAssetRejected, onAssetsChange, onProjectUpdate, llm, imageModel, references, assets, queuedDesignRequest, onQueuedDesignRequestConsumed, uiLanguage }) {
  const [messages, setMessages] = useState(() => loadFromLocal(`chat_${project?.id}`, []));
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [mentionState, setMentionState] = useState({ open: false, query: '', items: [], index: 0, startPos: 0 });
  const [showGenPanel, setShowGenPanel] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genSize, setGenSize] = useState('1024x1024');
  const [isGenerating, setIsGenerating] = useState(false);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const processedQueuedPromptRef = useRef(null);
  const controlState = buildDesignControlState(project);
  const copy = uiText('designer', uiLanguage);
  const imageModelRuntime = useMemo(() => buildImageModelRuntimeConfig(imageModel), [imageModel]);
  const imageModelName = imageModelDisplayName(imageModelRuntime, imageModel);
  const imageModelRouteLabel = imageModelRuntime?.deliveryRoute?.finalDeliveryAllowed
    ? copy.sourceCandidateRoute
    : copy.conceptOnlyRoute;
  const phaseName = (phase) => copy.phaseNames?.[phase] || PHASES.find((p) => p.id === phase)?.name || '';
  const phaseDescription = (phase) => copy.phaseDescriptions?.[phase] || getPhaseDescription(phase);
  const phaseAllowed = (phase) => (PHASE_CONFIG[phase]?.allowedAssetCategories || [])
    .map((category) => copy.assetCategories?.[category] || category)
    .join(uiLanguage === 'en' ? ', ' : '、');
  const outputPathLabel = (label) => copy.outputPathLabels?.[label] || label;
  const needsBriefOnboarding = Boolean(project && !project.brandName && !project.documents?.brief);
  const contextSummaryText = buildContextSummary({
    profile: loadFromLocal('designer_profile', {}),
    references: references || [],
    assets: assets || {},
    project,
    assetMentions: [],
    imageModelConfig: imageModelRuntime,
  });

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  useEffect(() => { if (project?.id) setMessages(loadFromLocal(`chat_${project.id}`, [])); }, [project?.id]);

  const persistMessages = useCallback((msgs) => {
    setMessages(msgs);
    if (project?.id) saveToLocal(`chat_${project.id}`, msgs);
  }, [project?.id]);

  // ── Asset @mention logic ──
  const handleInputChange = (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(value);

    const beforeCursor = value.slice(0, cursorPos);
    const match = beforeCursor.match(/@([^@\s]*)$/);
    if (match && project) {
      const query = match[1].toLowerCase();
      const allAssets = Object.values(project.assets || {}).flat();
      const items = allAssets.filter((a) => a.name.toLowerCase().includes(query));
      setMentionState({ open: true, query: match[1], items, index: 0, startPos: cursorPos - match[0].length });
    } else {
      setMentionState((s) => ({ ...s, open: false }));
    }
  };

  const insertMention = useCallback((asset) => {
    const before = input.slice(0, mentionState.startPos);
    const after = input.slice(mentionState.startPos + mentionState.query.length + 1); // +1 for '@'
    const mentionText = `@[asset:${asset.id}:${asset.name}] `;
    const newValue = before + mentionText + after;
    setInput(newValue);
    setMentionState({ open: false, query: '', items: [], index: 0, startPos: 0 });
    // Restore focus after React re-render
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionState.startPos + mentionText.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    });
  }, [input, mentionState]);

  const handleInputKeyDown = (e) => {
    if (mentionState.open && mentionState.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionState((s) => ({ ...s, index: (s.index + 1) % s.items.length }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionState((s) => ({ ...s, index: (s.index - 1 + s.items.length) % s.items.length }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionState.items[mentionState.index]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionState((s) => ({ ...s, open: false }));
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSend = async (text, attachFiles = [], { action } = {}) => {
    if (!text.trim() && attachFiles.length === 0 && !action) return;

    // ── Parse asset mentions: @[asset:id:name] ──
    const mentionRegex = /@\[asset:([^:]+):([^\]]+)\]/g;
    const assetMentions = [];
    let m;
    while ((m = mentionRegex.exec(text)) !== null) {
      const assetId = m[1];
      const allAssets = Object.values(project?.assets || {}).flat();
      const asset = allAssets.find((a) => a.id === assetId);
      if (asset) assetMentions.push(asset);
    }

    // ── Assemble context from profile + knowledge base + assets ──
    const imageModelConfig = buildImageModelRuntimeConfig(imageModel);
    const systemPrompt = buildSystemPrompt({
      profile: loadFromLocal('designer_profile', {}),
      references: references || [],
      assets: assets || {},
      project,
      assetMentions,
      imageModelConfig,
    });
    const contextSummary = buildContextSummary({
      profile: loadFromLocal('designer_profile', {}),
      references: references || [],
      assets: assets || {},
      project,
      assetMentions,
      imageModelConfig,
    });
    const currentControlState = buildDesignControlState(project);

    const userMsg = {
      id: `msg_${Date.now()}`, role: 'user', text: text.trim(),
      attachments: attachFiles.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      timestamp: Date.now(),
    };
    const preferenceCandidates = extractPreferenceCandidatesFromText(text, { project });
    if (preferenceCandidates.length) queuePreferenceCandidates(preferenceCandidates);
    const newMessages = [...messages, userMsg];
    persistMessages(newMessages);
    setInput(''); setFiles([]); setIsLoading(true);

    // ── Call Skill via Gateway ──
    // Console does NOT generate replies. All business logic lives in the Skill.
    // The Skill receives: user message + full context + current phase
    // The Skill returns: structured output (text, assets, buttons, phase changes, reports)
    try {
      const response = await openclaw.sendMessage(project?.id, text.trim(), {
        llm, imageModel, imageModelConfig, systemPrompt, references, assets, action, contextSummary, controlState: currentControlState,
      });
      const controlResult = applyAgentControl(project, response, { action });
      if (controlResult.changed && project?.id) {
        onProjectUpdate?.(project.id, controlResult.project);
      }

      const agentMsg = {
        id: `msg_${Date.now() + 1}`, role: 'assistant',
        text: response?.text || '本地创作服务没有返回内容。',
        phase: controlResult.project?.currentPhase || response?.phase || project?.currentPhase || 1,
        isMarkdown: true,
        timestamp: Date.now(),
        assets: response?.assets || [],
        buttons: response?.buttons || [],
        // Skill may return structured data for Console to render
        _skillData: response?._skillData || null,
        controlEvents: controlResult.events || [],
      };
      persistMessages([...newMessages, agentMsg]);
    } catch (err) {
      console.error('[Agent] Skill call failed:', err.message);
      const errorMsg = {
        id: `msg_${Date.now() + 1}`, role: 'assistant',
        text: `**本地创作服务还没有连接**\n\n当前可以查看项目、调整流程和整理资产；连接本地创作服务后，才能创建画面、完成检查并写入交付记录。\n\n**你可以这样处理：**\n1. 通过本地启动器打开工作台\n2. 确认本地创作服务正在运行\n3. 点击左下角「连接本地服务」完成连接`,
        phase: project?.currentPhase || 1,
        isMarkdown: true,
        timestamp: Date.now(),
        buttons: [],
      };
      persistMessages([...newMessages, errorMsg]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (!queuedDesignRequest?.text || !project?.id) return;
    if (processedQueuedPromptRef.current === queuedDesignRequest.id) return;
    processedQueuedPromptRef.current = queuedDesignRequest.id;
    onQueuedDesignRequestConsumed?.(queuedDesignRequest.id);
    handleSend(queuedDesignRequest.text, [], { action: queuedDesignRequest.action || 'workflow_node_review' });
  }, [queuedDesignRequest, project?.id]);

  const handleButtonClick = (type, payload, messageId) => {
    if (type === BUTTON_TYPES.ADOPT && payload) {
      onAssetAdopted?.({ ...payload, projectId: payload.projectId || project?.id });
      const candidate = candidateFromAssetDecision(payload, 'adopt', { project });
      if (candidate) queuePreferenceCandidates([candidate]);
      persistMessages(messages.map((m) => m.id === messageId && m.assets
        ? { ...m, assets: m.assets.map((a) => a.id === payload.id ? { ...a, status: 'adopted' } : a) } : m));
    } else if (type === BUTTON_TYPES.REJECT && payload) {
      onAssetRejected?.({ ...payload, projectId: payload.projectId || project?.id });
      const candidate = candidateFromAssetDecision(payload, 'reject', { project });
      if (candidate) queuePreferenceCandidates([candidate]);
      persistMessages(messages.map((m) => m.id === messageId && m.assets
        ? { ...m, assets: m.assets.filter((a) => a.id !== payload.id) } : m));
    } else if (type === BUTTON_TYPES.NEXT_PHASE) {
      handleSend(`[阶段推进请求] ${JSON.stringify(payload || {})}`, [], { action: 'request_proceed_phase' });
    } else {
      handleSend(`[按钮操作: ${type}] ${JSON.stringify(payload)}`);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); handleSend(input, files); };

  const handleGenerate = async () => {
    if (!genPrompt.trim() || !project) return;
    const phase = project.currentPhase || 1;
    if (!canGenerateImage(phase)) {
      alert(copy.generateBlocked?.(phaseName(phase)) || `当前「${PHASE_CONFIG[phase]?.name}」阶段不适合创建概念图。请在「样稿方向」或「物料扩展」阶段使用。`);
      return;
    }
    setIsGenerating(true);
    const imageModelConfig = buildImageModelRuntimeConfig(imageModel);
    const activeModelName = imageModelDisplayName(imageModelConfig, imageModel);
    const activeRouteLabel = imageModelConfig?.deliveryRoute?.finalDeliveryAllowed
      ? copy.sourceCandidateRoute
      : copy.conceptOnlyRoute;
    try {
      const res = await openclaw.generateImage(genPrompt.trim(), { model: imageModel, imageModelConfig, size: genSize, n: 1 });
      if (res?.images?.[0]?.url || res?.url) {
        const imageUrl = res.images?.[0]?.url || res.url;
        const asset = {
          id: `gen_${Date.now()}`,
          name: copy.conceptAssetName?.(genPrompt.trim()) || `概念图 — ${genPrompt.trim().slice(0, 20)}`,
          type: 'image',
          category: 'draft',
          status: 'pending',
          phase,
          projectId: project.id,
          createdAt: Date.now(),
          url: imageUrl,
          previewUrl: imageUrl,
          source: 'ai-generated',
          prompt: genPrompt.trim(),
        };
        // Show generated image as a message with adopt/reject buttons
        const genMsg = {
          id: `msg_${Date.now()}`, role: 'assistant',
          text: copy.generatedConceptMessage?.(activeModelName, genPrompt.trim(), activeRouteLabel)
            || `已使用 **${activeModelName}** 创建以下设计稿：\n\n> 描述：${genPrompt.trim()}`,
          phase, isMarkdown: true, timestamp: Date.now(),
          assets: [asset],
        };
        const newMessages = [...messages, genMsg];
        persistMessages(newMessages);
        setShowGenPanel(false);
        setGenPrompt('');
      } else {
        throw new Error('本地创作服务返回的数据格式异常');
      }
    } catch (err) {
      console.error('[Generate] Skill image generation failed:', err.message);
      const errorMsg = {
        id: `msg_${Date.now()}`, role: 'assistant',
        text: copy.imageGenerationFailed?.(activeModelName, genSize, genPrompt.trim())
          || `**图像创建失败**\n\n当前没有收到可用结果。请检查图像服务是否已经保存，并确认本地创作服务正在运行。\n\n> 连接：${activeModelName}\n> 尺寸：${genSize}\n> 描述：${genPrompt.trim()}`,
        phase, isMarkdown: true, timestamp: Date.now(),
        assets: [],
      };
      const newMessages = [...messages, errorMsg];
      persistMessages(newMessages);
      setShowGenPanel(false);
      setGenPrompt('');
    }
    setIsGenerating(false);
  };

  return (
    <div className="h-full flex min-w-0" onDrop={(e) => { e.preventDefault(); handleSend('', Array.from(e.dataTransfer.files)); }} onDragOver={(e) => e.preventDefault()}>
      <section className="min-w-0 flex-1 flex flex-col">
      {/* Project Selector Bar */}
      <div className="shrink-0 px-3 py-2 flex items-center gap-3 overflow-x-auto scrollbar-hide"
        style={{ borderBottom: '1px solid rgba(24,35,48,0.1)', background: 'rgba(255,255,255,0.72)' }}
      >
        <ProjectSelector
          projects={projects}
          currentProjectId={project?.id}
          onSwitch={onProjectSwitch}
          onCreate={onProjectCreate}
          onDelete={onProjectDelete}
        />
        {project && (
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-[11px] text-gdpro-text-muted">{copy.phaseLabel(project.currentPhase)}</span>
            <span className="text-[10px] px-1.5 py-[1px] rounded bg-gdpro-accent/10 text-gdpro-accent font-semibold">
              {phaseName(project.currentPhase)}
            </span>
            <span className={`hidden sm:inline-flex text-[10px] px-1.5 py-[1px] rounded font-semibold ${
              controlState.riskLevel === 'critical'
                ? 'bg-gdpro-danger/10 text-gdpro-danger'
                : 'bg-gdpro-success/10 text-gdpro-success'
            }`}>
              {copy.deliveryReadiness(controlState.readiness)}
            </span>
            <span className="hidden md:inline text-[10px] text-gdpro-text-muted truncate">
              {outputPathLabel(controlState.outputPath.label)}
            </span>
            {canProceedToNext(project.currentPhase) && (
              <button
                onClick={() => {
                  if (controlState.phaseState?.readyToAdvance) {
                    handleSend('', [], { action: 'request_proceed_phase' });
                  }
                }}
                disabled={!controlState.phaseState?.readyToAdvance}
                title={controlState.phaseState?.readyToAdvance ? copy.proceedReadyTitle : copy.proceedBlockedTitle}
                className={`text-[10px] px-1.5 py-[1px] rounded border transition-colors font-medium ${
                  controlState.phaseState?.readyToAdvance
                    ? 'bg-gdpro-success/10 text-gdpro-success border-gdpro-success/20 hover:bg-gdpro-success/15'
                    : 'bg-gdpro-bg-hover text-gdpro-text-muted border-gdpro-border cursor-not-allowed'
                }`}
              >
                {controlState.phaseState?.readyToAdvance ? copy.proceed : copy.completeFirst}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Phase Guard Notice + Progressive Disclosure Layer */}
      {project && (
        <div className="shrink-0 px-3 py-1.5"
          style={{ borderBottom: '1px solid rgba(24,35,48,0.1)', background: 'rgba(255,255,255,0.72)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] px-1.5 py-[1px] rounded bg-gdpro-accent/10 text-gdpro-accent font-semibold">{copy.phaseLabel(project.currentPhase)}</span>
            <span className="text-[11px] text-gdpro-text-secondary truncate">{phaseDescription(project.currentPhase)}</span>
            <span className="hidden sm:inline text-[10px] text-gdpro-text-muted ml-auto">
              {copy.stageCanDo}{phaseAllowed(project.currentPhase)}
            </span>
          </div>
          {/* Layer / Gate indicators */}
          <div className="flex items-center gap-3 mt-1.5 overflow-hidden">
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gdpro-text-muted">{copy.infoLayer}</span>
              {[1, 2, 3].map((layer) => {
                const unlocked = (project.documents?.brief && layer === 1) ||
                  (project.documents?.philosophy && layer >= 2) ||
                  (project.currentPhase >= 3 && layer >= 2);
                return (
                  <span key={layer}
                    className={`text-[9px] px-1 rounded font-medium ${
                      unlocked ? 'bg-gdpro-success/10 text-gdpro-success' : 'bg-gdpro-bg-hover text-gdpro-text-muted'
                    }`}
                    title={unlocked ? copy.unlocked : copy.locked}
                  >
                    {layer}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gdpro-text-muted">{copy.phaseChecks}</span>
              {controlState.gates.slice(0, 3).map((gate, index) => {
                const passed = gate.passed;
                return (
                  <span key={gate.id}
                    className={`text-[9px] px-1 rounded font-medium ${
                      passed ? 'bg-gdpro-success/10 text-gdpro-success' : 'bg-gdpro-bg-hover text-gdpro-text-muted'
                    }`}
                    title={gate.label}
                  >
                    {index + 1}
                  </span>
                );
              })}
            </div>
            <div className="hidden md:flex items-center gap-1 min-w-0">
              <span className="text-[9px] text-gdpro-text-muted">{copy.risk}</span>
              <span className={`text-[9px] px-1.5 rounded font-medium ${
                controlState.riskLevel === 'critical'
                  ? 'bg-gdpro-danger/10 text-gdpro-danger'
                  : 'bg-gdpro-success/10 text-gdpro-success'
              }`}>
                {copy.riskLabels?.[controlState.riskLevel] || RISK_LABELS[controlState.riskLevel] || controlState.riskLevel}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-1">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-5 animate-fade-in px-6 max-w-full overflow-hidden">
            <div className="w-16 h-16 rounded-lg gdpro-icon-mark flex items-center justify-center">
              <Compass className="w-8 h-8 text-white" strokeWidth={1.6} />
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-gdpro-text mb-1.5 tracking-tight">{needsBriefOnboarding ? copy.briefOnboardingTitle : copy.emptyTitle}</h3>
              <p className="text-[13px] text-gdpro-text-secondary w-full max-w-[280px] sm:max-w-sm leading-relaxed mx-auto">
                {(needsBriefOnboarding ? copy.briefOnboardingBodyLines : copy.emptyBodyLines)?.map((line, index) => (
                  <React.Fragment key={line}>
                    {line}
                    {index < (needsBriefOnboarding ? copy.briefOnboardingBodyLines : copy.emptyBodyLines).length - 1 && <br />}
                  </React.Fragment>
                ))}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-[310px] sm:max-w-lg w-full">
              {(needsBriefOnboarding ? copy.briefStarterActions : getQuickActions(project?.currentPhase || 1)).map((s) => (
                <button key={s} onClick={() => handleSend(s)}
                  className="gdpro-button-secondary px-2.5 sm:px-3.5 py-[6px] text-[11px] sm:text-[12px] rounded-lg hover:text-gdpro-text min-w-0"
                >
                  {copy.quickActions?.[s] || s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onButtonClick={handleButtonClick} />
        ))}
        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2.5 shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(56,189,248,0.1))', border: '1px solid rgba(45,212,191,0.15)' }}
            >
              <Loader2 className="w-3.5 h-3.5 text-gdpro-accent animate-spin" strokeWidth={2.5} />
            </div>
            <div className="px-4 py-2.5 rounded-lg rounded-tl-[4px] gdpro-surface-tile">
              <div className="flex items-center gap-2 text-gdpro-text-muted">
                <div className="w-1.5 h-1.5 rounded-full bg-gdpro-accent animate-pulse" />
                <span className="text-[12px]">{copy.thinking}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 px-3 py-2.5"
        style={{ borderTop: '1px solid rgba(24,35,48,0.1)', background: 'rgba(255,255,255,0.78)' }}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {files.map((file, i) => (
              <div key={i} className="flex items-center gap-1 px-2 py-[2px] bg-gdpro-bg-elevated border border-gdpro-border rounded-md text-[11px]">
                <Paperclip className="w-3 h-3 text-gdpro-text-muted" strokeWidth={2} />
                <span className="text-gdpro-text-secondary truncate max-w-[80px]">{file.name}</span>
                <button onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="ml-0.5 text-gdpro-text-muted hover:text-gdpro-danger transition-colors">
                  <X className="w-3 h-3" strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative">
          {mentionState.open && mentionState.items.length > 0 && (
            <AssetMentionDropdown
              items={mentionState.items}
              selectedIndex={mentionState.index}
              onSelect={insertMention}
              onClose={() => setMentionState((s) => ({ ...s, open: false }))}
              anchorRef={textareaRef}
            />
          )}
          <div className="flex items-end gap-2 p-1.5 rounded-lg gdpro-floating-hud"
            style={{
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg hover:bg-gdpro-bg-hover transition-colors shrink-0 text-gdpro-text-muted hover:text-gdpro-text" title={copy.uploadTitle}>
              <Paperclip className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden"
              onChange={async (e) => {
                const newFiles = Array.from(e.target.files);
                setFiles((prev) => [...prev, ...newFiles]);
                // Auto-parse and save to project assets (R15)
                if (project && onAssetsChange) {
                  for (const file of newFiles) {
                    try {
                      const parsed = await parseFile(file);
                      if (parsed.status === 'parsed') {
                        const asset = {
                          id: `upload_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                          name: file.name,
                          type: file.type.startsWith('image/') ? 'image' : 'document',
                          category: 'reference',
                          status: 'adopted',
                          phase: project.currentPhase || 1,
                          projectId: project.id,
                          createdAt: Date.now(),
                          adoptedAt: Date.now(),
                          source: 'user-upload',
                          size: file.size,
                          parsed: {
                            status: 'parsed',
                            text: parsed.text || '',
                            excerpt: parsed.excerpt || '',
                          },
                        };
                        const updatedAssets = { ...project.assets };
                        updatedAssets.reference = [...(updatedAssets.reference || []), asset];
                        onAssetsChange(project.id, updatedAssets);
                      }
                    } catch (parseErr) {
                      console.warn('[Upload] Parse failed:', parseErr.message);
                    }
                  }
                }
              }}
              accept="image/*,.pdf,.svg,.md" />

            {/* Generate Image Panel */}
            {showGenPanel && (
              <div className="absolute left-0 bottom-full mb-2 w-full rounded-lg z-50 p-3 gdpro-modal-shell"
                style={{
                  backdropFilter: 'blur(24px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-semibold text-gdpro-text flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
                    {copy.conceptPanelTitle}
                  </span>
                  <button onClick={() => setShowGenPanel(false)} className="text-gdpro-text-muted hover:text-gdpro-text transition-colors">
                    <X className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                </div>
                <textarea
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder={copy.conceptPlaceholder}
                  rows={2}
                  className="w-full rounded-xl px-2.5 py-1.5 text-[12px] text-gdpro-text placeholder:text-gdpro-text-muted/50 resize-none outline-none mb-2 gdpro-input"
                />
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] text-gdpro-text-muted">{copy.sizeLabel}</span>
                  {copy.sizes.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setGenSize(s.value)}
                      className={`px-2 py-[2px] rounded text-[11px] transition-colors ${
                        genSize === s.value
                          ? 'bg-gdpro-accent text-gdpro-bg'
                          : 'bg-gdpro-bg border border-gdpro-border text-gdpro-text-secondary hover:text-gdpro-text'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                  <span className="text-[10px] text-gdpro-text-muted ml-auto">{imageModelName}</span>
                </div>
                <div className={`mb-2 rounded-md border px-2 py-1 text-[10px] leading-relaxed ${imageModelRouteTone(imageModelRuntime)}`}>
                  {copy.modelRouteNote?.(imageModelName, imageModelRouteLabel) || `${imageModelName} · ${imageModelRouteLabel}`}
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={!genPrompt.trim() || isGenerating}
                  className="w-full py-[5px] rounded-md bg-gdpro-accent text-gdpro-bg text-[12px] font-medium hover:bg-gdpro-accent-hover transition-colors disabled:opacity-30 flex items-center justify-center gap-1.5"
                >
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} /> : <Wand2 className="w-3.5 h-3.5" strokeWidth={2.5} />}
                  {isGenerating ? copy.creating : copy.createConcept}
                </button>
              </div>
            )}

            <textarea ref={textareaRef} value={input} onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder={project ? copy.inputPlaceholder(project.name) : copy.noProjectPlaceholder}
              disabled={!project} rows={1}
              className="flex-1 bg-transparent text-[13px] text-gdpro-text placeholder:text-gdpro-text-muted/50 resize-none outline-none min-h-[20px] max-h-[100px] py-1 disabled:opacity-40"
            />
            <button type="button" onClick={() => setShowGenPanel((v) => !v)}
              disabled={!project}
              className={`p-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-30 ${showGenPanel ? 'text-gdpro-accent' : 'text-gdpro-text-muted hover:text-gdpro-text hover:bg-gdpro-bg-hover'}`}
              style={showGenPanel ? { background: 'rgba(45,212,191,0.12)' } : {}}
              title={copy.createConcept}
            >
              <Wand2 className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button type="submit" disabled={(!input.trim() && files.length === 0) || isLoading || !project}
              className="p-1.5 rounded-xl gdpro-button shrink-0 disabled:opacity-30 flex items-center justify-center">
              <Send className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </form>
      </div>
      </section>
      <DesignControlPanel
        project={project}
        contextSummary={contextSummaryText}
        onAction={(prompt, action) => handleSend(prompt, [], { action })}
        onProjectUpdate={onProjectUpdate}
        uiLanguage={uiLanguage}
      />
    </div>
  );
}
