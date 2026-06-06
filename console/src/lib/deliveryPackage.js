import { buildBrandAssetManifest } from './brandAssetManifest';
import { buildMaterialProductionPlan } from './materialProduction';
import { buildPreflightReview } from './preflightReview';
import { hasMaterialArtwork } from './materialArtwork';
import { auditMaterialArtwork } from './artworkQuality';

export const DELIVERY_PACKAGE_SCHEMA_VERSION = 'gdpro.delivery-package.v1';

function now() {
  return Date.now();
}

function hasDocument(project, key) {
  return Boolean(project?.documents?.[key]?.content || project?.documents?.[key]);
}

function getProjectAssets(project) {
  return Object.values(project?.assets || {}).flat();
}

function slug(value) {
  return String(value || 'untitled')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'untitled';
}

function formatSize(size = {}) {
  if (!size.width || !size.height) return 'not specified';
  return `${size.width}x${size.height}${size.unit || 'px'}`;
}

function hasVectorExportTarget(material = {}) {
  return (material.exportTargets || []).some((target) => /(svg|vector|outline|ai|eps|editable)/i.test(String(target || '')));
}

function packageEntry({
  id,
  type,
  label,
  path,
  ready,
  required = true,
  source = '',
  materialId = null,
  format = '',
}) {
  return {
    id,
    type,
    label,
    path,
    ready: Boolean(ready),
    required,
    source,
    materialId,
    format,
  };
}

function buildDocumentEntries(project, { assumeDeliveryManifest = false } = {}) {
  return [
    packageEntry({
      id: 'project-data',
      type: 'project-data',
      label: '项目工作台数据',
      path: `00_project/gdpro-${slug(project?.name || project?.brandName)}.json`,
      ready: Boolean(project?.id),
      source: 'exportGdproProject',
    }),
    packageEntry({
      id: 'brand-asset-manifest',
      type: 'document',
      label: '品牌资产清单',
      path: '01_strategy/brand-asset-manifest.json',
      ready: buildBrandAssetManifest(project).locked,
      source: 'assetManifest',
    }),
    packageEntry({
      id: 'material-spec',
      type: 'document',
      label: 'VI 物料生产规格',
      path: '02_production/material-spec.md',
      ready: hasDocument(project, 'materialSpec'),
      source: 'documents.materialSpec',
    }),
    packageEntry({
      id: 'preflight-audit',
      type: 'document',
      label: '交付前审查报告',
      path: '03_review/preflight-audit.md',
      ready: hasDocument(project, 'audit') && buildPreflightReview(project).passed,
      source: 'documents.audit',
    }),
    packageEntry({
      id: 'vi-manual',
      type: 'document',
      label: 'VI 规范手册',
      path: '04_guidelines/vi-manual.md',
      ready: hasDocument(project, 'viManual'),
      source: 'documents.viManual',
    }),
    packageEntry({
      id: 'handoff-guide',
      type: 'document',
      label: '客户维护说明',
      path: '04_guidelines/handoff.md',
      ready: hasDocument(project, 'handoff'),
      source: 'documents.handoff',
    }),
    packageEntry({
      id: 'delivery-manifest',
      type: 'document',
      label: '交付文件清单',
      path: '00_project/delivery-manifest.json',
      ready: assumeDeliveryManifest || hasDocument(project, 'deliveryManifest'),
      source: 'documents.deliveryManifest',
    }),
  ];
}

function buildSourceAssetEntries(project) {
  return getProjectAssets(project)
    .filter((asset) => asset.status === 'adopted')
    .map((asset, index) => packageEntry({
      id: `source-asset-${asset.id || index}`,
      type: 'source-asset',
      label: asset.name || asset.id || `Asset ${index + 1}`,
      path: asset.path || asset.url || `01_source-assets/${asset.category || 'asset'}/${slug(asset.name || asset.id)}.${asset.type || 'asset'}`,
      ready: Boolean(asset.path || asset.url || asset.previewUrl || asset.id),
      required: false,
      source: `assets.${asset.category || 'unknown'}`,
    }));
}

function buildMaterialExportEntries(project) {
  const plan = buildMaterialProductionPlan(project);
  return plan.materials.map((material) => {
    const artworkAudit = auditMaterialArtwork(project, material);
    return packageEntry({
      id: `material-${material.id}-source-svg`,
      type: 'material-source',
      label: `${material.name} / 可编辑 SVG 源稿`,
      path: material.artwork?.sourcePath || `05_deliverables/${slug(material.name)}/source.svg`,
      ready: material.status === 'exported' && artworkAudit.passed,
      source: `materialProduction.materials.${material.id}.artwork`,
      materialId: material.id,
      format: 'Editable SVG',
    });
  });
}

function buildFolders(entries) {
  const groups = [
    ['00_project', '项目数据与交付清单'],
    ['01_strategy', '已锁定策略与品牌资产'],
    ['02_production', '生产规格'],
    ['03_review', '交付前审查'],
    ['04_guidelines', 'VI 手册与维护说明'],
    ['05_deliverables', '客户可用成品文件'],
  ];

  return groups.map(([folder, label]) => {
    const folderEntries = entries.filter((entry) => entry.path.startsWith(folder));
    return {
      id: folder,
      label,
      path: folder,
      itemCount: folderEntries.length,
      readyCount: folderEntries.filter((entry) => entry.ready).length,
      ready: folderEntries.length > 0 && folderEntries.every((entry) => entry.ready),
    };
  });
}

function blocker({ id, level, title, detail, evidence, fix }) {
  return { id, level, title, detail, evidence, fix };
}

function buildBlockers(project, entries) {
  const manifest = buildBrandAssetManifest(project);
  const materialPlan = buildMaterialProductionPlan(project);
  const preflightReview = buildPreflightReview(project);
  const blockers = [];

  if (!manifest.locked) {
    blockers.push(blocker({
      id: manifest.stale ? 'manifest-stale' : 'manifest-unlocked',
      level: 'critical',
      title: manifest.stale ? '品牌资产清单已过期' : '品牌资产清单未锁定',
      detail: '交付包必须引用稳定的品牌资产清单。',
      evidence: 'assetManifest.lockedAt',
      fix: '回到品牌资产区重新锁定清单。',
    }));
  }

  if (!materialPlan.materials.length) {
    blockers.push(blocker({
      id: 'no-materials',
      level: 'critical',
      title: '没有可交付物料',
      detail: '交付包至少需要一个物料生产单。',
      evidence: 'materialProduction.materials',
      fix: '在物料清单中创建并完成物料。',
    }));
  }

  materialPlan.materials
    .map((material) => ({ material, artworkAudit: auditMaterialArtwork(project, material) }))
    .filter(({ artworkAudit }) => !artworkAudit.passed)
    .forEach(({ material, artworkAudit }) => {
      const topIssue = artworkAudit.issues.find((item) => ['critical', 'high'].includes(item.severity)) || artworkAudit.issues[0];
      blockers.push(blocker({
        id: `material-source-qa-${material.id}`,
        level: 'high',
        title: `${material.name} 源稿检查未通过`,
        detail: topIssue?.detail || '交付包不能只依赖状态字段，必须包含可审查、可编辑的矢量源文件。',
        evidence: `materialProduction.materials.${material.id}.artwork`,
        fix: topIssue?.fix || '制作物料源稿后再导出并归档。',
      }));
    });

  materialPlan.materials
    .filter((material) => material.status !== 'exported')
    .forEach((material) => {
      blockers.push(blocker({
        id: `material-not-exported-${material.id}`,
        level: 'high',
        title: `${material.name} 尚未导出`,
        detail: '当前物料还没有完成最终导出，不能作为客户交付文件。',
        evidence: `materialProduction.materials.${material.id}.status`,
        fix: '完成排版和导出后，将物料状态切换为已导出。',
      }));
    });

  materialPlan.materials
    .filter((material) => !hasVectorExportTarget(material))
    .forEach((material) => {
      blockers.push(blocker({
        id: `material-no-vector-target-${material.id}`,
        level: 'high',
        title: `${material.name} 缺少可编辑矢量交付目标`,
        detail: '最终交付不能只包含 PNG/JPG 等位图预览，必须包含 SVG、AI、EPS 或其他可编辑源文件。',
        evidence: `materialProduction.materials.${material.id}.exportTargets`,
        fix: '为这项物料加入可编辑 SVG 或其他可编辑矢量文件目标。',
      }));
    });

  if (!preflightReview.passed || !hasDocument(project, 'audit')) {
    blockers.push(blocker({
      id: 'preflight-not-passed',
      level: 'critical',
      title: '交付前审查未通过或缺少审查报告',
      detail: '正式交付前必须有无严重/高风险阻断的审查报告。',
      evidence: 'preflightReview / documents.audit',
      fix: '运行交付前检查并修复阻断项。',
    }));
  }

  ['viManual', 'handoff', 'deliveryManifest'].forEach((key) => {
    if (!hasDocument(project, key)) {
    const documentLabel = {
      viManual: 'VI 规范手册',
      handoff: '客户维护说明',
      deliveryManifest: '交付文件清单',
    }[key] || key;
    blockers.push(blocker({
      id: `missing-${key}`,
      level: key === 'deliveryManifest' ? 'high' : 'critical',
      title: `缺少 ${documentLabel}`,
        detail: '交付包需要完整的规范、交接说明和文件归档清单。',
        evidence: `documents.${key}`,
        fix: '点击整理交付包，或由工作台整理对应文档。',
      }));
    }
  });

  const missingRequired = entries.filter((entry) => entry.required && !entry.ready);
  if (missingRequired.length) {
    blockers.push(blocker({
      id: 'required-entries-not-ready',
      level: 'high',
      title: '交付清单存在未就绪项目',
      detail: missingRequired.map((entry) => entry.label).join('、'),
      evidence: 'deliveryPackage.entries',
      fix: '补齐文档、导出文件或项目数据后重新整理交付包。',
    }));
  }

  return blockers;
}

export function buildDeliveryPackage(project, options = {}) {
  const documentEntries = buildDocumentEntries(project, options);
  const sourceEntries = buildSourceAssetEntries(project);
  const exportEntries = buildMaterialExportEntries(project);
  const entries = [...documentEntries, ...sourceEntries, ...exportEntries];
  const blockers = buildBlockers(project, entries);
  const criticalCount = blockers.filter((item) => item.level === 'critical').length;
  const highCount = blockers.filter((item) => item.level === 'high').length;
  const readyEntries = entries.filter((entry) => entry.ready).length;
  const requiredEntries = entries.filter((entry) => entry.required).length;
  const readyRequired = entries.filter((entry) => entry.required && entry.ready).length;
  const materialPlan = buildMaterialProductionPlan(project);
  const materialExports = exportEntries.length;
  const readyMaterialExports = exportEntries.filter((entry) => entry.ready).length;
  const readiness = Math.round((
    (buildBrandAssetManifest(project).locked ? 0.15 : 0) +
    (materialPlan.blockers.length === 0 && materialPlan.materials.length ? 0.15 : 0) +
    (buildPreflightReview(project).passed && hasDocument(project, 'audit') ? 0.20 : 0) +
    (requiredEntries ? (readyRequired / requiredEntries) * 0.25 : 0) +
    (materialExports ? (readyMaterialExports / materialExports) * 0.25 : 0)
  ) * 100);
  const ready = blockers.length === 0;

  return {
    schemaVersion: DELIVERY_PACKAGE_SCHEMA_VERSION,
    projectId: project?.id || null,
    status: ready ? 'ready' : criticalCount ? 'blocked' : 'needs-export',
    ready,
    readiness,
    builtAt: project?.deliveryPackage?.builtAt || null,
    entries,
    folders: buildFolders(entries),
    blockers,
    stats: {
      entries: entries.length,
      readyEntries,
      requiredEntries,
      readyRequired,
      sourceAssets: sourceEntries.length,
      materialExports,
      readyMaterialExports,
      materials: materialPlan.materials.length,
      exportedMaterials: materialPlan.materials.filter((material) => material.status === 'exported').length,
      sourceArtworks: materialPlan.materials.filter((material) => hasMaterialArtwork(material)).length,
      sourceQaPassed: materialPlan.evaluations.filter((evaluation) => evaluation.artworkAudit?.passed).length,
      critical: criticalCount,
      high: highCount,
    },
  };
}

export function createViManualDocument(project) {
  const manifest = buildBrandAssetManifest(project);
  const materialPlan = buildMaterialProductionPlan(project);
  const colors = project?.brandKit?.colors || [];
  const typography = project?.brandKit?.typography || {};
  const lines = [
    '# VI 规范手册',
    '',
    `- Schema: ${DELIVERY_PACKAGE_SCHEMA_VERSION}`,
    `- Brand: ${project?.brandName || project?.name || 'Untitled Brand'}`,
    `- Manifest: ${manifest.status}`,
    '',
    '## 1. 品牌核心',
    project?.brandKit?.philosophy || project?.documents?.philosophy?.content || '- 尚未记录设计哲学',
    '',
    '## 2. Logo 与核心资产',
  ];

  if (!manifest.items.length) {
    lines.push('- 尚未锁定生产资产');
  }

  manifest.items.forEach((item) => {
    lines.push(`- ${item.role}: ${item.name || item.value} (${item.id})`);
  });

  lines.push('', '## 3. 色彩系统');
  if (!colors.length) lines.push('- 尚未记录色彩 token');
  colors.forEach((color) => {
    lines.push(`- ${color.name || color.hex}: ${color.hex}${color.usage ? ` / ${color.usage}` : ''}`);
  });

  lines.push('', '## 4. 字体系统');
  lines.push(`- Display: ${typography.display || 'not specified'}`);
  lines.push(`- Body: ${typography.body || 'not specified'}`);
  lines.push(`- License: ${typography.license || project?.documents?.fontLicense?.title || 'pending review'}`);

  lines.push('', '## 5. 物料应用');
  if (!materialPlan.materials.length) lines.push('- 尚未创建物料');
  materialPlan.materials.forEach((material) => {
    const evaluation = materialPlan.evaluations.find((item) => item.materialId === material.id);
    lines.push(`- ${material.name}: ${formatSize(material.size)}, ${material.colorMode}, ${material.status}`);
    lines.push(`  - refs: ${material.manifestRefs.map((ref) => `${ref.role}:${ref.itemId || 'missing'}`).join(', ')}`);
    lines.push(`  - source: ${material.artwork?.sourcePath || 'missing deterministic SVG'}`);
    lines.push(`  - source QA: ${evaluation?.artworkAudit?.passed ? 'pass' : 'blocked'} (${evaluation?.artworkAudit?.readiness || 0}%)`);
  });

  lines.push('', '## 6. 使用边界');
  lines.push('- 所有最终物料必须复用本手册中的 Manifest ID、色彩 token 和字体 token。');
  lines.push('- 概念图仅可作为方向探索或 mockup，不可替代可追踪源文件。');
  lines.push('- 修改 Logo、色彩或字体后必须重新运行 Manifest、Material Plan、Preflight 和 Delivery Package。');

  return {
    title: 'VI 规范手册',
    content: lines.join('\n'),
    phase: 6,
    adoptedAt: now(),
    source: 'delivery-package',
    status: 'locked',
    metadata: {
      schemaVersion: DELIVERY_PACKAGE_SCHEMA_VERSION,
      manifestRevision: manifest.sourceRevision,
      materialCount: materialPlan.materials.length,
    },
  };
}

export function createHandoffDocument(project) {
  const packageState = buildDeliveryPackage({
    ...project,
    documents: {
      ...(project.documents || {}),
      handoff: project.documents?.handoff || { content: 'generated handoff guide' },
    },
  }, { assumeDeliveryManifest: true });
  const lines = [
    '# 客户交付与维护说明',
    '',
    `- Schema: ${DELIVERY_PACKAGE_SCHEMA_VERSION}`,
    `- Brand: ${project?.brandName || project?.name || 'Untitled Brand'}`,
    `- Package status: ${packageState.status}`,
    '',
    '## 交付包结构',
    ...packageState.folders.map((folder) => `- ${folder.path}: ${folder.label} (${folder.readyCount}/${folder.itemCount})`),
    '',
    '## 维护规则',
    '- 修改品牌 token 前，先创建新版本并保留旧版本归档。',
    '- 新增物料必须先进入 Material Plan，再进入 Preflight Review。',
    '- 印刷文件交付前必须确认出血、CMYK/Pantone、供应商规格和字体授权。',
    '- 数字文件交付前必须确认多尺寸导出、清晰度和使用场景。',
    '',
    '## 风险与责任',
  ];

  if (!packageState.blockers.length) {
    lines.push('- 当前交付包没有 Critical/High 阻断项。');
  } else {
    packageState.blockers.forEach((item) => {
      lines.push(`- [${item.level}] ${item.title}: ${item.fix}`);
    });
  }

  return {
    title: '客户交付与维护说明',
    content: lines.join('\n'),
    phase: 6,
    adoptedAt: now(),
    source: 'delivery-package',
    status: 'locked',
    metadata: {
      schemaVersion: DELIVERY_PACKAGE_SCHEMA_VERSION,
      readiness: packageState.readiness,
      blockerCount: packageState.blockers.length,
    },
  };
}

export function createDeliveryManifestDocument(project, options = {}) {
  const packageState = buildDeliveryPackage(project, {
    assumeDeliveryManifest: options.assumeDeliveryManifest ?? true,
  });
  return {
    title: '交付物文件清单',
    content: JSON.stringify({
      schemaVersion: DELIVERY_PACKAGE_SCHEMA_VERSION,
      projectId: packageState.projectId,
      status: packageState.status,
      readiness: packageState.readiness,
      folders: packageState.folders,
      entries: packageState.entries,
      blockers: packageState.blockers,
      generatedAt: new Date(now()).toISOString(),
    }, null, 2),
    phase: 6,
    adoptedAt: now(),
    source: 'delivery-package',
    status: packageState.ready ? 'locked' : 'needs-fix',
    metadata: {
      schemaVersion: DELIVERY_PACKAGE_SCHEMA_VERSION,
      readiness: packageState.readiness,
      ready: packageState.ready,
    },
  };
}

export function createDeliveryPackage(project) {
  const documents = {
    ...(project.documents || {}),
  };
  const withManual = {
    ...project,
    documents: {
      ...documents,
      viManual: createViManualDocument(project),
    },
  };
  const withHandoff = {
    ...withManual,
    documents: {
      ...withManual.documents,
      handoff: createHandoffDocument(withManual),
    },
  };
  const withManifest = {
    ...withHandoff,
    documents: {
      ...withHandoff.documents,
      deliveryManifest: createDeliveryManifestDocument(withHandoff, { assumeDeliveryManifest: true }),
    },
  };
  const packageState = buildDeliveryPackage(withManifest);

  return {
    ...withManifest,
    deliveryPackage: {
      ...packageState,
      builtAt: now(),
      source: 'delivery-package',
    },
    updatedAt: now(),
  };
}
