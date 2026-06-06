import { buildBrandAssetManifest } from './brandAssetManifest';
import { buildMaterialProductionPlan } from './materialProduction';
import { hasMaterialArtwork } from './materialArtwork';
import { auditMaterialArtwork } from './artworkQuality';

export const PREFLIGHT_REVIEW_SCHEMA_VERSION = 'gdpro.preflight-review.v1';

function now() {
  return Date.now();
}

function issue({ id, category, severity, title, detail, evidence, fix }) {
  return {
    id,
    category,
    severity,
    title,
    detail,
    evidence: evidence || '',
    fix: fix || '',
  };
}

function getSeverityRank(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[severity] ?? 0;
}

function getProjectAssets(project) {
  return Object.values(project?.assets || {}).flat();
}

function hasDocument(project, key) {
  return Boolean(project?.documents?.[key]?.content || project?.documents?.[key]);
}

function buildIssueSummary(issues) {
  return issues.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});
}

function hasVectorExportTarget(material = {}) {
  return (material.exportTargets || []).some((target) => /(svg|vector|outline|ai|eps|editable)/i.test(String(target || '')));
}

export function buildPreflightReview(project) {
  const manifest = buildBrandAssetManifest(project);
  const materialPlan = buildMaterialProductionPlan(project);
  const assets = getProjectAssets(project);
  const issues = [];

  if (!manifest.locked) {
    issues.push(issue({
      id: manifest.stale ? 'manifest-stale' : 'manifest-unlocked',
      category: 'consistency',
      severity: 'critical',
      title: manifest.stale ? '品牌资产清单已过期' : '品牌资产清单未锁定',
      detail: manifest.stale
        ? '项目资产或品牌规范已变化，当前清单不能作为最终生产依据。'
        : '正式审查前必须锁定 Logo、品牌色、字体和设计哲学的生产引用清单。',
      evidence: 'assetManifest',
      fix: '回到品牌资产区锁定品牌资产清单。',
    }));
  }

  if (materialPlan.blockers.length) {
    materialPlan.blockers.forEach((blocker) => {
      issues.push(issue({
        id: `material-${blocker.id}`,
        category: 'consistency',
        severity: blocker.level === 'critical' ? 'critical' : 'high',
        title: blocker.title,
        detail: blocker.detail,
        evidence: 'materialProduction',
        fix: '补齐物料生产单、品牌资产引用、尺寸或导出目标。',
      }));
    });
  }

  materialPlan.materials.forEach((material) => {
    const artworkAudit = auditMaterialArtwork(project, material);
    artworkAudit.issues
      .filter((item) => ['critical', 'high'].includes(item.severity))
      .forEach((item) => {
        issues.push(issue({
          id: `source-qa-${material.id}-${item.id}`,
          category: 'export',
          severity: item.severity,
          title: `${material.name} 源稿检查：${item.label}`,
          detail: item.detail,
          evidence: item.evidence || `materialProduction.materials.${material.id}.artwork`,
          fix: item.fix,
        }));
      });

    if (!['approved', 'exported'].includes(material.status)) {
      issues.push(issue({
        id: `material-status-${material.id}`,
        category: 'aesthetic',
        severity: 'medium',
        title: `${material.name} 尚未进入审查通过状态`,
        detail: '当前物料还没有进入已通过状态，不能视为待审物料已归档。',
        evidence: `materialProduction.materials.${material.id}.status`,
        fix: '在物料清单中推进状态，或让工作台整理审美修复建议后再批准。',
      }));
    }

    if (material.channel === 'print' && !String(material.bleed || '').includes('3')) {
      issues.push(issue({
        id: `print-bleed-${material.id}`,
        category: 'export',
        severity: 'high',
        title: `${material.name} 印刷出血设置不足`,
        detail: `当前出血为 ${material.bleed || '未设定'}。`,
        evidence: `materialProduction.materials.${material.id}.bleed`,
        fix: '为印刷物料设置 3mm 出血或供应商明确规格。',
      }));
    }

    if (material.channel === 'print' && !String(material.colorMode || '').toUpperCase().includes('CMYK')) {
      issues.push(issue({
        id: `print-color-${material.id}`,
        category: 'export',
        severity: 'high',
        title: `${material.name} 色彩模式不是 CMYK`,
        detail: `当前色彩模式为 ${material.colorMode || '未设定'}。`,
        evidence: `materialProduction.materials.${material.id}.colorMode`,
        fix: '印刷交付前转换为 CMYK 或记录 Pantone/供应商规格。',
      }));
    }

    if (!material.exportTargets?.length) {
      issues.push(issue({
        id: `export-target-${material.id}`,
        category: 'export',
        severity: 'high',
        title: `${material.name} 缺少导出目标`,
        detail: '没有明确 PDF/SVG/PNG/JPG 等交付格式。',
        evidence: `materialProduction.materials.${material.id}.exportTargets`,
        fix: '补齐每个物料的导出格式与目标路径。',
      }));
    }

    if (material.exportTargets?.length && !hasVectorExportTarget(material)) {
      issues.push(issue({
        id: `vector-export-target-${material.id}`,
        category: 'export',
        severity: 'high',
        title: `${material.name} 缺少可编辑矢量交付目标`,
        detail: `当前导出目标为 ${material.exportTargets.join('、')}，不能只交付位图预览。`,
        evidence: `materialProduction.materials.${material.id}.exportTargets`,
        fix: '加入 Editable SVG、AI、EPS 或其他可编辑源文件目标。',
      }));
    }
  });

  if (!hasDocument(project, 'materialSpec')) {
    issues.push(issue({
      id: 'material-spec-missing',
      category: 'export',
      severity: 'high',
      title: '缺少 VI 物料生产规格',
      detail: '审查需要可追溯的尺寸、导出目标、品牌资产引用和状态记录。',
      evidence: 'documents.materialSpec',
      fix: '通过物料清单整理或刷新物料规格文档。',
    }));
  }

  if (!project?.brandKit?.typography?.license && !project?.documents?.fontLicense && !project?.documents?.audit?.metadata?.fontLicense) {
    issues.push(issue({
      id: 'font-license',
      category: 'compliance',
      severity: 'medium',
      title: '字体授权未记录',
      detail: '当前项目有品牌字体规范，但没有授权来源、授权范围或替代字体说明。',
      evidence: 'brandKit.typography',
      fix: '记录商用授权、开源许可或替代字体策略。',
    }));
  }

  if (assets.some((assetItem) => assetItem.source === 'ai-generated' && assetItem.status === 'adopted')) {
    issues.push(issue({
      id: 'ai-generated-assets',
      category: 'compliance',
      severity: 'medium',
      title: '存在已采纳概念图',
      detail: '概念图可作为方向或 mockup，但最终生产应转成确定性源资产并记录授权/来源。',
      evidence: 'assets.*.source',
      fix: '将核心视觉转为矢量/源文件，或在审查报告中标注使用边界。',
    }));
  }

  const sortedIssues = issues.sort((a, b) => getSeverityRank(b.severity) - getSeverityRank(a.severity));
  const criticalCount = sortedIssues.filter((item) => item.severity === 'critical').length;
  const highCount = sortedIssues.filter((item) => item.severity === 'high').length;
  const passed = criticalCount === 0 && highCount === 0;
  const readiness = Math.max(0, 100 - criticalCount * 35 - highCount * 18 - sortedIssues.filter((item) => item.severity === 'medium').length * 8);

  return {
    schemaVersion: PREFLIGHT_REVIEW_SCHEMA_VERSION,
    projectId: project?.id || null,
    status: passed ? 'pass' : criticalCount ? 'blocked' : 'needs-fix',
    passed,
    readiness,
    reviewedAt: project?.preflightReview?.reviewedAt || null,
    summary: buildIssueSummary(sortedIssues),
    issues: sortedIssues,
    checks: {
      manifestLocked: manifest.locked,
      materialPlanReady: materialPlan.blockers.length === 0 && materialPlan.materials.length > 0,
      approvedMaterials: materialPlan.materials.filter((material) => ['approved', 'exported'].includes(material.status)).length,
      totalMaterials: materialPlan.materials.length,
      materialSpec: hasDocument(project, 'materialSpec'),
      sourceArtwork: materialPlan.materials.filter((material) => hasMaterialArtwork(material)).length,
      sourceQaPassed: materialPlan.evaluations.filter((evaluation) => evaluation.artworkAudit?.passed).length,
      fontLicense: Boolean(project?.brandKit?.typography?.license || project?.documents?.fontLicense || project?.documents?.audit?.metadata?.fontLicense),
    },
  };
}

export function createPreflightAuditDocument(project) {
  const review = buildPreflightReview(project);
  const lines = [
    '# 商用化 Preflight 审查报告',
    '',
    `- Schema: ${PREFLIGHT_REVIEW_SCHEMA_VERSION}`,
    `- Status: ${review.status}`,
    `- Readiness: ${review.readiness}%`,
    `- Passed: ${review.passed ? 'yes' : 'no'}`,
    '',
    '## Summary',
    `- Critical: ${review.summary.critical || 0}`,
    `- High: ${review.summary.high || 0}`,
    `- Medium: ${review.summary.medium || 0}`,
    `- Low: ${review.summary.low || 0}`,
    '',
    '## Issues',
  ];

  if (!review.issues.length) {
    lines.push('- 无阻断项。');
  }

  review.issues.forEach((item) => {
    lines.push(`- [${item.severity}] ${item.title}`);
    lines.push(`  - category: ${item.category}`);
    lines.push(`  - evidence: ${item.evidence}`);
    lines.push(`  - fix: ${item.fix}`);
  });

  return {
    title: '商用化 Preflight 审查报告',
    content: lines.join('\n'),
    phase: 5,
    adoptedAt: now(),
    source: 'preflight-review',
    status: review.passed ? 'locked' : 'needs-fix',
    metadata: {
      schemaVersion: PREFLIGHT_REVIEW_SCHEMA_VERSION,
      readiness: review.readiness,
      passed: review.passed,
      issueSummary: review.summary,
      fontLicense: review.checks.fontLicense,
    },
  };
}

export function runPreflightReview(project) {
  const review = buildPreflightReview(project);
  return {
    ...project,
    preflightReview: {
      ...review,
      reviewedAt: now(),
    },
    documents: {
      ...(project.documents || {}),
      audit: createPreflightAuditDocument(project),
    },
    updatedAt: now(),
  };
}
