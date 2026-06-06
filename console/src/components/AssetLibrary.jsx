import React, { useState, useRef } from 'react';
import { Image, Upload, X, Search, FileText, Check, Eye, Trash2, Sparkles } from 'lucide-react';
import MarkdownRender from './MarkdownRender';

import { ASSET_CATEGORIES, PHASES } from '../data/projects';
import { canUploadAssetCategory, getPhaseDescription, PHASE_CONFIG } from '../lib/phaseGuard';
import { uiText } from '../lib/uiLanguage';

export default function AssetLibrary({ projects, onAssetsChange, uiLanguage }) {
  const [projectFilter, setProjectFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [previewAsset, setPreviewAsset] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const fileInputRef = useRef(null);

  const allAssets = [];
  const allDocs = [];
  projects.forEach((proj) => {
    Object.values(proj.assets || {}).flat().forEach((a) => {
      allAssets.push({ ...a, projectName: proj.name, projectId: proj.id });
    });
    Object.entries(proj.documents || {}).forEach(([key, doc]) => {
      allDocs.push({ ...doc, projectName: proj.name, projectId: proj.id, docKey: key });
    });
  });

  const filteredAssets = allAssets.filter((a) => {
    const matchProject = projectFilter === 'all' || a.projectId === projectFilter;
    const matchCat = categoryFilter === 'all' || a.category === categoryFilter;
    return matchProject && matchCat;
  });
  const selectedProject = projects.find((p) => p.id === projectFilter);
  const selectedProjectAssetCount = selectedProject
    ? Object.values(selectedProject.assets || {}).flat().length
    : allAssets.length;
  const hasFilter = projectFilter !== 'all' || categoryFilter !== 'all';
  const emptyIsFiltered = filteredAssets.length === 0 && allAssets.length > 0 && hasFilter && selectedProjectAssetCount > 0;
  const emptyIsProject = projectFilter !== 'all' && selectedProjectAssetCount === 0;
  const copy = uiText('assetLibrary', uiLanguage);
  const starterAssetTypes = copy.starterTypes;
  const categoryName = (id, fallback = '') => copy.categoryNames?.[id] || fallback;
  const categoryGlyph = (id, fallback = '') => copy.categoryGlyphs?.[id] || fallback || copy.fileGlyph;
  const phaseName = (phase) => copy.phaseNames?.[phase] || PHASE_CONFIG[phase]?.name || copy.phaseLabel?.(phase) || `Phase ${phase}`;
  const phaseDescription = (phase) => copy.phaseDescriptions?.[phase] || getPhaseDescription(phase);
  const listJoiner = uiLanguage === 'en' ? ', ' : '、';

  const handleFiles = (files) => {
    const targetProject = projects.find((p) => p.id === (projectFilter !== 'all' ? projectFilter : projects[0]?.id));
    if (!targetProject) return;

    const phase = targetProject.currentPhase || 1;
    const allowedCats = PHASE_CONFIG[phase]?.allowedAssetCategories || ['reference'];

    const newAssets = [];
    const rejected = [];

    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith('image/');
      const category = guessCategory(file.name);

      if (!canUploadAssetCategory(phase, category)) {
        rejected.push({ name: file.name, category });
        return;
      }

      newAssets.push({
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: file.name, size: file.size,
        type: isImage ? 'image' : file.name.split('.').pop(),
        category, status: 'adopted',
        phase, projectId: targetProject.id,
        createdAt: Date.now(), adoptedAt: Date.now(),
        url: isImage ? URL.createObjectURL(file) : null,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        source: 'user-uploaded',
      });
    });

    if (rejected.length > 0) {
      const rejectedLines = rejected.map((r) => `- ${r.name} (${categoryName(r.category, r.category)})`).join('\n');
      const allowedList = allowedCats.map((id) => categoryName(id, id)).join(listJoiner);
      alert(copy.uploadRejected(phaseName(phase), rejectedLines, allowedList));
    }

    if (newAssets.length === 0) return;

    const updated = { ...(targetProject.assets || {}) };
    newAssets.forEach((a) => {
      updated[a.category] = [...(updated[a.category] || []), a];
    });
    onAssetsChange?.(targetProject.id, updated);
  };

  const guessCategory = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes('logo') || lower.includes('brand')) return 'logo';
    if (lower.includes('product')) return 'product';
    if (lower.includes('scene') || lower.includes('store')) return 'scene';
    if (lower.includes('ref') || lower.includes('mood')) return 'reference';
    if (lower.includes('draft') || lower.includes('design') || lower.includes('card')) return 'draft';
    if (lower.includes('deliver') || lower.includes('final')) return 'deliverable';
    if (lower.includes('report') || lower.includes('audit')) return 'report';
    return 'reference';
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-gdpro-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Image className="w-4 h-4 text-gdpro-accent" strokeWidth={1.5} />
            <h2 className="text-[15px] font-semibold text-gdpro-text tracking-tight">{copy.title}</h2>
            <span className="text-[11px] text-gdpro-text-muted">{copy.subtitle}</span>
          </div>
          <div className="flex items-center gap-2">
            {projectFilter !== 'all' && (() => {
              const proj = projects.find((p) => p.id === projectFilter);
              if (!proj) return null;
              const phase = proj.currentPhase || 1;
              const cfg = PHASE_CONFIG[phase];
              return (
                <span className="text-[10px] px-1.5 py-[1px] rounded bg-gdpro-accent/10 text-gdpro-accent font-medium">
                  {copy.phaseBadge(phase, cfg?.name)}
                </span>
              );
            })()}
            <button onClick={() => fileInputRef.current?.click()} className="gdpro-button text-[12px] flex items-center gap-1">
              <Upload className="w-3 h-3" strokeWidth={2.5} />
              {copy.upload}
            </button>
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={(e) => handleFiles(e.target.files)} accept="image/*,.pdf,.svg,.md,.ai,.psd" />
        </div>

        {projectFilter !== 'all' && (() => {
          const proj = projects.find((p) => p.id === projectFilter);
          if (!proj) return null;
          const phase = proj.currentPhase || 1;
          const cfg = PHASE_CONFIG[phase];
          return (
            <div className="mb-3 px-2.5 py-1.5 rounded-md bg-gdpro-bg-elevated/50 border border-gdpro-border/50 flex items-center gap-2">
              <span className="text-[10px] text-gdpro-text-muted">{copy.allowed}</span>
              <span className="text-[10px] text-gdpro-accent font-medium">{cfg?.allowedAssetCategories.map((id) => categoryName(id, id)).join(uiLanguage === 'en' ? ', ' : '、')}</span>
              <span className="text-[10px] text-gdpro-text-muted ml-auto">{phaseDescription(phase)}</span>
            </div>
          );
        })()}

        <div className="flex flex-wrap items-center gap-2">
          <Search className="w-3 h-3 text-gdpro-text-muted" strokeWidth={2} />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="bg-gdpro-bg-surface border border-gdpro-border rounded-md px-2.5 py-[3px] text-[12px] text-gdpro-text focus:outline-none focus:border-gdpro-info min-w-[120px]"
          >
            <option value="all">{copy.allProjects(allAssets.length)}</option>
            {projects.map((p) => {
              const count = allAssets.filter((a) => a.projectId === p.id).length;
              return <option key={p.id} value={p.id}>{p.name} ({count})</option>;
            })}
          </select>

          <div className="w-px h-4 bg-gdpro-border" />

          <div className="flex items-center gap-1.5">
            <button onClick={() => setCategoryFilter('all')}
              className={`px-2.5 py-[3px] rounded-md text-[11px] font-medium transition-colors ${
                categoryFilter === 'all' ? 'bg-gdpro-info text-white' : 'bg-gdpro-bg-surface text-gdpro-text-secondary hover:text-gdpro-text'
              }`}>
              {copy.all}
            </button>
            {ASSET_CATEGORIES.map((cat) => {
              const count = allAssets.filter((a) => a.category === cat.id).length;
              if (count === 0) return null;
              return (
                <button key={cat.id} onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2.5 py-[3px] rounded-md text-[11px] font-medium transition-colors ${
                    categoryFilter === cat.id ? 'bg-gdpro-info text-white' : 'bg-gdpro-bg-surface text-gdpro-text-secondary hover:text-gdpro-text'
                  }`}>
                  {categoryName(cat.id, cat.name)} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Documents */}
      {allDocs.length > 0 && (projectFilter === 'all' || allDocs.some((d) => d.projectId === projectFilter)) && (
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-gdpro-border">
          <h3 className="text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-wider mb-1.5">{copy.documents}</h3>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {allDocs.filter((d) => projectFilter === 'all' || d.projectId === projectFilter).map((doc, i) => (
              <button key={`${doc.projectId}_${i}`} onClick={() => setPreviewDoc(doc)}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-gdpro-bg-elevated border border-gdpro-border hover:border-gdpro-border-light transition-colors text-left">
                <FileText className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={1.5} />
                <div>
                  <div className="text-[12px] font-medium text-gdpro-text">{doc.title}</div>
                  <div className="text-[10px] text-gdpro-text-muted">{doc.projectName} · {copy.phaseLabel(doc.phase)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Asset grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filteredAssets.length === 0 ? (
          <div className="h-full min-h-[360px] flex items-center justify-center py-10">
            <div className="w-full max-w-[560px] rounded-xl border border-gdpro-border bg-white/82 px-8 py-7 text-center shadow-[0_20px_60px_rgba(24,35,48,0.08)]">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-gdpro-border bg-gdpro-bg-surface shadow-[0_1px_0_rgba(255,255,255,0.92)_inset]">
                {emptyIsFiltered ? (
                  <Search className="w-5 h-5 text-gdpro-text-muted" strokeWidth={1.7} />
                ) : (
                  <Sparkles className="w-5 h-5 text-gdpro-accent" strokeWidth={1.7} />
                )}
              </div>
              <p className="text-[15px] font-semibold text-gdpro-text tracking-tight">
                {emptyIsFiltered ? copy.emptyFiltered : emptyIsProject ? copy.emptyProject : copy.emptyDefault}
              </p>
              <p className="mx-auto mt-2 max-w-[420px] text-[12px] leading-5 text-gdpro-text-muted">
                {emptyIsFiltered ? copy.emptyFilteredDetail : copy.emptyDefaultDetail}
              </p>
              {!emptyIsFiltered && (
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {starterAssetTypes.map((item) => (
                    <span key={item} className="rounded-md border border-gdpro-border bg-gdpro-bg-surface px-2.5 py-1 text-[11px] font-medium text-gdpro-text-secondary">
                      {item}
                    </span>
                  ))}
                </div>
              )}
              <button onClick={() => fileInputRef.current?.click()} className="gdpro-button mt-5 inline-flex items-center gap-1.5 text-[12px]">
                <Upload className="w-3.5 h-3.5" strokeWidth={2.2} />
                {copy.importAssets}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {filteredAssets.map((asset) => {
              const isImage = asset.type === 'image' || asset.type === 'svg';
              const catInfo = ASSET_CATEGORIES.find((c) => c.id === asset.category);
              const phaseInfo = PHASES.find((p) => p.id === asset.phase);
              return (
                <div key={asset.id} className="gdpro-card overflow-hidden group gdpro-card-hover border-gdpro-border rounded-[10px]">
                  <div className="aspect-square bg-gdpro-bg-surface relative cursor-pointer" onClick={() => isImage && setPreviewAsset(asset)}>
                    {isImage && asset.previewUrl ? (
                      <img src={asset.previewUrl} alt={asset.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-3">
                        <div className="w-[58%] max-w-[132px] aspect-[4/5] rounded-xl border border-gdpro-border bg-white shadow-[0_14px_32px_rgba(24,35,48,0.08)] overflow-hidden flex flex-col">
                          <div className="h-7 shrink-0 border-b border-gdpro-border bg-gdpro-bg-surface/75 flex items-center gap-1.5 px-2">
                            <span className="h-2 w-2 rounded-full bg-gdpro-danger/65" />
                            <span className="h-2 w-2 rounded-full bg-gdpro-warning/65" />
                            <span className="h-2 w-2 rounded-full bg-gdpro-success/65" />
                          </div>
                          <div className="flex flex-1 flex-col items-center justify-center gap-2">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: (catInfo?.color || '#FF9F0A') + '14' }}>
                              <span className="text-[15px] font-semibold" style={{ color: catInfo?.color || '#FF9F0A' }}>{categoryGlyph(catInfo?.id, catInfo?.icon)}</span>
                            </div>
                            <span className="rounded border border-gdpro-border bg-gdpro-bg-surface px-1.5 py-[1px] text-[9px] font-mono font-semibold text-gdpro-text-muted">
                              {asset.type?.toUpperCase() || 'FILE'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    {asset.status === 'adopted' && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gdpro-success flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-gdpro-bg" strokeWidth={3} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gdpro-bg-elevated/78 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 backdrop-blur-sm">
                      {isImage && (
                        <button onClick={(e) => { e.stopPropagation(); setPreviewAsset(asset); }} className="p-1.5 rounded-md bg-white/90 border border-gdpro-border text-gdpro-text hover:text-gdpro-accent transition-colors">
                          <Eye className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); }} className="p-1.5 rounded-md bg-white/90 border border-gdpro-border text-gdpro-text hover:text-gdpro-danger transition-colors">
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-1.5 bg-white/86 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm border-t border-gdpro-border">
                      <span className="text-[10px] text-gdpro-text-secondary font-medium truncate block">{asset.projectName}</span>
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] text-gdpro-text font-medium truncate" title={asset.name}>{asset.name}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-gdpro-text-muted">{formatSize(asset.size)}</span>
                      <span className="text-[10px] px-1 py-[1px] rounded bg-gdpro-bg-hover text-gdpro-text-muted font-medium">{categoryName(catInfo?.id, catInfo?.name)}</span>
                    </div>
                    {phaseInfo && (
                      <span className="text-[10px] px-1 py-[1px] rounded bg-gdpro-bg-hover text-gdpro-text-muted font-medium mt-0.5 inline-block">{uiLanguage === 'en' ? copy.phaseLabel(phaseInfo.id) : phaseInfo.name}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop animate-fade-in p-4" onClick={() => setPreviewAsset(null)}>
          <div className="max-w-[85vw] max-h-[85vh] relative gdpro-modal-shell rounded-xl p-2" onClick={(e) => e.stopPropagation()}>
            <img src={previewAsset.previewUrl || previewAsset.url} alt={previewAsset.name} className="max-w-full max-h-[72vh] object-contain rounded-[10px]" />
            <div className="px-2 py-2">
              <p className="text-[13px] text-gdpro-text font-medium">{previewAsset.name}</p>
              <p className="text-[10px] text-gdpro-text-muted">{previewAsset.projectName} · {formatSize(previewAsset.size)}</p>
            </div>
            <button onClick={() => setPreviewAsset(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gdpro-bg-elevated border border-gdpro-border flex items-center justify-center text-gdpro-text hover:text-gdpro-danger transition-colors">
              <X className="w-3 h-3" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop animate-fade-in p-4" onClick={() => setPreviewDoc(null)}>
          <div className="w-full max-w-2xl gdpro-card max-h-[80vh] flex flex-col animate-scale-in shadow-2xl rounded-[10px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-gdpro-border shrink-0">
              <div>
                <h3 className="text-[13px] font-semibold text-gdpro-text">{previewDoc.title}</h3>
                <p className="text-[10px] text-gdpro-text-muted">{previewDoc.projectName} · {copy.phaseLabel(previewDoc.phase)}</p>
              </div>
              <button onClick={() => setPreviewDoc(null)} className="p-1 rounded-md hover:bg-gdpro-bg-hover transition-colors">
                <X className="w-3.5 h-3.5 text-gdpro-text-secondary" strokeWidth={2} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <MarkdownRender content={previewDoc.content} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
