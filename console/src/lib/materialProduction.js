import { buildBrandAssetManifest } from './brandAssetManifest';
import { hasMaterialArtwork } from './materialArtwork';
import { auditMaterialArtwork } from './artworkQuality';

export const MATERIAL_PRODUCTION_SCHEMA_VERSION = 'gdpro.material-production.v1';

export const MATERIAL_STATUSES = ['planned', 'designing', 'approved', 'exported'];

export const MATERIAL_TEMPLATES = [
  {
    id: 'business-card',
    name: '品牌名片',
    channel: 'print',
    size: { width: 90, height: 54, unit: 'mm' },
    bleed: '3mm',
    colorMode: 'CMYK',
    exportTargets: ['Editable SVG', 'PDF/X-4', 'PNG preview'],
    requiredRoles: ['primary-logo', 'primary-color-token', 'display-font-token', 'body-font-token'],
  },
  {
    id: 'poster-a3',
    name: 'A3 海报',
    channel: 'print',
    size: { width: 297, height: 420, unit: 'mm' },
    bleed: '3mm',
    colorMode: 'CMYK',
    exportTargets: ['Editable SVG', 'PDF/X-4', 'PNG preview'],
    requiredRoles: ['primary-logo', 'primary-color-token', 'display-font-token'],
  },
  {
    id: 'social-square',
    name: '社媒方图',
    channel: 'digital',
    size: { width: 1080, height: 1080, unit: 'px' },
    bleed: 'none',
    colorMode: 'RGB',
    exportTargets: ['Editable SVG', 'PNG', 'JPG'],
    requiredRoles: ['primary-logo', 'primary-color-token', 'body-font-token'],
  },
  {
    id: 'package-label',
    name: '包装标签',
    channel: 'print',
    size: { width: 120, height: 80, unit: 'mm' },
    bleed: '3mm',
    colorMode: 'CMYK',
    exportTargets: ['Editable SVG', 'PDF/X-4', 'PNG preview'],
    requiredRoles: ['primary-logo', 'primary-color-token', 'display-font-token', 'body-font-token'],
  },
  {
    id: 'store-signage',
    name: '门店招牌',
    channel: 'environment',
    size: { width: 3000, height: 900, unit: 'mm' },
    bleed: 'vendor spec',
    colorMode: 'CMYK/Pantone',
    exportTargets: ['Editable SVG outline', 'PDF/X-4', 'PNG preview'],
    requiredRoles: ['primary-logo', 'primary-color-token', 'display-font-token'],
  },
];

function now() {
  return Date.now();
}

function getTemplate(templateId) {
  return MATERIAL_TEMPLATES.find((template) => template.id === templateId) || MATERIAL_TEMPLATES[0];
}

function formatSize(size = {}) {
  if (!size.width || !size.height) return '未设定';
  return `${size.width} × ${size.height} ${size.unit || 'px'}`;
}

function hasVectorExportTarget(material = {}) {
  return (material.exportTargets || []).some((target) => /(svg|vector|outline|ai|eps|editable)/i.test(String(target || '')));
}

function findManifestItemByRole(manifest, role) {
  const items = manifest?.items || [];
  if (role === 'primary-color-token') {
    return items.find((item) => item.role === 'primary-color-token') || items.find((item) => item.role === 'color-token');
  }
  if (role === 'body-font-token') {
    return items.find((item) => item.role === 'body-font-token') || items.find((item) => item.role === 'display-font-token');
  }
  return items.find((item) => item.role === role);
}

function buildManifestRefs(template, manifest) {
  return template.requiredRoles.map((role) => {
    const item = findManifestItemByRole(manifest, role);
    return {
      role,
      itemId: item?.id || null,
      label: item?.name || item?.value || role,
      source: item?.assetId || item?.source || null,
    };
  });
}

function normalizeMaterial(material = {}, index = 0) {
  const template = getTemplate(material.templateId);
  return {
    id: material.id || `material_${index + 1}`,
    templateId: material.templateId || template.id,
    name: material.name || template.name,
    channel: material.channel || template.channel,
    size: material.size || template.size,
    bleed: material.bleed ?? template.bleed,
    colorMode: material.colorMode || template.colorMode,
    exportTargets: material.exportTargets || template.exportTargets,
    requiredRoles: material.requiredRoles || template.requiredRoles,
    manifestRefs: Array.isArray(material.manifestRefs) ? material.manifestRefs : [],
    artwork: material.artwork || null,
    status: MATERIAL_STATUSES.includes(material.status) ? material.status : 'planned',
    exportPath: material.exportPath || '',
    notes: material.notes || '',
    createdAt: material.createdAt || now(),
    updatedAt: material.updatedAt || material.createdAt || now(),
  };
}

function evaluateMaterial(project, material, manifest) {
  const itemsById = new Map((manifest?.items || []).map((item) => [item.id, item]));
  const refs = Array.isArray(material.manifestRefs) ? material.manifestRefs : [];
  const missingRoles = material.requiredRoles.filter((role) => {
    const ref = refs.find((entry) => entry.role === role);
    return !ref?.itemId || !itemsById.has(ref.itemId);
  });
  const hasSize = Boolean(material.size?.width && material.size?.height && material.size?.unit);
  const hasExports = Array.isArray(material.exportTargets) && material.exportTargets.length > 0;
  const hasVectorExport = hasVectorExportTarget(material);
  const hasColorMode = Boolean(material.colorMode);
  const hasArtwork = hasMaterialArtwork(material);
  const artworkAudit = auditMaterialArtwork(project, material);

  return {
    materialId: material.id,
    ready: missingRoles.length === 0 && hasSize && hasExports && hasVectorExport && hasColorMode && artworkAudit.passed,
    missingRoles,
    artworkAudit,
    checks: [
      { id: 'manifest-refs', label: '品牌资产引用完整', passed: missingRoles.length === 0 },
      { id: 'size', label: `尺寸 ${formatSize(material.size)}`, passed: hasSize },
      { id: 'exports', label: '导出目标已设定', passed: hasExports },
      { id: 'vector-export', label: '可编辑矢量交付已设定', passed: hasVectorExport },
      { id: 'color-mode', label: `色彩模式 ${material.colorMode || '未设定'}`, passed: hasColorMode },
      { id: 'source-artwork', label: '可编辑矢量源稿已制作', passed: hasArtwork },
      { id: 'source-qa', label: `源稿检查 ${artworkAudit.readiness}%`, passed: artworkAudit.passed },
    ],
  };
}

export function createMaterialFromTemplate(templateId, manifest, patch = {}) {
  const template = getTemplate(templateId);
  return normalizeMaterial({
    id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    templateId: template.id,
    name: template.name,
    channel: template.channel,
    size: template.size,
    bleed: template.bleed,
    colorMode: template.colorMode,
    exportTargets: template.exportTargets,
    requiredRoles: template.requiredRoles,
    manifestRefs: buildManifestRefs(template, manifest),
    status: 'planned',
    ...patch,
  });
}

export function buildMaterialProductionPlan(project) {
  const manifest = buildBrandAssetManifest(project);
  const saved = project?.materialProduction || {};
  const materials = (saved.materials || []).map((material, index) => normalizeMaterial(material, index));
  const evaluations = materials.map((material) => evaluateMaterial(project, material, manifest));
  const readyMaterials = evaluations.filter((evaluation) => evaluation.ready).length;
  const approvedMaterials = materials.filter((material) => ['approved', 'exported'].includes(material.status)).length;
  const exportedMaterials = materials.filter((material) => material.status === 'exported').length;
  const sourceArtworks = materials.filter((material) => hasMaterialArtwork(material)).length;
  const sourceQaPassed = evaluations.filter((evaluation) => evaluation.artworkAudit?.passed).length;
  const materialScore = materials.length ? readyMaterials / materials.length : 0;
  const approvalScore = materials.length ? approvedMaterials / materials.length : 0;
  const readiness = Math.round((
    (manifest.locked ? 0.35 : 0) +
    (materials.length ? 0.20 : 0) +
    materialScore * 0.30 +
    approvalScore * 0.15
  ) * 100);

  const blockers = [];
  if (!manifest.locked) {
    blockers.push({
      id: 'manifest-unlocked',
      level: 'critical',
      title: '品牌资产清单未锁定',
      detail: '物料生产计划必须引用已锁定的品牌资产清单。',
    });
  }
  if (!materials.length) {
    blockers.push({
      id: 'no-materials',
      level: 'critical',
      title: '尚未创建物料生产单',
      detail: '至少创建一个带尺寸、导出目标和品牌资产引用的物料。',
    });
  }
  evaluations.forEach((evaluation) => {
    if (!evaluation.ready) {
      const material = materials.find((item) => item.id === evaluation.materialId);
      const failedChecks = evaluation.checks
        .filter((item) => !item.passed)
        .map((item) => item.label)
        .join(', ');
      blockers.push({
        id: `material-${evaluation.materialId}`,
        level: 'high',
        title: `${material?.name || '物料'} 未达到生产就绪`,
        detail: evaluation.missingRoles.length
          ? `缺少 ${evaluation.missingRoles.join('、')}。`
          : `未通过检查：${failedChecks || '源稿检查'}。`,
      });
    }
  });

  return {
    schemaVersion: MATERIAL_PRODUCTION_SCHEMA_VERSION,
    projectId: project?.id || null,
    status: blockers.some((blocker) => blocker.level === 'critical')
      ? 'blocked'
      : readyMaterials === materials.length && materials.length
        ? 'ready'
        : 'draft',
    readiness,
    manifestRevision: manifest.sourceRevision,
    manifestLocked: manifest.locked,
    materials,
    evaluations,
    blockers,
    stats: {
      total: materials.length,
      ready: readyMaterials,
      approved: approvedMaterials,
      exported: exportedMaterials,
      sourceArtworks,
      sourceQaPassed,
    },
  };
}

export function addMaterialToProduction(project, templateId) {
  const plan = buildMaterialProductionPlan(project);
  const material = createMaterialFromTemplate(templateId, buildBrandAssetManifest(project));
  return {
    ...project,
    materialProduction: {
      ...(project.materialProduction || {}),
      schemaVersion: MATERIAL_PRODUCTION_SCHEMA_VERSION,
      materials: [...plan.materials, material],
      updatedAt: now(),
    },
    documents: {
      ...(project.documents || {}),
      materialSpec: createMaterialSpecDocument({
        ...project,
        materialProduction: {
          ...(project.materialProduction || {}),
          materials: [...plan.materials, material],
        },
      }),
    },
    updatedAt: now(),
  };
}

export function updateMaterialStatus(project, materialId, status) {
  if (!MATERIAL_STATUSES.includes(status)) return project;
  const materials = (project.materialProduction?.materials || []).map((material) => (
    material.id === materialId
      ? { ...material, status, updatedAt: now() }
      : material
  ));
  return {
    ...project,
    materialProduction: {
      ...(project.materialProduction || {}),
      schemaVersion: MATERIAL_PRODUCTION_SCHEMA_VERSION,
      materials,
      updatedAt: now(),
    },
    documents: {
      ...(project.documents || {}),
      materialSpec: createMaterialSpecDocument({
        ...project,
        materialProduction: {
          ...(project.materialProduction || {}),
          materials,
        },
      }),
    },
    updatedAt: now(),
  };
}

export function refreshMaterialManifestRefs(project, materialId = null) {
  const manifest = buildBrandAssetManifest(project);
  const materials = (project.materialProduction?.materials || []).map((material, index) => {
    const normalized = normalizeMaterial(material, index);
    if (materialId && normalized.id !== materialId) return normalized;
    const template = getTemplate(normalized.templateId);
    const refs = buildManifestRefs({
      ...template,
      requiredRoles: normalized.requiredRoles || template.requiredRoles,
    }, manifest);
    return {
      ...normalized,
      manifestRefs: refs,
      status: normalized.status === 'exported' ? 'approved' : normalized.status,
      updatedAt: now(),
    };
  });

  return {
    ...project,
    materialProduction: {
      ...(project.materialProduction || {}),
      schemaVersion: MATERIAL_PRODUCTION_SCHEMA_VERSION,
      materials,
      updatedAt: now(),
    },
    documents: {
      ...(project.documents || {}),
      materialSpec: createMaterialSpecDocument({
        ...project,
        materialProduction: {
          ...(project.materialProduction || {}),
          materials,
        },
      }),
    },
    updatedAt: now(),
  };
}

export function refreshMaterialSpecDocument(project) {
  return {
    ...project,
    documents: {
      ...(project.documents || {}),
      materialSpec: createMaterialSpecDocument(project),
    },
    updatedAt: now(),
  };
}

export function createMaterialSpecDocument(project) {
  const plan = buildMaterialProductionPlan(project);
  const lines = [
    '# VI 物料生产规格',
    '',
    `- Schema: ${MATERIAL_PRODUCTION_SCHEMA_VERSION}`,
    `- Manifest locked: ${plan.manifestLocked ? 'yes' : 'no'}`,
    `- Production readiness: ${plan.readiness}%`,
    '',
    '## Materials',
  ];

  if (!plan.materials.length) {
    lines.push('- 尚未创建物料生产单');
  }

  plan.materials.forEach((material) => {
    const evaluation = plan.evaluations.find((item) => item.materialId === material.id);
    lines.push(`- ${material.name} (${material.channel})`);
    lines.push(`  - size: ${formatSize(material.size)}, bleed: ${material.bleed}, color: ${material.colorMode}`);
    lines.push(`  - status: ${material.status}`);
    lines.push(`  - exports: ${material.exportTargets.join(', ')}`);
    lines.push(`  - manifest refs: ${material.manifestRefs.map((ref) => `${ref.role}:${ref.itemId || 'missing'}`).join(', ')}`);
    lines.push(`  - source artwork: ${hasMaterialArtwork(material) ? material.artwork.sourcePath : 'missing deterministic SVG'}`);
    lines.push(`  - source QA: ${evaluation?.artworkAudit?.passed ? 'pass' : 'blocked'} (${evaluation?.artworkAudit?.readiness || 0}%)`);
  });

  return {
    title: 'VI 物料生产规格',
    content: lines.join('\n'),
    phase: 4,
    adoptedAt: now(),
    source: 'material-production-plan',
    status: 'locked',
    metadata: {
      schemaVersion: MATERIAL_PRODUCTION_SCHEMA_VERSION,
      readiness: plan.readiness,
      materialCount: plan.materials.length,
      manifestRevision: plan.manifestRevision,
    },
  };
}
