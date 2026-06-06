import { buildBrandAssetManifest } from './brandAssetManifest';
import { buildMaterialProductionPlan } from './materialProduction';
import { buildPreflightReview } from './preflightReview';
import { buildDeliveryPackage } from './deliveryPackage';
import { buildDesignBriefContract } from './designBriefContract';
import { buildDesignScorecard } from './designScorecard';

export const PRODUCTION_IMPACT_SCHEMA_VERSION = 'gdpro.production-impact.v1';

const SEVERITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function hasDocument(project, key) {
  return Boolean(project?.documents?.[key]?.content || project?.documents?.[key]);
}

function operation(type, params = {}, reason = '') {
  return {
    id: `impact_${type}_${Object.values(params).filter(Boolean).join('_') || 'project'}`,
    type,
    params,
    reason,
  };
}

function impactItem({
  id,
  artifact,
  status,
  severity = 'medium',
  title,
  detail = '',
  evidence = '',
  affectedBy = [],
  affects = [],
  op = null,
  autoRunnable = false,
}) {
  return {
    id,
    artifact,
    status,
    severity,
    title,
    detail,
    evidence,
    affectedBy,
    affects,
    operation: op,
    autoRunnable: Boolean(op && autoRunnable),
  };
}

function addUnique(items, item) {
  if (!item || items.some((existing) => existing.id === item.id)) return;
  items.push(item);
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const severity = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (severity) return severity;
    return String(a.artifact).localeCompare(String(b.artifact));
  });
}

function sourceQaNeedsRegeneration(audit) {
  const regenerable = new Set([
    'source-present',
    'svg-root',
    'schema-metadata',
    'size-match',
    'viewbox-match',
    'manifest-refs-embedded',
    'artwork-manifest-revision',
    'svg-manifest-revision',
    'no-script',
    'no-external-refs',
  ]);
  return audit?.issues?.some((item) => regenerable.has(item.id));
}

function sourceQaNeedsRefRefresh(audit) {
  return audit?.issues?.some((item) => item.id === 'manifest-refs-current');
}

function buildDependencyGraph(materialPlan) {
  const materialIds = (materialPlan.materials || []).map((material) => `material:${material.id}`);
  return [
    {
      from: 'brief-contract',
      to: 'asset-manifest',
      reason: 'Brief intent determines which brand assets and target surfaces must be locked.',
    },
    {
      from: 'asset-manifest',
      to: 'material-plan',
      reason: 'Materials must cite current Manifest item ids.',
    },
    ...materialIds.map((id) => ({
      from: 'material-plan',
      to: id,
      reason: 'Material source is generated from size, channel, export targets, and Manifest refs.',
    })),
    ...materialIds.map((id) => ({
      from: id,
      to: 'material-spec',
      reason: 'Material spec records source paths, refs, QA, and status.',
    })),
    {
      from: 'material-spec',
      to: 'preflight-review',
      reason: 'Preflight reviews deterministic sources and production specifications.',
    },
    {
      from: 'preflight-review',
      to: 'delivery-package',
      reason: 'Delivery package can be created only after commercial review passes.',
    },
    {
      from: 'delivery-package',
      to: 'review-board',
      reason: 'Final signoff depends on ready delivery artifacts and audit evidence.',
    },
    {
      from: 'review-board',
      to: 'phase-6',
      reason: 'Phase 6 cannot advance until the commercial signoff ledger is complete.',
    },
  ];
}

function contractImpact(project, contract) {
  const blocking = contract.violations.filter((item) => ['critical', 'high'].includes(item.severity));
  if (contract.locked && !contract.stale) return null;
  return impactItem({
    id: contract.stale ? 'brief-contract-stale' : 'brief-contract-unlocked',
    artifact: 'brief-contract',
    status: contract.stale ? 'stale' : blocking.length ? 'blocked' : 'needs-run',
    severity: blocking.some((item) => item.severity === 'critical') ? 'critical' : blocking.length ? 'high' : 'medium',
    title: contract.stale ? '需求约定书已过期' : '需求约定书未锁定',
    detail: blocking.length
      ? blocking.map((item) => item.title).join(', ')
      : '将当前需求、品牌规范和目标物料锁定成工作台可读取的约定。',
    evidence: 'control.designBriefContract',
    affects: ['asset-manifest', 'material-plan', 'design-scorecard'],
    op: blocking.length ? null : operation('compile_design_brief_contract', {}, '确认当前客户需求、品牌规范和目标物料。'),
    autoRunnable: !blocking.length,
  });
}

function manifestImpact(manifest) {
  if (manifest.locked && !manifest.stale) return null;
  return impactItem({
    id: manifest.stale ? 'asset-manifest-stale' : 'asset-manifest-unlocked',
    artifact: 'asset-manifest',
    status: manifest.stale ? 'stale' : manifest.productionReady ? 'needs-run' : 'blocked',
    severity: manifest.productionReady ? 'high' : 'critical',
    title: manifest.stale ? '品牌资产清单已过期' : '品牌资产清单未锁定',
    detail: manifest.productionReady
      ? '制作或修复商用物料源稿前，请先锁定当前品牌资产。'
      : `缺少：${manifest.missing.map((item) => item.label).join('、') || '可生产的品牌证据'}。`,
    evidence: 'assetManifest',
    affectedBy: ['brief-contract'],
    affects: ['material-plan', 'material-source', 'preflight-review', 'delivery-package'],
    op: manifest.productionReady ? operation('lock_asset_manifest', {}, '锁定当前品牌资产，供后续交付物统一引用。') : null,
    autoRunnable: manifest.productionReady,
  });
}

function targetImpact(contract, manifest) {
  return (contract.missingTargets || []).map((target) => impactItem({
    id: `target-material-${target.templateId}`,
    artifact: 'material-plan',
    status: manifest.locked ? 'needs-run' : 'blocked',
    severity: 'medium',
    title: `缺少需求物料：${target.name}`,
    detail: '需求约定书识别到该目标物料，但目前还没有对应生产单。',
    evidence: 'designBriefContract.targets',
    affectedBy: ['brief-contract', 'asset-manifest'],
    affects: ['material-source', 'material-spec', 'preflight-review'],
    op: manifest.locked
      ? operation('add_material', { templateId: target.templateId }, `加入客户需求中的交付物：${target.name}。`)
      : null,
    autoRunnable: manifest.locked,
  }));
}

function materialImpacts(materialPlan, manifest) {
  const items = [];
  materialPlan.evaluations.forEach((evaluation) => {
    const material = materialPlan.materials.find((entry) => entry.id === evaluation.materialId);
    if (!material) return;
    const audit = evaluation.artworkAudit;

    if (evaluation.missingRoles?.length || sourceQaNeedsRefRefresh(audit)) {
      addUnique(items, impactItem({
        id: `material-refs-${material.id}`,
        artifact: `material:${material.id}`,
        status: manifest.locked ? 'needs-run' : 'blocked',
        severity: 'high',
        title: `${material.name} 品牌资产引用需要刷新`,
        detail: evaluation.missingRoles?.length
          ? `缺少引用：${evaluation.missingRoles.join('、')}。`
          : '当前物料引用不再指向已锁定品牌资产清单。',
        evidence: `materialProduction.materials.${material.id}.manifestRefs`,
        affectedBy: ['asset-manifest', 'material-plan'],
        affects: ['material-source', 'material-spec', 'preflight-review', 'delivery-package'],
        op: manifest.locked
          ? operation('refresh_material_manifest_refs', { materialId: material.id }, `同步 ${material.name} 的品牌资产引用。`)
          : null,
        autoRunnable: manifest.locked,
      }));
    }

    if (!audit?.passed && sourceQaNeedsRegeneration(audit)) {
      addUnique(items, impactItem({
        id: `material-source-${material.id}`,
        artifact: `material:${material.id}`,
        status: 'needs-run',
        severity: audit.summary?.critical ? 'critical' : 'high',
        title: `${material.name} 源稿需要重新制作`,
        detail: audit.issues?.map((item) => item.label).slice(0, 3).join('、') || '源稿检查未通过。',
        evidence: `materialProduction.materials.${material.id}.artwork`,
        affectedBy: ['asset-manifest', 'material-plan'],
        affects: ['material-spec', 'preflight-review', 'delivery-package', 'review-board'],
        op: operation('generate_material_artwork', { materialId: material.id }, `重新制作 ${material.name} 的可编辑源画稿。`),
        autoRunnable: true,
      }));
    }

    if (audit?.passed && ['planned', 'designing'].includes(material.status)) {
      addUnique(items, impactItem({
        id: `material-approval-${material.id}`,
        artifact: `material:${material.id}`,
        status: 'needs-review',
        severity: 'medium',
        title: `${material.name} 等待设计批准`,
        detail: '源稿检查已通过，交付检查和最终交付前仍需要批准该物料。',
        evidence: `materialProduction.materials.${material.id}.status`,
        affectedBy: ['material-source'],
        affects: ['preflight-review', 'delivery-package', 'review-board'],
        op: operation('set_material_status', { materialId: material.id, status: 'approved' }, `记录 ${material.name} 已通过设计确认。`),
        autoRunnable: false,
      }));
    }

    if (audit?.passed && material.status === 'approved') {
      addUnique(items, impactItem({
        id: `material-export-${material.id}`,
        artifact: `material:${material.id}`,
        status: 'needs-review',
        severity: 'medium',
        title: `${material.name} 等待导出确认`,
        detail: '该物料已批准，需要标记为已导出后交付包才能就绪。',
        evidence: `materialProduction.materials.${material.id}.status`,
        affectedBy: ['material-source'],
        affects: ['delivery-package', 'review-board'],
        op: operation('set_material_status', { materialId: material.id, status: 'exported' }, `记录 ${material.name} 已准备好交付文件。`),
        autoRunnable: false,
      }));
    }
  });

  return items;
}

function documentImpacts(project, materialPlan) {
  const items = [];
  if (materialPlan.materials.length > 0 && !hasDocument(project, 'materialSpec')) {
    addUnique(items, impactItem({
      id: 'material-spec-missing',
      artifact: 'material-spec',
      status: 'needs-run',
      severity: 'high',
      title: '物料生产规格需要刷新',
      detail: '规格应记录物料尺寸、品牌引用、源稿路径、检查状态和当前状态。',
      evidence: 'documents.materialSpec',
      affectedBy: ['material-plan', 'material-source'],
      affects: ['preflight-review', 'delivery-package'],
      op: operation('refresh_material_spec', {}, '更新物料说明，记录尺寸、源稿路径和检查状态。'),
      autoRunnable: true,
    }));
  }
  return items;
}

function reviewImpacts(project, materialPlan, preflightReview, deliveryPackage, scorecard) {
  const items = [];
  const materialPlanReady = materialPlan.materials.length > 0 && materialPlan.blockers.length === 0;

  if (materialPlanReady && (!project?.preflightReview?.reviewedAt || !hasDocument(project, 'audit'))) {
    addUnique(items, impactItem({
      id: 'preflight-not-run',
      artifact: 'preflight-review',
      status: 'needs-run',
      severity: 'high',
      title: '需要运行交付前检查',
      detail: '当前生产状态尚未整理商用审查报告。',
      evidence: 'preflightReview / documents.audit',
      affectedBy: ['material-spec', 'material-source'],
      affects: ['delivery-package', 'review-board'],
      op: operation('run_preflight_review', {}, '完成交付前检查，整理尺寸、源文件和文档风险。'),
      autoRunnable: true,
    }));
  } else if (preflightReview.summary.critical || preflightReview.summary.high) {
    addUnique(items, impactItem({
      id: 'preflight-blocking-issues',
      artifact: 'preflight-review',
      status: 'blocked',
      severity: preflightReview.summary.critical ? 'critical' : 'high',
      title: '交付前检查有阻断问题',
      detail: `仍有 ${preflightReview.summary.critical || 0} 个严重问题和 ${preflightReview.summary.high || 0} 个高风险问题。`,
      evidence: 'preflightReview.issues',
      affectedBy: ['asset-manifest', 'material-plan', 'material-source'],
      affects: ['delivery-package', 'review-board'],
      op: project?.preflightReview?.reviewedAt
        ? operation('run_preflight_review', {}, '上游内容修复后重新检查交付风险。')
        : null,
      autoRunnable: false,
    }));
  }

  if (preflightReview.passed && deliveryPackage.blockers.some((item) => ['missing-viManual', 'missing-handoff', 'missing-deliveryManifest'].includes(item.id))) {
    addUnique(items, impactItem({
      id: 'delivery-docs-missing',
      artifact: 'delivery-package',
      status: 'needs-run',
      severity: 'high',
      title: '需要整理交付包文档',
      detail: '请基于已审查状态整理 VI 手册、维护说明和交付清单。',
      evidence: 'documents.viManual / documents.handoff / documents.deliveryManifest',
      affectedBy: ['preflight-review'],
      affects: ['review-board'],
      op: operation('create_delivery_package', {}, '整理客户可接收的 VI 手册、维护说明和交付清单。'),
      autoRunnable: true,
    }));
  } else if (deliveryPackage.blockers.length) {
    addUnique(items, impactItem({
      id: 'delivery-package-blocked',
      artifact: 'delivery-package',
      status: 'blocked',
      severity: deliveryPackage.blockers.some((item) => item.level === 'critical') ? 'critical' : 'high',
      title: '交付包尚未就绪',
      detail: deliveryPackage.blockers.slice(0, 3).map((item) => item.title).join(', '),
      evidence: 'deliveryPackage.blockers',
      affectedBy: ['preflight-review', 'material-source'],
      affects: ['review-board'],
    }));
  }

  if (!scorecard.passed) {
    addUnique(items, impactItem({
      id: 'design-scorecard-blocked',
      artifact: 'design-scorecard',
      status: scorecard.status === 'blocked' ? 'blocked' : 'needs-review',
      severity: scorecard.stats.critical ? 'critical' : scorecard.stats.high ? 'high' : 'medium',
      title: '设计总监评分阻断签收',
      detail: scorecard.issues.slice(0, 3).map((item) => item.title).join('、') || `评分 ${scorecard.score}/${scorecard.threshold}。`,
      evidence: 'designScorecard',
      affectedBy: ['brief-contract', 'asset-manifest', 'material-source', 'delivery-package'],
      affects: ['review-board', 'phase-6'],
    }));
  }

  return items;
}

export function buildProductionImpactMatrix(project, options = {}) {
  if (!project) {
    return {
      schemaVersion: PRODUCTION_IMPACT_SCHEMA_VERSION,
      projectId: null,
      status: 'blocked',
      items: [
        impactItem({
          id: 'select-project',
          artifact: 'project',
          status: 'blocked',
          severity: 'critical',
          title: '选择或创建项目',
          evidence: 'project',
        }),
      ],
      graph: [],
      nextOperations: [],
      stats: { total: 1, critical: 1, high: 0, medium: 0, safe: 0, blocked: 1, stale: 0 },
    };
  }

  const manifest = options.manifest || buildBrandAssetManifest(project);
  const materialPlan = options.materialPlan || buildMaterialProductionPlan(project);
  const designBriefContract = options.designBriefContract || buildDesignBriefContract(project, { manifest, materialPlan });
  const preflightReview = options.preflightReview || buildPreflightReview(project);
  const deliveryPackage = options.deliveryPackage || buildDeliveryPackage(project);
  const designScorecard = options.designScorecard || buildDesignScorecard(project, {
    manifest,
    materialPlan,
    designBriefContract,
    preflightReview,
    deliveryPackage,
  });
  const items = [];

  addUnique(items, contractImpact(project, designBriefContract));
  addUnique(items, manifestImpact(manifest));
  targetImpact(designBriefContract, manifest).forEach((item) => addUnique(items, item));
  materialImpacts(materialPlan, manifest).forEach((item) => addUnique(items, item));
  documentImpacts(project, materialPlan).forEach((item) => addUnique(items, item));
  reviewImpacts(project, materialPlan, preflightReview, deliveryPackage, designScorecard).forEach((item) => addUnique(items, item));

  const sortedItems = sortItems(items);
  const nextOperations = sortedItems
    .filter((item) => item.operation)
    .slice(0, 8)
    .map((item) => ({
      itemId: item.id,
      autoRunnable: item.autoRunnable,
      operation: item.operation,
    }));
  const blocked = sortedItems.filter((item) => item.status === 'blocked');
  const stale = sortedItems.filter((item) => item.status === 'stale');
  const status = !sortedItems.length
    ? 'clean'
    : blocked.some((item) => item.severity === 'critical')
      ? 'blocked'
      : nextOperations.some((item) => item.autoRunnable)
        ? 'actionable'
        : 'needs-review';

  return {
    schemaVersion: PRODUCTION_IMPACT_SCHEMA_VERSION,
    projectId: project.id || null,
    status,
    items: sortedItems,
    graph: buildDependencyGraph(materialPlan),
    nextOperations,
    stats: {
      total: sortedItems.length,
      critical: sortedItems.filter((item) => item.severity === 'critical').length,
      high: sortedItems.filter((item) => item.severity === 'high').length,
      medium: sortedItems.filter((item) => item.severity === 'medium').length,
      safe: sortedItems.filter((item) => item.autoRunnable).length,
      blocked: blocked.length,
      stale: stale.length,
    },
  };
}

export function createProductionImpactDocument(project, options = {}) {
  const matrix = options.matrix || buildProductionImpactMatrix(project, options);
  const lines = [
    '# Production Impact Matrix',
    '',
    `- Schema: ${PRODUCTION_IMPACT_SCHEMA_VERSION}`,
    `- Status: ${matrix.status}`,
    `- Items: ${matrix.stats.total}`,
    `- Blocked: ${matrix.stats.blocked}`,
    `- Safe operations: ${matrix.stats.safe}`,
    '',
    '## Impact Items',
  ];

  if (!matrix.items.length) {
    lines.push('- No production impacts detected.');
  }

  matrix.items.forEach((item) => {
    lines.push(`- [${item.severity}/${item.status}] ${item.title}`);
    lines.push(`  - artifact: ${item.artifact}`);
    lines.push(`  - evidence: ${item.evidence}`);
    if (item.operation) {
      lines.push(`  - operation: ${item.operation.type} ${JSON.stringify(item.operation.params)}`);
    }
  });

  lines.push('', '## Dependency Graph');
  matrix.graph.forEach((edge) => {
    lines.push(`- ${edge.from} -> ${edge.to}: ${edge.reason}`);
  });

  return {
    title: 'Production Impact Matrix',
    content: lines.join('\n'),
    phase: 6,
    adoptedAt: Date.now(),
    source: 'production-impact',
    status: matrix.status === 'clean' ? 'locked' : 'needs-fix',
    metadata: {
      schemaVersion: PRODUCTION_IMPACT_SCHEMA_VERSION,
      status: matrix.status,
      stats: matrix.stats,
    },
  };
}
