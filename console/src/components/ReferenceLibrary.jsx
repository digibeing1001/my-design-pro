import React, { useState, useRef } from 'react';
import { BookOpen, Upload, X, Eye, Trash2, Target, Palette, Ruler, Image as ImageIcon, Lightbulb, FileText, Loader2 } from 'lucide-react';
import { parseFile } from '../lib/parser';
import { REFERENCE_DOCS } from '../data/references';
import { uiText } from '../lib/uiLanguage';

const REF_CATEGORIES = [
  { id: 'competitor', name: '竞品', icon: Target, color: '#FF453A' },
  { id: 'style', name: '风格', icon: Palette, color: '#FF9F0A' },
  { id: 'guideline', name: '规范', icon: Ruler, color: '#0A84FF' },
  { id: 'material', name: '素材', icon: ImageIcon, color: '#30D158' },
];

function getBuiltinCategory(id) {
  if (id === 'asset-quality') return 'material';
  if (id === 'position-4q' || id === '5d-critique') return 'style';
  return 'guideline';
}

function builtinDocCopy(doc, copy) {
  return copy?.builtinDocs?.[doc.id] || {};
}

function builtinSections(doc, copy) {
  return builtinDocCopy(doc, copy).sections || doc.sections || [];
}

function buildBuiltinContent(doc, copy) {
  return builtinSections(doc, copy)
    .map((section) => `${section.title}\n\n${section.content}`)
    .join('\n\n');
}

export default function ReferenceLibrary({ projects, onReferencesChange, uiLanguage }) {
  const [filter, setFilter] = useState('all');
  const [previewRef, setPreviewRef] = useState(null);
  const [parsedContent, setParsedContent] = useState(null);
  const [parsingIds, setParsingIds] = useState(new Set());
  const fileInputRef = useRef(null);
  const copy = uiText('referenceLibrary', uiLanguage);

  const builtinRefs = REFERENCE_DOCS.map((doc) => {
    const docCopy = builtinDocCopy(doc, copy);
    const content = buildBuiltinContent(doc, copy);
    return {
      id: `builtin_${doc.id}`,
      name: docCopy.title || doc.title,
      size: content.length,
      type: 'guide',
      category: getBuiltinCategory(doc.id),
      projectName: copy.builtinProject,
      projectId: 'builtin',
      createdAt: 0,
      builtin: true,
      parsed: {
        status: 'parsed',
        message: copy.collected,
        excerpt: docCopy.desc || doc.desc,
        content,
        sections: builtinSections(doc, copy),
      },
    };
  });

  const uploadedRefs = [];
  projects.forEach((proj) => {
    (proj.references || []).forEach((r) => {
      uploadedRefs.push({ ...r, projectName: proj.name, projectId: proj.id });
    });
  });

  const allRefs = [...builtinRefs, ...uploadedRefs];

  const filtered = filter === 'all' ? allRefs : allRefs.filter((r) => r.category === filter);

  const handleFiles = async (files) => {
    const targetProject = projects[0];
    if (!targetProject) return;

    const newRefs = Array.from(files).map((file) => ({
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      size: file.size,
      type: file.type.startsWith('image/') ? 'image' : file.name.split('.').pop(),
      category: 'style',
      projectId: targetProject.id,
      createdAt: Date.now(),
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      parsed: { status: 'parsing', message: copy.parsing },
    }));

    // Save refs immediately (with parsing status)
    const updated = [...(targetProject.references || []), ...newRefs];
    onReferencesChange?.(targetProject.id, updated);
    setParsingIds((prev) => new Set([...prev, ...newRefs.map((r) => r.id)]));

    // Parse each file in background
    await Promise.all(
      newRefs.map(async (ref) => {
        const file = Array.from(files).find((f) => f.name === ref.name);
        if (!file) return;
        const result = await parseFile(file);

        const currentProj = projects.find((p) => p.id === targetProject.id);
        if (currentProj) {
          const updatedRefs = (currentProj.references || []).map((r) =>
            r.id === ref.id ? { ...r, parsed: result } : r
          );
          onReferencesChange?.(targetProject.id, updatedRefs);
        }

        setParsingIds((prev) => {
          const next = new Set(prev);
          next.delete(ref.id);
          return next;
        });

        if (result.status === 'parsed') {
          setParsedContent(result);
        }
      })
    );
  };

  const targetProject = projects[0];

  const changeCategory = (id, cat) => {
    const targetProject = projects.find((p) => (p.references || []).some((r) => r.id === id));
    if (!targetProject) return;
    const updated = (targetProject.references || []).map((r) => (r.id === id ? { ...r, category: cat } : r));
    onReferencesChange?.(targetProject.id, updated);
  };

  const deleteRef = (id) => {
    const targetProject = projects.find((p) => (p.references || []).some((r) => r.id === id));
    if (!targetProject) return;
    const updated = (targetProject.references || []).filter((r) => r.id !== id);
    onReferencesChange?.(targetProject.id, updated);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 p-4 border-b border-gdpro-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-gdpro-accent" strokeWidth={1.5} />
            <h2 className="text-[15px] font-semibold text-gdpro-text tracking-tight">{copy.title}</h2>
          </div>
          <button onClick={() => fileInputRef.current?.click()} className="gdpro-button text-[12px] flex items-center gap-1">
            <Upload className="w-3 h-3" strokeWidth={2.5} />
            {copy.upload}
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={(e) => handleFiles(e.target.files)} accept="image/*,.pdf,.svg,.md,.txt" />
        </div>

        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-[10px] bg-gradient-to-br from-gdpro-bg-elevated to-gdpro-bg-surface border border-gdpro-border p-4 mb-3">
          <div className="relative flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-gdpro-accent/10 flex items-center justify-center shrink-0">
                <Lightbulb className="w-4 h-4 text-gdpro-accent" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[13px] font-medium text-gdpro-text leading-relaxed">
                {copy.heroTitle}
              </p>
              <p className="text-[11px] text-gdpro-text-muted mt-0.5 leading-relaxed">
                {copy.heroBody}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setFilter('all')}
            className={`px-2.5 py-[3px] rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
              filter === 'all' ? 'bg-gdpro-info text-white' : 'bg-gdpro-bg-surface text-gdpro-text-secondary hover:text-gdpro-text'
            }`}>
            {copy.all(allRefs.length)}
          </button>
          {REF_CATEGORIES.map((cat) => {
            const count = allRefs.filter((r) => r.category === cat.id).length;
            const Icon = cat.icon;
            return (
              <button key={cat.id} onClick={() => setFilter(cat.id)}
                className={`px-2.5 py-[3px] rounded-md text-[11px] font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                  filter === cat.id ? 'bg-gdpro-info text-white' : 'bg-gdpro-bg-surface text-gdpro-text-secondary hover:text-gdpro-text'
                }`}>
                <Icon className="w-3 h-3" strokeWidth={2} />
                {copy.categories?.[cat.id] || cat.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Parsed content preview */}
      {parsedContent && (
        <div className="shrink-0 px-4 py-2 border-b border-gdpro-border">
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-gdpro-info/8 border border-gdpro-info/15">
            <FileText className="w-3.5 h-3.5 text-gdpro-info shrink-0 mt-0.5" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-gdpro-text">{parsedContent.name} — {parsedContent.message}</div>
              {parsedContent.excerpt && (
                <p className="text-[11px] text-gdpro-text-muted mt-1 line-clamp-2 font-mono">{parsedContent.excerpt}</p>
              )}
            </div>
            <button onClick={() => setParsedContent(null)} className="p-0.5 rounded hover:bg-gdpro-bg-hover text-gdpro-text-muted hover:text-gdpro-text transition-colors">
              <X className="w-3 h-3" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {allRefs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-10">
            <BookOpen className="w-8 h-8 text-gdpro-text-muted mb-2" strokeWidth={1.5} />
            <p className="text-[13px] text-gdpro-text-secondary">{copy.emptyTitle}</p>
            <p className="text-[11px] text-gdpro-text-muted mt-0.5 max-w-xs">
              {copy.emptyBodyLines?.map((line, index) => (
                <React.Fragment key={line}>
                  {line}
                  {index < copy.emptyBodyLines.length - 1 && <br />}
                </React.Fragment>
              ))}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-10">
            <p className="text-[13px] text-gdpro-text-secondary">{copy.emptyCategory}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {filtered.map((ref) => {
              const isImage = ref.type === 'image' || ref.type === 'svg';
              const catInfo = REF_CATEGORIES.find((c) => c.id === ref.category);
              const CatIcon = catInfo?.icon || ImageIcon;
              const isParsing = parsingIds.has(ref.id);
              const hasParsed = ref.parsed && ref.parsed.status === 'parsed';
              const parseError = ref.parsed && ref.parsed.status === 'error';
              return (
                <div key={ref.id} className="gdpro-card overflow-hidden group gdpro-card-hover border-gdpro-border rounded-[10px] flex flex-col">
                  <div className="aspect-[16/10] bg-gdpro-bg-surface relative cursor-pointer"
                    onClick={() => !isParsing && setPreviewRef(ref)}>
                    {isImage && ref.previewUrl ? (
                      <img src={ref.previewUrl} alt={ref.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-2">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: (catInfo?.color || '#FF9F0A') + '12' }}>
                          {isParsing ? (
                            <Loader2 className="w-5 h-5 text-gdpro-text-muted animate-spin" strokeWidth={2} />
                          ) : (
                            <CatIcon className="w-5 h-5" style={{ color: catInfo?.color || '#FF9F0A' }} strokeWidth={1.5} />
                          )}
                        </div>
                        <span className="text-[11px] text-gdpro-text-muted text-center line-clamp-2">{isParsing ? copy.parsing : ref.name}</span>
                      </div>
                    )}
                    {hasParsed && (
                      <div className="absolute top-2 left-2 px-1.5 py-[1px] rounded bg-gdpro-success/20 text-gdpro-success text-[10px] font-bold backdrop-blur-sm flex items-center gap-1">
                        <FileText className="w-2.5 h-2.5" strokeWidth={2} />
                        {copy.parsed}
                      </div>
                    )}
                    {parseError && (
                      <div className="absolute top-2 left-2 px-1.5 py-[1px] rounded bg-gdpro-danger/20 text-gdpro-danger text-[10px] font-bold backdrop-blur-sm">
                        {copy.parseError}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gdpro-bg-elevated/78 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 backdrop-blur-sm">
                      {!isParsing && (
                        <button onClick={(e) => { e.stopPropagation(); setPreviewRef(ref); }} className="p-1.5 rounded-md bg-white/90 border border-gdpro-border text-gdpro-text hover:text-gdpro-accent transition-colors">
                          <Eye className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>
                      )}
                      {!ref.builtin && (
                        <button onClick={(e) => { e.stopPropagation(); deleteRef(ref.id); }} className="p-1.5 rounded-md bg-white/90 border border-gdpro-border text-gdpro-text hover:text-gdpro-danger transition-colors">
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col">
                    <p className="text-[12px] text-gdpro-text font-medium truncate" title={ref.name}>{ref.name}</p>
                    {ref.parsed?.message && (
                      <p className={`text-[10px] mt-0.5 line-clamp-1 ${parseError ? 'text-gdpro-danger' : 'text-gdpro-text-muted'}`}>
                        {ref.parsed.message}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gdpro-border/50">
                      <span className="text-[10px] text-gdpro-text-muted">{ref.projectName}</span>
                      {ref.builtin ? (
                        <span className="text-[10px] rounded border border-gdpro-border bg-gdpro-bg-hover px-1.5 py-[1px] text-gdpro-text-muted">
                          {copy.categories?.[ref.category] || catInfo?.name || copy.categories?.guideline}
                        </span>
                      ) : (
                        <select value={ref.category} onChange={(e) => changeCategory(ref.id, e.target.value)}
                          className="text-[10px] bg-gdpro-bg-hover border border-gdpro-border rounded px-1.5 py-[1px] text-gdpro-text-muted outline-none focus:border-gdpro-info">
                          {REF_CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>{copy.categories?.[c.id] || c.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop animate-fade-in p-4" onClick={() => setPreviewRef(null)}>
          <div className="max-w-[85vw] max-h-[85vh] relative" onClick={(e) => e.stopPropagation()}>
            {(previewRef.type === 'image' || previewRef.type === 'svg') ? (
              <div className="gdpro-modal-shell rounded-xl p-2">
                <img src={previewRef.previewUrl || previewRef.url} alt={previewRef.name} className="max-w-full max-h-[72vh] object-contain rounded-[10px]" />
                <div className="px-2 py-2">
                  <p className="text-[13px] text-gdpro-text font-medium">{previewRef.name}</p>
                  <p className="text-[10px] text-gdpro-text-muted">{previewRef.projectName}</p>
                </div>
              </div>
            ) : (
              <div className="w-[min(760px,85vw)] max-h-[80vh] overflow-y-auto rounded-lg gdpro-modal-shell p-5">
                <div className="flex items-start gap-3 pb-3 border-b border-gdpro-border">
                  <div className="w-9 h-9 rounded-lg bg-gdpro-accent/10 border border-gdpro-accent/20 flex items-center justify-center text-gdpro-accent">
                    <BookOpen className="w-4 h-4" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-gdpro-text">{previewRef.name}</h3>
                    <p className="text-[11px] text-gdpro-text-muted mt-0.5">{previewRef.parsed?.excerpt || previewRef.projectName}</p>
                  </div>
                </div>
                {previewRef.parsed?.sections?.length ? (
                  <div className="mt-4 space-y-5">
                    {previewRef.parsed.sections.map((section) => (
                      <section key={section.title}>
                        <h4 className="text-[12px] font-semibold text-gdpro-text mb-2">{section.title}</h4>
                        <p className="whitespace-pre-wrap text-[12px] leading-6 text-gdpro-text-secondary">{section.content}</p>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 whitespace-pre-wrap text-[12px] leading-6 text-gdpro-text-secondary">
                    {previewRef.parsed?.content || previewRef.parsed?.excerpt || copy.noContent}
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setPreviewRef(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gdpro-bg-elevated border border-gdpro-border flex items-center justify-center text-gdpro-text hover:text-gdpro-danger transition-colors">
              <X className="w-3 h-3" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
