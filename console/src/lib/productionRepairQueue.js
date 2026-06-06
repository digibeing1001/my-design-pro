import { buildBrandAssetManifest } from './brandAssetManifest';
import { buildMaterialProductionPlan, MATERIAL_TEMPLATES } from './materialProduction';
import { buildPreflightReview } from './preflightReview';
import { buildDeliveryPackage } from './deliveryPackage';
import { buildDesignScorecard } from './designScorecard';
import { buildDesignBriefContract } from './designBriefContract';
import { buildProductionImpactMatrix } from './productionImpact';

export const PRODUCTION_REPAIR_QUEUE_SCHEMA_VERSION = 'gdpro.production-repair-queue.v1';

const PRIORITY_RANK = {
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
    id: `repair_${type}_${Object.values(params).filter(Boolean).join('_') || 'project'}`,
    type,
    params,
    reason,
  };
}

function repairItem({
  id,
  priority = 'medium',
  phase = 4,
  title,
  detail,
  evidence = '',
  source = 'control',
  actionLabel = '',
  op = null,
  autoRunnable = false,
  blocked = false,
}) {
  return {
    id,
    priority,
    phase,
    title,
    detail,
    evidence,
    source,
    actionLabel: actionLabel || (op ? '处理' : '人工复核'),
    operation: op,
    autoRunnable: Boolean(autoRunnable && op && !blocked),
    status: blocked ? 'blocked' : op ? 'ready' : 'manual',
  };
}

function addUnique(items, item) {
  if (!item || items.some((existing) => existing.id === item.id)) return;
  items.push(item);
}

function operationKey(op) {
  if (!op) return '';
  return `${op.type}:${JSON.stringify(op.params || {})}`;
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const priority = (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
    if (priority) return priority;
    return (a.phase || 0) - (b.phase || 0);
  });
}

function highestPriority(items) {
  return sortItems(items)[0]?.priority || 'info';
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

function buildMaterialRepairItems(project, materialPlan, manifest) {
  const items = [];
  const materials = materialPlan.materials || [];

  if (!materials.length) {
    addUnique(items, repairItem({
      id: 'add-first-material',
      priority: 'critical',
      phase: 4,
      title: '创建第一项生产物料',
      detail: '商用交付至少需要一张包含尺寸、渠道、导出目标和品牌资产引用的物料生产单。',
      evidence: 'materialProduction.materials',
      source: 'materialProduction',
      actionLabel: '添加名片',
      op: manifest.locked
        ? operation('add_material', { templateId: MATERIAL_TEMPLATES[0].id }, '创建第一项可交付物料生产单。')
        : null,
      autoRunnable: manifest.locked,
      blocked: !manifest.locked,
    }));
    return items;
  }

  materialPlan.evaluations.forEach((evaluation) => {
    const material = materials.find((item) => item.id === evaluation.materialId);
    if (!material) return;
    const audit = evaluation.artworkAudit;

    if (evaluation.missingRoles?.length || sourceQaNeedsRefRefresh(audit)) {
      addUnique(items, repairItem({
        id: `refresh-refs-${material.id}`,
        priority: 'high',
        phase: 4,
        title: `刷新 ${material.name} 的品牌资产引用`,
        detail: evaluation.missingRoles?.length
          ? `缺少引用：${evaluation.missingRoles.join('、')}。`
          : '物料引用不再匹配当前品牌资产清单。',
        evidence: `materialProduction.materials.${material.id}.manifestRefs`,
        source: 'materialProduction',
        actionLabel: '刷新引用',
        op: manifest.locked
          ? operation('refresh_material_manifest_refs', { materialId: material.id }, `同步 ${material.name} 的品牌资产引用。`)
          : null,
        autoRunnable: manifest.locked,
        blocked: !manifest.locked,
      }));
    }

    if (!audit?.passed && sourceQaNeedsRegeneration(audit)) {
      addUnique(items, repairItem({
        id: `generate-source-${material.id}`,
        priority: audit.summary?.critical ? 'critical' : 'high',
        phase: 4,
        title: `重新制作 ${material.name} 源稿`,
        detail: audit.issues?.map((item) => item.fix || item.detail || item.label).slice(0, 3).join(' ') || '源稿检查未通过。',
        evidence: `materialProduction.materials.${material.id}.artwork`,
        source: 'artworkQuality',
        actionLabel: '制作源稿',
        op: operation('generate_material_artwork', { materialId: material.id }, `重新制作 ${material.name} 的可编辑源画稿。`),
        autoRunnable: true,
      }));
    }

    if (audit?.passed && material.status !== 'exported') {
      addUnique(items, repairItem({
        id: `export-material-${material.id}`,
        priority: 'medium',
        phase: 6,
        title: `标记 ${material.name} 已导出`,
        detail: '源稿检查已通过，可以归档为客户可接收的可编辑源稿。',
        evidence: `materialProduction.materials.${material.id}.status`,
        source: 'deliveryPackage',
        actionLabel: '标记导出',
        op: operation('set_material_status', { materialId: material.id, status: 'exported' }, `记录 ${material.name} 已准备好交付文件。`),
        autoRunnable: true,
      }));
    }
  });

  return items;
}

function buildReviewRepairItems(project, materialPlan, preflightReview, deliveryPackage) {
  const items = [];
  const materialPlanReady = materialPlan.materials.length > 0 && materialPlan.blockers.length === 0;

  if (materialPlan.materials.length > 0 && !hasDocument(project, 'materialSpec')) {
    addUnique(items, repairItem({
      id: 'refresh-material-spec',
      priority: 'high',
      phase: 4,
      title: '刷新物料生产规格',
      detail: '交付前检查和交付包需要记录尺寸、品牌引用、源稿路径和源稿检查状态的物料规格文档。',
      evidence: 'documents.materialSpec',
      source: 'materialProduction',
      actionLabel: '刷新规格',
      op: operation('refresh_material_spec', {}, '更新物料说明，记录尺寸、源稿路径和检查状态。'),
      autoRunnable: true,
    }));
  }

  if (materialPlanReady && (!project?.preflightReview?.reviewedAt || !hasDocument(project, 'audit'))) {
    addUnique(items, repairItem({
      id: 'run-preflight-review',
      priority: 'high',
      phase: 5,
      title: '运行交付前检查',
      detail: '物料源稿和生产字段就绪后，整理商用审查报告。',
      evidence: 'preflightReview / documents.audit',
      source: 'preflightReview',
      actionLabel: '运行检查',
      op: operation('run_preflight_review', {}, '完成交付前检查，整理尺寸、源文件和文档风险。'),
      autoRunnable: true,
    }));
  }

  if (project?.preflightReview?.reviewedAt && materialPlanReady && !preflightReview.passed) {
    addUnique(items, repairItem({
      id: 'rerun-preflight-review',
      priority: 'medium',
      phase: 5,
      title: '修复后重新检查交付',
      detail: '交付前检查仍有阻断项，完成上游物料修复后需要再运行一次。',
      evidence: 'preflightReview.issues',
      source: 'preflightReview',
      actionLabel: '重新检查',
      op: operation('run_preflight_review', {}, '上游内容修复后重新检查交付风险。'),
      autoRunnable: false,
    }));
  }

  if (preflightReview.passed && deliveryPackage.blockers.some((item) => ['missing-viManual', 'missing-handoff', 'missing-deliveryManifest'].includes(item.id))) {
    addUnique(items, repairItem({
      id: 'create-delivery-package',
      priority: 'high',
      phase: 6,
      title: '整理交付包文档',
      detail: '基于当前已审查项目状态整理 VI 手册、维护说明和交付清单。',
      evidence: 'documents.viManual / documents.handoff / documents.deliveryManifest',
      source: 'deliveryPackage',
      actionLabel: '整理交付包',
      op: operation('create_delivery_package', {}, '整理客户可接收的 VI 手册、维护说明和交付清单。'),
      autoRunnable: true,
    }));
  }

  if (deliveryPackage.ready && (project?.currentPhase || 1) < 6) {
    addUnique(items, repairItem({
      id: 'advance-to-phase-6',
      priority: 'low',
      phase: 6,
      title: '推进到交付阶段',
      detail: '所有交付关卡已通过，项目可以进入交付阶段。',
      evidence: 'phaseState.readyToAdvance',
      source: 'phaseStateMachine',
      actionLabel: '推进阶段',
      op: operation('request_phase_transition', { to: 6 }, '所有交付关卡通过后进入交付阶段。'),
      autoRunnable: false,
    }));
  }

  return items;
}

function buildContractRepairItems(contract, manifest) {
  const items = [];
  if (!contract) return items;

  const blocking = contract.violations.filter((item) => ['critical', 'high'].includes(item.severity));
  if (!contract.locked) {
    addUnique(items, repairItem({
      id: contract.stale ? 'recompile-design-brief-contract' : 'compile-design-brief-contract',
      priority: blocking.some((item) => item.severity === 'critical') ? 'critical' : blocking.length ? 'high' : 'medium',
      phase: 2,
      title: contract.stale ? '重新锁定需求约定书' : '锁定需求约定书',
      detail: blocking.length
        ? blocking.map((item) => item.title).join(', ')
        : '需求、品牌规范和目标物料已可锁定成工作台可读取的约定。',
      evidence: 'control.designBriefContract / documents.briefContract',
      source: 'designBriefContract',
      actionLabel: '锁定约定',
      op: blocking.length
        ? null
        : operation('compile_design_brief_contract', {}, '确认当前客户需求、品牌规范和目标物料。'),
      autoRunnable: !blocking.length,
      blocked: blocking.length > 0,
    }));
  }

  const missingTarget = contract.missingTargets?.[0];
  if (missingTarget) {
    addUnique(items, repairItem({
      id: `add-contract-target-${missingTarget.templateId}`,
      priority: 'medium',
      phase: 4,
      title: `添加需求中的物料：${missingTarget.name}`,
      detail: '需求约定书识别到这项商用物料，但目前还没有生产单。',
      evidence: 'designBriefContract.targets',
      source: 'designBriefContract',
      actionLabel: `加入 ${missingTarget.name}`,
      op: manifest.locked
        ? operation('add_material', { templateId: missingTarget.templateId }, `加入客户需求中的交付物：${missingTarget.name}。`)
        : null,
      autoRunnable: manifest.locked,
      blocked: !manifest.locked,
    }));
  }

  return items;
}

function buildScorecardRepairItems(scorecard, materialPlan, manifest) {
  const items = [];
  const materials = materialPlan.materials || [];
  const weakest = [...(scorecard?.dimensions || [])].sort((a, b) => a.score - b.score)[0];

  if (!scorecard || scorecard.passed) return items;

  if (weakest?.id === 'systemReuse' && materials.length > 0 && materials.length < 3) {
    const usedTemplates = new Set(materials.map((material) => material.templateId));
    const nextTemplate = MATERIAL_TEMPLATES.find((template) => !usedTemplates.has(template.id)) || MATERIAL_TEMPLATES[0];
    addUnique(items, repairItem({
      id: 'expand-material-suite-for-scorecard',
      priority: 'medium',
      phase: 4,
      title: '扩展商用物料套组',
      detail: '设计评分需要多个物料类型来验证跨物料 VI 一致性。',
      evidence: 'designScorecard.dimensions.systemReuse',
      source: 'designScorecard',
      actionLabel: `加入 ${nextTemplate.name}`,
      op: manifest.locked
        ? operation('add_material', { templateId: nextTemplate.id }, `补充 ${nextTemplate.name}，验证多物料 VI 一致性。`)
        : null,
      autoRunnable: manifest.locked,
      blocked: !manifest.locked,
    }));
  }

  if (!items.length) {
    addUnique(items, repairItem({
      id: 'resolve-design-scorecard',
      priority: scorecard.stats?.critical ? 'critical' : scorecard.stats?.high ? 'high' : 'medium',
      phase: 6,
      title: '修复设计评分阻断项',
      detail: scorecard.issues?.slice(0, 3).map((item) => item.fix || item.title).join(' ') || '当前评分低于商用签收线。',
      evidence: 'designScorecard',
      source: 'designScorecard',
      actionLabel: '检查评分',
    }));
  }

  return items;
}

function buildImpactRepairItems(matrix, existingItems = []) {
  const items = [];
  const existingOps = new Set(existingItems.map((item) => operationKey(item.operation)).filter(Boolean));

  (matrix.items || [])
    .filter((item) => item.operation && !existingOps.has(operationKey(item.operation)))
    .slice(0, 4)
    .forEach((item) => {
      addUnique(items, repairItem({
        id: `impact-${item.id}`,
        priority: item.severity,
        phase: 6,
        title: item.title,
        detail: item.detail || '影响范围建议处理这项修复，以恢复下游产物一致性。',
        evidence: item.evidence || item.artifact,
        source: 'productionImpact',
        actionLabel: item.autoRunnable ? '运行修复' : '查看影响',
        op: item.operation,
        autoRunnable: item.autoRunnable,
      }));
    });

  return items;
}

export function buildProductionRepairQueue(project) {
  if (!project) {
    return {
      schemaVersion: PRODUCTION_REPAIR_QUEUE_SCHEMA_VERSION,
      projectId: null,
      status: 'blocked',
      priority: 'critical',
      items: [
        repairItem({
          id: 'select-project',
          priority: 'critical',
          phase: 1,
          title: '选择或创建项目',
          detail: '修复清单需要先选中一个项目。',
          evidence: 'project',
          blocked: true,
        }),
      ],
      stats: { total: 1, open: 1, ready: 0, safe: 0, manual: 0, blocked: 1 },
    };
  }

  const manifest = buildBrandAssetManifest(project);
  const materialPlan = buildMaterialProductionPlan(project);
  const designBriefContract = buildDesignBriefContract(project, { manifest, materialPlan });
  const preflightReview = buildPreflightReview(project);
  const deliveryPackage = buildDeliveryPackage(project);
  const designScorecard = buildDesignScorecard(project, {
    manifest,
    materialPlan,
    designBriefContract,
    preflightReview,
    deliveryPackage,
  });
  const productionImpact = buildProductionImpactMatrix(project, {
    manifest,
    materialPlan,
    designBriefContract,
    preflightReview,
    deliveryPackage,
    designScorecard,
  });
  const items = [];

  if (!manifest.locked) {
    addUnique(items, repairItem({
      id: manifest.stale ? 'relock-asset-manifest' : 'lock-asset-manifest',
      priority: 'critical',
      phase: 3,
      title: manifest.stale ? '重新锁定品牌资产清单' : '锁定品牌资产清单',
      detail: manifest.productionReady
        ? '当前品牌规范已经可用于生产，但尚未锁定给下游物料复用。'
        : `缺少：${manifest.missing.map((item) => item.label).join('、') || '可生产的品牌资产'}。`,
      evidence: 'assetManifest',
      source: 'assetManifest',
      actionLabel: '锁定清单',
      op: manifest.productionReady
        ? operation('lock_asset_manifest', {}, '锁定当前品牌资产，供后续交付物统一引用。')
        : null,
      autoRunnable: manifest.productionReady,
      blocked: !manifest.productionReady,
    }));
  }

  buildContractRepairItems(designBriefContract, manifest).forEach((item) => addUnique(items, item));
  buildMaterialRepairItems(project, materialPlan, manifest).forEach((item) => addUnique(items, item));
  buildReviewRepairItems(project, materialPlan, preflightReview, deliveryPackage).forEach((item) => addUnique(items, item));
  buildScorecardRepairItems(designScorecard, materialPlan, manifest).forEach((item) => addUnique(items, item));
  buildImpactRepairItems(productionImpact, items).forEach((item) => addUnique(items, item));

  const sortedItems = sortItems(items);
  const openItems = sortedItems.filter((item) => item.status !== 'done');
  const readyItems = openItems.filter((item) => item.operation && item.status === 'ready');
  const safeItems = openItems.filter((item) => item.autoRunnable);
  const blockedItems = openItems.filter((item) => item.status === 'blocked');
  const manualItems = openItems.filter((item) => item.status === 'manual' || (item.operation && !item.autoRunnable));
  const status = !openItems.length
    ? 'clear'
    : blockedItems.some((item) => item.priority === 'critical')
      ? 'blocked'
      : safeItems.length
        ? 'actionable'
        : 'needs-review';

  return {
    schemaVersion: PRODUCTION_REPAIR_QUEUE_SCHEMA_VERSION,
    projectId: project.id || null,
    status,
    priority: highestPriority(openItems),
    items: sortedItems,
    stats: {
      total: sortedItems.length,
      open: openItems.length,
      ready: readyItems.length,
      safe: safeItems.length,
      manual: manualItems.length,
      blocked: blockedItems.length,
    },
  };
}
