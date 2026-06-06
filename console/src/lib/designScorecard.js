import { buildBrandAssetManifest } from './brandAssetManifest';
import { buildMaterialProductionPlan } from './materialProduction';
import { buildArtworkQualityReport } from './artworkQuality';
import { buildPreflightReview } from './preflightReview';
import { buildDeliveryPackage } from './deliveryPackage';
import { buildDesignBriefContract } from './designBriefContract';

export const DESIGN_SCORECARD_SCHEMA_VERSION = 'gdpro.design-director-scorecard.v1';
export const DESIGN_SCORECARD_PASS_SCORE = 85;

const DIMENSION_WEIGHTS = {
  brandConsistency: 0.24,
  productionPrecision: 0.22,
  systemReuse: 0.18,
  commercialReadiness: 0.22,
  governance: 0.14,
};

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratio(part, total, emptyValue = 0) {
  if (!total) return emptyValue;
  return Math.max(0, Math.min(1, part / total));
}

function hasDocument(project, key) {
  return Boolean(project?.documents?.[key]?.content || project?.documents?.[key]);
}

function getProjectAssets(project) {
  return Object.values(project?.assets || {}).flat();
}

function getMaterialEval(materialPlan, materialId) {
  return (materialPlan?.evaluations || []).find((item) => item.materialId === materialId) || null;
}

function scoreCheck({ id, label, passed, points, detail = '', evidence = '' }) {
  return {
    id,
    label,
    passed: Boolean(passed),
    points,
    earned: passed ? points : 0,
    detail,
    evidence,
  };
}

function weightedCheck({ id, label, score, points, detail = '', evidence = '' }) {
  const earned = Math.max(0, Math.min(points, (clampScore(score) / 100) * points));
  return {
    id,
    label,
    passed: earned >= points * 0.98,
    points,
    earned,
    score: clampScore(score),
    detail,
    evidence,
  };
}

function buildDimension({ id, label, weight, checks }) {
  const total = checks.reduce((sum, item) => sum + item.points, 0) || 1;
  const earned = checks.reduce((sum, item) => sum + item.earned, 0);
  const score = clampScore((earned / total) * 100);
  return {
    id,
    label,
    weight,
    score,
    checks,
  };
}

function issue({ id, dimension, severity, title, detail, evidence = '', fix = '' }) {
  return {
    id,
    dimension,
    severity,
    title,
    detail,
    evidence,
    fix,
  };
}

function getSeverityRank(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[severity] ?? 0;
}

function getGrade(score) {
  if (score >= 92) return 'A';
  if (score >= 85) return 'B';
  if (score >= 72) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function materialRefStats(materialPlan, manifest) {
  const itemIds = new Set((manifest?.items || []).map((item) => item.id));
  const refs = (materialPlan?.materials || []).flatMap((material) => material.manifestRefs || []);
  const validRefs = refs.filter((ref) => ref.itemId && itemIds.has(ref.itemId));
  const roles = new Map();

  refs.forEach((ref) => {
    if (!ref?.role || !ref.itemId) return;
    const usedBy = roles.get(ref.role) || new Set();
    usedBy.add(ref.itemId);
    roles.set(ref.role, usedBy);
  });

  return {
    total: refs.length,
    valid: validRefs.length,
    roles,
    sharedRoleCount: [...roles.values()].filter((set) => set.size === 1).length,
  };
}

function countApprovedMaterials(materials) {
  return materials.filter((material) => ['approved', 'exported'].includes(material.status)).length;
}

function countExportedMaterials(materials) {
  return materials.filter((material) => material.status === 'exported').length;
}

function buildBrandConsistencyDimension({ manifest, materialPlan, artworkQuality, designBriefContract }) {
  const refs = materialRefStats(materialPlan, manifest);
  const materials = materialPlan.materials || [];
  const sourceQaRatio = ratio(artworkQuality.stats.passed, artworkQuality.stats.total, 0);
  const manifestRefsRatio = ratio(refs.valid, refs.total, materials.length ? 0 : 1);

  return buildDimension({
    id: 'brandConsistency',
    label: '品牌一致性',
    weight: DIMENSION_WEIGHTS.brandConsistency,
    checks: [
      scoreCheck({
        id: 'manifest-locked',
        label: '品牌资产已锁定',
        passed: manifest.locked,
        points: 22,
        detail: '可复用 Logo、色彩、字体和策略资产必须先锁定。',
        evidence: 'assetManifest.lockedAt',
      }),
      weightedCheck({
        id: 'manifest-readiness',
        label: '必需品牌要素完整',
        score: manifest.readiness,
        points: 18,
        evidence: 'assetManifest.requiredSlots',
      }),
      scoreCheck({
        id: 'brief-contract-locked',
        label: '需求约定书已锁定',
        passed: Boolean(designBriefContract?.locked && !designBriefContract?.stale),
        points: 22,
        detail: '商用签收前，设计意图必须锁定成当前项目可读取的约定。',
        evidence: 'control.designBriefContract',
      }),
      weightedCheck({
        id: 'current-manifest-refs',
        label: '物料引用当前品牌资产',
        score: manifestRefsRatio * 100,
        points: 19,
        evidence: 'materialProduction.materials.*.manifestRefs',
      }),
      weightedCheck({
        id: 'source-qa-consistency',
        label: '源稿检查确认引用完整',
        score: sourceQaRatio * 100,
        points: 19,
        evidence: 'artworkQuality.audits',
      }),
    ],
  });
}

function buildProductionPrecisionDimension({ materialPlan, artworkQuality }) {
  const materials = materialPlan.materials || [];
  const checks = (materialPlan.evaluations || []).flatMap((evaluation) => evaluation.checks || []);
  const specCheckRatio = ratio(checks.filter((item) => item.passed).length, checks.length, 0);
  const approvedRatio = ratio(countApprovedMaterials(materials), materials.length, 0);
  const sourceQaReadiness = artworkQuality.stats.readiness || 0;

  return buildDimension({
    id: 'productionPrecision',
    label: '生产精度',
    weight: DIMENSION_WEIGHTS.productionPrecision,
    checks: [
      weightedCheck({
        id: 'material-plan-readiness',
        label: '物料清单就绪度',
        score: materialPlan.readiness,
        points: 28,
        evidence: 'materialProduction.readiness',
      }),
      weightedCheck({
        id: 'source-qa-readiness',
        label: '平均源稿检查就绪度',
        score: sourceQaReadiness,
        points: 28,
        evidence: 'artworkQuality.stats.readiness',
      }),
      weightedCheck({
        id: 'spec-checks',
        label: '尺寸、色彩、导出与源稿检查',
        score: specCheckRatio * 100,
        points: 24,
        evidence: 'materialProduction.evaluations.checks',
      }),
      weightedCheck({
        id: 'approved-materials',
        label: '已通过或已导出的物料状态',
        score: approvedRatio * 100,
        points: 20,
        evidence: 'materialProduction.materials.*.status',
      }),
    ],
  });
}

function buildSystemReuseDimension({ project, manifest, materialPlan, designBriefContract }) {
  const materials = materialPlan.materials || [];
  const refs = materialRefStats(materialPlan, manifest);
  const adoptedReusable = getProjectAssets(project)
    .filter((asset) => asset.status === 'adopted' && ['logo', 'draft', 'product', 'scene', 'deliverable'].includes(asset.category));
  const targetMaterialCount = 3;
  const roleCoverage = ratio(refs.roles.size, 4, 0);
  const sharedRoles = ratio(refs.sharedRoleCount, Math.max(1, refs.roles.size), 0);
  const materialSuiteRatio = ratio(materials.length, targetMaterialCount, 0);
  const reusableAssetRatio = ratio(adoptedReusable.length, 3, 0);
  const contractTargetRatio = ratio(
    (designBriefContract?.targets?.length || 0) - (designBriefContract?.missingTargets?.length || 0),
    designBriefContract?.targets?.length || 0,
    1,
  );

  return buildDimension({
    id: 'systemReuse',
    label: '跨物料系统',
    weight: DIMENSION_WEIGHTS.systemReuse,
    checks: [
      weightedCheck({
        id: 'material-suite',
        label: '商用物料覆盖度',
        score: materialSuiteRatio * 100,
        points: 18,
        detail: '生产级 VI 套件应在多个物料类型上验证视觉系统。',
        evidence: 'materialProduction.materials',
      }),
      weightedCheck({
        id: 'brief-target-coverage',
        label: '需求目标物料已规划',
        score: contractTargetRatio * 100,
        points: 18,
        evidence: 'designBriefContract.targets',
      }),
      weightedCheck({
        id: 'role-coverage',
        label: '复用角色覆盖完整',
        score: roleCoverage * 100,
        points: 22,
        evidence: 'materialProduction.materials.*.requiredRoles',
      }),
      weightedCheck({
        id: 'shared-role-refs',
        label: '共享角色复用同一品牌资产',
        score: sharedRoles * 100,
        points: 22,
        evidence: 'materialProduction.materials.*.manifestRefs',
      }),
      weightedCheck({
        id: 'reusable-assets',
        label: '已采纳可复用视觉资产',
        score: reusableAssetRatio * 100,
        points: 12,
        evidence: 'assets.*.status',
      }),
      scoreCheck({
        id: 'manifest-not-stale',
        label: '品牌资产清单未过期',
        passed: !manifest.stale,
        points: 8,
        evidence: 'assetManifest.sourceRevision',
      }),
    ],
  });
}

function buildCommercialReadinessDimension({ project, preflightReview, deliveryPackage, materialPlan }) {
  const materials = materialPlan.materials || [];
  const exportedRatio = ratio(countExportedMaterials(materials), materials.length, 0);
  const requiredDocs = ['audit', 'viManual', 'handoff', 'deliveryManifest'];
  const docsRatio = ratio(requiredDocs.filter((key) => hasDocument(project, key)).length, requiredDocs.length, 0);
  const fontReady = Boolean(project?.brandKit?.typography?.license || project?.documents?.fontLicense || project?.documents?.audit?.metadata?.fontLicense);

  return buildDimension({
    id: 'commercialReadiness',
    label: '商用交付准备',
    weight: DIMENSION_WEIGHTS.commercialReadiness,
    checks: [
      scoreCheck({
        id: 'preflight-pass',
        label: '交付前检查无严重或高风险问题',
        passed: preflightReview.passed,
        points: 30,
        evidence: 'preflightReview.passed',
      }),
      weightedCheck({
        id: 'delivery-readiness',
        label: '交付包就绪度',
        score: deliveryPackage.readiness,
        points: 28,
        evidence: 'deliveryPackage.readiness',
      }),
      weightedCheck({
        id: 'handoff-documents',
        label: '审查、VI 手册、维护说明和交付清单',
        score: docsRatio * 100,
        points: 22,
        evidence: 'documents.audit / documents.viManual / documents.handoff / documents.deliveryManifest',
      }),
      weightedCheck({
        id: 'exported-materials',
        label: '最终物料已导出',
        score: exportedRatio * 100,
        points: 14,
        evidence: 'materialProduction.materials.*.status',
      }),
      scoreCheck({
        id: 'font-license',
        label: '字体授权或使用边界已记录',
        passed: fontReady || hasDocument(project, 'audit'),
        points: 6,
        evidence: 'brandKit.typography.license / documents.audit',
      }),
    ],
  });
}

function buildGovernanceDimension({ project, preflightReview, deliveryPackage, materialPlan }) {
  const materials = materialPlan.materials || [];
  const hasControlEvents = Boolean((project?.control?.events || []).length || (project?.control?.operationResults || []).length);
  const highIssues = (preflightReview.summary.critical || 0) + (preflightReview.summary.high || 0);
  const deliveryBlockers = deliveryPackage.blockers || [];
  const statusTraceRatio = ratio(materials.filter((material) => material.createdAt && material.updatedAt).length, materials.length, 0);

  return buildDimension({
    id: 'governance',
    label: '工作台治理',
    weight: DIMENSION_WEIGHTS.governance,
    checks: [
      scoreCheck({
        id: 'controlled-operations',
        label: '操作记录已建立',
        passed: hasControlEvents,
        points: 20,
        evidence: 'control.events / control.operationResults',
      }),
      scoreCheck({
        id: 'no-critical-high-preflight',
        label: '无未解决的严重或高风险交付问题',
        passed: highIssues === 0,
        points: 32,
        evidence: 'preflightReview.summary',
      }),
      scoreCheck({
        id: 'no-delivery-blockers',
        label: '交付包无阻断项',
        passed: deliveryBlockers.length === 0,
        points: 28,
        evidence: 'deliveryPackage.blockers',
      }),
      weightedCheck({
        id: 'material-status-trace',
        label: '物料状态时间可追溯',
        score: statusTraceRatio * 100,
        points: 20,
        evidence: 'materialProduction.materials.*.updatedAt',
      }),
    ],
  });
}

function buildIssues({ project, manifest, designBriefContract, materialPlan, artworkQuality, preflightReview, deliveryPackage, dimensions, score }) {
  const issues = [];
  if (!manifest.locked) {
    issues.push(issue({
      id: manifest.stale ? 'manifest-stale' : 'manifest-unlocked',
      dimension: 'brandConsistency',
      severity: 'critical',
      title: manifest.stale ? '品牌资产清单已过期' : '品牌资产清单未锁定',
      detail: '商用 VI 生产必须复用已锁定的品牌资产清单。',
      evidence: 'assetManifest',
      fix: '生产评审前先锁定或刷新品牌资产清单。',
    }));
  }

  if (!designBriefContract?.locked || designBriefContract?.stale) {
    const blocking = designBriefContract?.violations?.filter((item) => ['critical', 'high'].includes(item.severity)) || [];
    issues.push(issue({
      id: designBriefContract?.stale ? 'brief-contract-stale' : 'brief-contract-unlocked',
      dimension: 'brandConsistency',
      severity: blocking.some((item) => item.severity === 'critical') ? 'critical' : 'high',
      title: designBriefContract?.stale ? '需求约定书已过期' : '需求约定书未锁定',
      detail: blocking.length
        ? blocking.map((item) => item.title).join(', ')
        : '商用签收前，工作台需要一份当前版本的需求约定书。',
      evidence: 'control.designBriefContract',
      fix: blocking.length
        ? '补齐缺失的需求或品牌证据，然后锁定需求约定书。'
        : '基于当前需求和品牌规范锁定需求约定书。',
    }));
  }

  if (designBriefContract?.missingTargets?.length) {
    issues.push(issue({
      id: 'brief-targets-missing',
      dimension: 'systemReuse',
      severity: (project?.currentPhase || 1) >= 6 ? 'high' : 'medium',
      title: '需求目标物料缺少生产单',
      detail: designBriefContract.missingTargets.map((item) => item.name).join(', '),
      evidence: 'designBriefContract.targets',
      fix: '为需求中识别出的目标物料添加生产单。',
    }));
  }

  if (!materialPlan.materials.length) {
    issues.push(issue({
      id: 'no-materials',
      dimension: 'productionPrecision',
      severity: 'critical',
      title: '还没有物料生产单',
      detail: '至少需要一个物料才能验证 VI 一致性。',
      evidence: 'materialProduction.materials',
      fix: '基于已锁定的品牌资产创建物料生产单。',
    }));
  }

  if (artworkQuality.stats.total && artworkQuality.stats.passed < artworkQuality.stats.total) {
    issues.push(issue({
      id: 'source-qa-blocked',
      dimension: 'productionPrecision',
      severity: artworkQuality.stats.critical ? 'critical' : 'high',
      title: '源稿检查仍有未解决问题',
      detail: `${artworkQuality.stats.passed}/${artworkQuality.stats.total} 个物料源稿已通过检查。`,
      evidence: 'artworkQuality.audits',
      fix: '重新制作或修复矢量源稿，并再次运行源稿检查。',
    }));
  }

  if (preflightReview.summary.critical || preflightReview.summary.high) {
    issues.push(issue({
      id: 'preflight-blockers',
      dimension: 'commercialReadiness',
      severity: preflightReview.summary.critical ? 'critical' : 'high',
      title: '交付前检查仍有阻断问题',
      detail: `仍有 ${preflightReview.summary.critical || 0} 个严重问题和 ${preflightReview.summary.high || 0} 个高风险问题。`,
      evidence: 'preflightReview.issues',
      fix: '商用签收前修复问题，或明确记录已接受的风险。',
    }));
  }

  if (deliveryPackage.blockers?.length) {
    const critical = deliveryPackage.blockers.some((item) => item.level === 'critical');
    issues.push(issue({
      id: 'delivery-blockers',
      dimension: 'commercialReadiness',
      severity: critical ? 'critical' : 'high',
      title: '交付包尚未就绪',
      detail: deliveryPackage.blockers.slice(0, 3).map((item) => item.title).join(', '),
      evidence: 'deliveryPackage.blockers',
      fix: '补齐维护说明、源资产、成品导出和交付清单。',
    }));
  }

  dimensions
    .filter((dimension) => dimension.score < 80)
    .forEach((dimension) => {
      issues.push(issue({
        id: `dimension-${dimension.id}`,
        dimension: dimension.id,
        severity: dimension.score < 60 ? 'high' : 'medium',
        title: `${dimension.label}低于商用目标`,
        detail: `${dimension.label}当前为 ${dimension.score}/100。`,
        evidence: `designScorecard.dimensions.${dimension.id}`,
        fix: '优先修复该维度中未通过的检查项。',
      }));
    });

  if (score < DESIGN_SCORECARD_PASS_SCORE) {
    issues.push(issue({
      id: 'score-below-threshold',
      dimension: 'overall',
      severity: score < 70 ? 'high' : 'medium',
      title: '设计总监评分低于签收线',
      detail: `当前评分 ${score}/100；签收线为 ${DESIGN_SCORECARD_PASS_SCORE}/100。`,
      evidence: 'designScorecard.score',
      fix: '申请签收前先解决最高风险问题。',
    }));
  }

  return issues.sort((a, b) => getSeverityRank(b.severity) - getSeverityRank(a.severity));
}

function buildRecommendations(issues, dimensions) {
  if (!issues.length) {
    return ['已达到签收和交付包整理条件。'];
  }

  const issueRecs = issues.slice(0, 4).map((item) => item.fix || item.title);
  const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  if (weakest) {
    issueRecs.push(`优先处理${weakest.label}，这是当前最低分维度：${weakest.score}/100。`);
  }
  return [...new Set(issueRecs)].slice(0, 5);
}

export function buildDesignScorecard(project, {
  manifest = null,
  designBriefContract = null,
  materialPlan = null,
  artworkQuality = null,
  preflightReview = null,
  deliveryPackage = null,
} = {}) {
  const resolvedManifest = manifest || buildBrandAssetManifest(project);
  const resolvedMaterialPlan = materialPlan || buildMaterialProductionPlan(project);
  const resolvedDesignBriefContract = designBriefContract || buildDesignBriefContract(project, {
    manifest: resolvedManifest,
    materialPlan: resolvedMaterialPlan,
  });
  const resolvedArtworkQuality = artworkQuality || buildArtworkQualityReport(project);
  const resolvedPreflightReview = preflightReview || buildPreflightReview(project);
  const resolvedDeliveryPackage = deliveryPackage || buildDeliveryPackage(project);

  const dimensions = [
    buildBrandConsistencyDimension({
      manifest: resolvedManifest,
      materialPlan: resolvedMaterialPlan,
      artworkQuality: resolvedArtworkQuality,
      designBriefContract: resolvedDesignBriefContract,
    }),
    buildProductionPrecisionDimension({
      materialPlan: resolvedMaterialPlan,
      artworkQuality: resolvedArtworkQuality,
    }),
    buildSystemReuseDimension({
      project,
      manifest: resolvedManifest,
      materialPlan: resolvedMaterialPlan,
      designBriefContract: resolvedDesignBriefContract,
    }),
    buildCommercialReadinessDimension({
      project,
      preflightReview: resolvedPreflightReview,
      deliveryPackage: resolvedDeliveryPackage,
      materialPlan: resolvedMaterialPlan,
    }),
    buildGovernanceDimension({
      project,
      preflightReview: resolvedPreflightReview,
      deliveryPackage: resolvedDeliveryPackage,
      materialPlan: resolvedMaterialPlan,
    }),
  ];

  const score = clampScore(dimensions.reduce((sum, dimension) => (
    sum + dimension.score * dimension.weight
  ), 0));
  const issues = buildIssues({
    project,
    manifest: resolvedManifest,
    designBriefContract: resolvedDesignBriefContract,
    materialPlan: resolvedMaterialPlan,
    artworkQuality: resolvedArtworkQuality,
    preflightReview: resolvedPreflightReview,
    deliveryPackage: resolvedDeliveryPackage,
    dimensions,
    score,
  });
  const critical = issues.filter((item) => item.severity === 'critical').length;
  const high = issues.filter((item) => item.severity === 'high').length;
  const medium = issues.filter((item) => item.severity === 'medium').length;
  const passed = score >= DESIGN_SCORECARD_PASS_SCORE && critical === 0 && high === 0;
  const status = critical
    ? 'blocked'
    : passed
      ? 'ready'
      : 'needs-fix';

  return {
    schemaVersion: DESIGN_SCORECARD_SCHEMA_VERSION,
    projectId: project?.id || null,
    status,
    passed,
    score,
    threshold: DESIGN_SCORECARD_PASS_SCORE,
    grade: getGrade(score),
    manifestRevision: resolvedManifest.sourceRevision,
    dimensions,
    issues,
    recommendations: buildRecommendations(issues, dimensions),
    stats: {
      materials: resolvedMaterialPlan.materials.length,
      briefContractLocked: resolvedDesignBriefContract.locked,
      briefContractReadiness: resolvedDesignBriefContract.readiness,
      sourceQaPassed: resolvedArtworkQuality.stats.passed,
      sourceQaTotal: resolvedArtworkQuality.stats.total,
      preflightCritical: resolvedPreflightReview.summary.critical || 0,
      preflightHigh: resolvedPreflightReview.summary.high || 0,
      deliveryBlockers: resolvedDeliveryPackage.blockers?.length || 0,
      critical,
      high,
      medium,
    },
  };
}

export function getScorecardMaterialEvidence(scorecard, materialPlan) {
  return (materialPlan?.materials || []).map((material) => {
    const evaluation = getMaterialEval(materialPlan, material.id);
    return {
      materialId: material.id,
      materialName: material.name,
      status: material.status,
      sourceQaPassed: Boolean(evaluation?.artworkAudit?.passed),
      sourceQaReadiness: evaluation?.artworkAudit?.readiness || 0,
      scorecardStatus: scorecard?.status || 'unknown',
    };
  });
}

export function createDesignScorecardDocument(project, options = {}) {
  const scorecard = options.scorecard || buildDesignScorecard(project, options);
  const lines = [
    '# Design Director Scorecard',
    '',
    `- Schema: ${DESIGN_SCORECARD_SCHEMA_VERSION}`,
    `- Status: ${scorecard.status}`,
    `- Score: ${scorecard.score}/${scorecard.threshold}`,
    `- Grade: ${scorecard.grade}`,
    `- Passed: ${scorecard.passed ? 'yes' : 'no'}`,
    '',
    '## Dimensions',
  ];

  scorecard.dimensions.forEach((dimension) => {
    lines.push(`- ${dimension.label}: ${dimension.score}/100`);
    dimension.checks
      .filter((checkItem) => !checkItem.passed)
      .slice(0, 4)
      .forEach((checkItem) => {
        lines.push(`  - [missing] ${checkItem.label}: ${checkItem.detail || checkItem.evidence || 'needs repair'}`);
      });
  });

  lines.push('', '## Blocking Issues');
  if (!scorecard.issues.length) {
    lines.push('- None.');
  }
  scorecard.issues.forEach((item) => {
    lines.push(`- [${item.severity}] ${item.title}`);
    lines.push(`  - dimension: ${item.dimension}`);
    lines.push(`  - evidence: ${item.evidence}`);
    lines.push(`  - fix: ${item.fix}`);
  });

  lines.push('', '## Recommendations');
  scorecard.recommendations.forEach((item) => {
    lines.push(`- ${item}`);
  });

  return {
    title: 'Design Director Scorecard',
    content: lines.join('\n'),
    phase: 6,
    adoptedAt: Date.now(),
    source: 'design-scorecard',
    status: scorecard.passed ? 'locked' : 'needs-fix',
    metadata: {
      schemaVersion: DESIGN_SCORECARD_SCHEMA_VERSION,
      score: scorecard.score,
      threshold: scorecard.threshold,
      grade: scorecard.grade,
      passed: scorecard.passed,
    },
  };
}
