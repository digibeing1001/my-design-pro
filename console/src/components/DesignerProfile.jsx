import React, { useCallback, useMemo, useState } from 'react';
import {
  Ban,
  Bookmark,
  Check,
  Clock,
  Loader2,
  MessageSquareText,
  Palette,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { AESTHETIC_TEMPLATE, DEFAULT_DESIGNER_PROFILE } from '../data/designerProfile';
import { loadFromLocal } from '../lib/storage';
import { openclaw } from '../lib/api';
import {
  applyPreferenceCandidate,
  decidePreferenceCandidate,
  generateProfileCandidatesWithAi,
  loadPreferenceCandidates,
  persistDesignerProfile,
  queuePreferenceCandidates,
} from '../lib/designerPreferenceLearning';

const TYPE_LABELS = {
  dimension: '画像维度',
  preference: '偏好',
  prohibition: '禁用项',
  styleTag: '风格标签',
  tool: '工具',
};

function ListPill({ children, onRemove, tone = 'default' }) {
  const toneClass = tone === 'danger'
    ? 'bg-gdpro-danger/8 border-gdpro-danger/15 text-gdpro-danger'
    : tone === 'accent'
      ? 'bg-gdpro-accent-dim border-gdpro-accent/15 text-gdpro-accent'
      : 'bg-gdpro-bg-hover border-gdpro-border text-gdpro-text-secondary';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-[3px] border rounded-md text-[11px] font-medium ${toneClass}`}>
      {children}
      <button type="button" onClick={onRemove} className="hover:text-gdpro-danger transition-colors" aria-label="移除">
        <X className="w-2.5 h-2.5" strokeWidth={2.5} />
      </button>
    </span>
  );
}

function AddInline({ placeholder, value, onChange, onAdd }) {
  return (
    <div className="flex gap-1.5">
      <input
        className="gdpro-input text-[12px] flex-1 py-[5px]"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onAdd();
        }}
      />
      <button type="button" onClick={onAdd} className="gdpro-button text-[11px] py-[5px] px-2.5 flex items-center gap-1">
        <Plus className="w-3 h-3" strokeWidth={2.5} />
        添加
      </button>
    </div>
  );
}

export default function DesignerProfile({ llm }) {
  const [profile, setProfile] = useState(() => loadFromLocal('designer_profile', DEFAULT_DESIGNER_PROFILE));
  const [candidates, setCandidates] = useState(() => loadPreferenceCandidates());
  const [editing, setEditing] = useState({});
  const [dialogue, setDialogue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [inputs, setInputs] = useState({ preferences: '', prohibitions: '', styleTags: '', tools: '' });

  const pendingCandidates = useMemo(() => candidates.filter((item) => item.status === 'pending'), [candidates]);
  const decidedCandidates = useMemo(() => candidates.filter((item) => item.status !== 'pending').slice(0, 12), [candidates]);

  const persist = useCallback((next) => {
    setProfile(next);
    persistDesignerProfile(next);
  }, []);

  const refreshCandidates = useCallback(() => {
    setCandidates(loadPreferenceCandidates());
  }, []);

  const updateDimension = (key, value) => {
    persist({
      ...profile,
      aesthetic: {
        ...profile.aesthetic,
        dimensions: {
          ...profile.aesthetic.dimensions,
          [key]: { ...profile.aesthetic.dimensions[key], value },
        },
      },
    });
  };

  const addListItem = (listKey, value) => {
    const cleaned = String(value || '').trim();
    if (!cleaned) return;
    const current = profile.aesthetic[listKey] || [];
    if (current.some((item) => item.toLowerCase() === cleaned.toLowerCase())) return;
    persist({
      ...profile,
      aesthetic: {
        ...profile.aesthetic,
        [listKey]: [...current, cleaned],
      },
    });
  };

  const removeListItem = (listKey, index) => {
    persist({
      ...profile,
      aesthetic: {
        ...profile.aesthetic,
        [listKey]: (profile.aesthetic[listKey] || []).filter((_, i) => i !== index),
      },
    });
  };

  const addTag = (listKey) => {
    addListItem(listKey, inputs[listKey]);
    setInputs((prev) => ({ ...prev, [listKey]: '' }));
  };

  const applyTemplate = (key) => {
    const t = AESTHETIC_TEMPLATE[key];
    if (!t) return;
    persist({
      ...profile,
      aesthetic: {
        ...profile.aesthetic,
        dimensions: Object.fromEntries(
          Object.entries(profile.aesthetic.dimensions).map(([k, dim]) => [
            k, { ...dim, value: t[k] || dim.value },
          ]),
        ),
      },
    });
  };

  const generateCandidates = async () => {
    if (!dialogue.trim() || isGenerating) return;
    setIsGenerating(true);
    const generated = await generateProfileCandidatesWithAi(openclaw, dialogue.trim(), { model: llm, profile });
    queuePreferenceCandidates(generated);
    refreshCandidates();
    setDialogue('');
    setIsGenerating(false);
  };

  const acceptCandidate = (candidate) => {
    const nextProfile = applyPreferenceCandidate(profile, candidate);
    persist(nextProfile);
    decidePreferenceCandidate(candidate.id, 'accepted');
    refreshCandidates();
  };

  const rejectCandidate = (candidate) => {
    decidePreferenceCandidate(candidate.id, 'rejected');
    refreshCandidates();
  };

  const renderList = (listKey, label, Icon, tone, placeholder) => (
    <div className="gdpro-card p-4 rounded-[10px]">
      <h3 className="text-[13px] font-semibold text-gdpro-text mb-2 tracking-tight flex items-center gap-2">
        <Icon className={`w-4 h-4 ${tone === 'danger' ? 'text-gdpro-danger' : tone === 'accent' ? 'text-gdpro-accent' : 'text-gdpro-info'}`} strokeWidth={2} />
        {label}
      </h3>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {(profile.aesthetic[listKey] || []).map((item, i) => (
          <ListPill key={`${item}_${i}`} tone={tone} onRemove={() => removeListItem(listKey, i)}>
            {item}
          </ListPill>
        ))}
      </div>
      <AddInline
        placeholder={placeholder}
        value={inputs[listKey]}
        onChange={(value) => setInputs((prev) => ({ ...prev, [listKey]: value }))}
        onAdd={() => addTag(listKey)}
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 p-4 border-b border-gdpro-border">
        <div className="flex items-center gap-2.5">
          <User className="w-4 h-4 text-gdpro-accent" strokeWidth={1.5} />
          <h2 className="text-[15px] font-semibold text-gdpro-text tracking-tight">个人偏好</h2>
          <span className="text-[11px] text-gdpro-text-muted">通过确认候选，逐步形成你的设计师档案</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <div className="space-y-4">
            <div className="gdpro-card p-4 rounded-[10px]">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquareText className="w-4 h-4 text-gdpro-accent" strokeWidth={2} />
                <h3 className="text-[13px] font-semibold text-gdpro-text tracking-tight">用一段话生成偏好候选</h3>
              </div>
              <textarea
                className="gdpro-input min-h-[92px] resize-y text-[12px]"
                value={dialogue}
                onChange={(e) => setDialogue(e.target.value)}
                placeholder="例如：我喜欢克制、有呼吸感的版式，不要太多装饰；颜色希望低饱和但有一个清晰强调色。"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-gdpro-text-muted leading-relaxed">
                  生成结果会先进入右侧候选日志，点勾后才会写入个人偏好。
                </p>
                <button
                  type="button"
                  onClick={generateCandidates}
                  disabled={!dialogue.trim() || isGenerating}
                  className="gdpro-button text-[12px] px-3 py-[6px] flex items-center gap-1.5 disabled:opacity-40"
                >
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} /> : <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />}
                  生成候选
                </button>
              </div>
            </div>

            <div className="gdpro-card p-4 rounded-[10px]">
              <h3 className="text-[13px] font-semibold text-gdpro-text mb-3 tracking-tight">基本信息</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="gdpro-label">设计师名称</label>
                  <input
                    className="gdpro-input"
                    value={profile.name}
                    onChange={(e) => persist({ ...profile, name: e.target.value })}
                    placeholder="你的名字或工作室名"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="gdpro-label">简介</label>
                  <textarea
                    className="gdpro-input min-h-[50px] resize-y"
                    value={profile.bio}
                    onChange={(e) => persist({ ...profile, bio: e.target.value })}
                    placeholder="简短描述你的设计背景和专长..."
                  />
                </div>
              </div>
            </div>

            <div className="gdpro-card p-4 rounded-[10px]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-gdpro-accent" strokeWidth={2} />
                  <h3 className="text-[13px] font-semibold text-gdpro-text tracking-tight">审美画像</h3>
                </div>
                <div className="flex gap-1">
                  {Object.entries(AESTHETIC_TEMPLATE).map(([key]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyTemplate(key)}
                      className="px-2 py-[2px] rounded-md text-[11px] font-medium bg-gdpro-bg-hover text-gdpro-text-secondary hover:text-gdpro-text hover:bg-gdpro-bg-surface border border-gdpro-border transition-colors"
                    >
                      {key === 'minimal' ? '极简' : key === 'warm' ? '温暖' : '科技'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {Object.entries(profile.aesthetic.dimensions).map(([key, dim]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[12px] font-medium text-gdpro-text">{dim.label}</label>
                      <span className="text-[10px] text-gdpro-text-muted">{dim.desc}</span>
                    </div>
                    {editing[`dim_${key}`] ? (
                      <textarea
                        autoFocus
                        className="gdpro-input text-[12px] min-h-[50px] resize-y"
                        value={dim.value}
                        onChange={(e) => updateDimension(key, e.target.value)}
                        onBlur={() => setEditing((prev) => ({ ...prev, [`dim_${key}`]: false }))}
                        placeholder={dim.desc}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing((prev) => ({ ...prev, [`dim_${key}`]: true }))}
                        className={`w-full text-left min-h-[32px] px-3 py-[5px] rounded-md text-[12px] border transition-colors cursor-text ${
                          dim.value ? 'bg-gdpro-bg-hover border-gdpro-border text-gdpro-text-secondary' : 'bg-gdpro-bg-surface/50 border-gdpro-border/50 text-gdpro-text-muted italic'
                        } hover:border-gdpro-border-light`}
                      >
                        {dim.value || `点击编辑${dim.label}...`}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {renderList('preferences', '已确认偏好', Bookmark, 'accent', '添加偏好...')}
            {renderList('prohibitions', '审美禁止清单', Ban, 'danger', '添加禁止项...')}
            {renderList('styleTags', '风格标签', Tag, 'default', '添加标签...')}
            {renderList('tools', '常用工具', Wrench, 'default', '添加工具...')}
          </div>

          <aside className="space-y-4">
            <div className="gdpro-card p-4 rounded-[10px]">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold text-gdpro-text tracking-tight">偏好变化候选</h3>
                  <p className="text-[10px] text-gdpro-text-muted mt-0.5">来自对话、采纳和拒绝记录</p>
                </div>
                <span className="px-2 py-1 rounded-md border border-gdpro-accent/20 bg-gdpro-accent/10 text-[10px] text-gdpro-accent font-semibold">
                  {pendingCandidates.length}
                </span>
              </div>

              {pendingCandidates.length ? (
                <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                  {pendingCandidates.map((candidate) => (
                    <div key={candidate.id} className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded border border-gdpro-border bg-gdpro-bg-surface px-1.5 py-[1px] text-[9px] text-gdpro-text-muted">
                              {TYPE_LABELS[candidate.type] || candidate.type}
                            </span>
                            {candidate.projectName && <span className="text-[9px] text-gdpro-text-muted truncate">{candidate.projectName}</span>}
                          </div>
                          <p className="text-[12px] font-medium text-gdpro-text leading-relaxed mt-1">{candidate.value}</p>
                          <p className="text-[10px] text-gdpro-text-muted leading-relaxed mt-1">{candidate.reason}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => rejectCandidate(candidate)}
                          className="p-1.5 rounded-md border border-gdpro-danger/20 bg-gdpro-danger/8 text-gdpro-danger hover:bg-gdpro-danger/12"
                          title="忽略"
                          aria-label="忽略"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => acceptCandidate(candidate)}
                          className="p-1.5 rounded-md border border-gdpro-success/20 bg-gdpro-success/10 text-gdpro-success hover:bg-gdpro-success/15"
                          title="采用"
                          aria-label="采用"
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-surface px-3 py-5 text-center">
                  <Clock className="w-5 h-5 text-gdpro-text-muted mx-auto" strokeWidth={1.8} />
                  <p className="text-[12px] text-gdpro-text-secondary mt-2">还没有待确认候选</p>
                  <p className="text-[10px] text-gdpro-text-muted mt-1 leading-relaxed">你可以用左侧对话生成，也可以在项目中表达喜欢或不要的方向。</p>
                </div>
              )}
            </div>

            {decidedCandidates.length > 0 && (
              <div className="gdpro-card p-4 rounded-[10px]">
                <div className="flex items-center gap-2 mb-2">
                  <Trash2 className="w-4 h-4 text-gdpro-text-muted" strokeWidth={2} />
                  <h3 className="text-[13px] font-semibold text-gdpro-text tracking-tight">最近处理</h3>
                </div>
                <div className="space-y-1.5">
                  {decidedCandidates.map((candidate) => (
                    <div key={candidate.id} className="flex items-center gap-2 rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${candidate.status === 'accepted' ? 'bg-gdpro-success' : 'bg-gdpro-text-muted'}`} />
                      <span className="min-w-0 flex-1 text-[10px] text-gdpro-text-muted truncate">{candidate.value}</span>
                      <span className="text-[9px] text-gdpro-text-muted shrink-0">{candidate.status === 'accepted' ? '已采用' : '已忽略'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
