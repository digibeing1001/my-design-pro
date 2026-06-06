import { buildBrandAssetManifest } from './brandAssetManifest';
import { buildMaterialProductionPlan, MATERIAL_TEMPLATES } from './materialProduction';

export const DESIGN_BRIEF_CONTRACT_SCHEMA_VERSION = 'gdpro.design-brief-contract.v1';

const TARGET_MATERIAL_KEYWORDS = [
  { templateId: 'business-card', keywords: ['名片', 'business card', 'card'] },
  { templateId: 'poster-a3', keywords: ['海报', 'poster', 'campaign'] },
  { templateId: 'social-square', keywords: ['社媒', '社交', '小红书', 'instagram', 'social'] },
  { templateId: 'package-label', keywords: ['包装', '标签', 'package', 'label'] },
  { templateId: 'store-signage', keywords: ['招牌', '门店', '店招', 'signage', 'storefront'] },
];

function now() {
  return Date.now();
}

function getDocument(project, key) {
  const doc = project?.documents?.[key];
  if (!doc) return null;
  if (typeof doc === 'string') return { title: key, content: doc };
  return doc;
}

function getDocumentText(project, key) {
  const doc = getDocument(project, key);
  return [doc?.title, doc?.content].filter(Boolean).join('\n');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function shortHash(value) {
  let hash = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function contractCheck({
  id,
  label,
  passed,
  required = true,
  severity = 'high',
  evidence = '',
  detail = '',
  value = '',
}) {
  return {
    id,
    label,
    passed: Boolean(passed),
    required,
    severity,
    evidence,
    detail,
    value,
  };
}

function inferMaterialTargets(project, materialPlan) {
  const source = [
    getDocumentText(project, 'brief'),
    getDocumentText(project, 'philosophy'),
    normalizeText(project?.brandKit?.slogan),
    normalizeText(project?.brandKit?.philosophy),
  ].join('\n').toLowerCase();
  const detected = TARGET_MATERIAL_KEYWORDS
    .filter((entry) => entry.keywords.some((keyword) => source.includes(keyword.toLowerCase())))
    .map((entry) => entry.templateId);
  const planned = (materialPlan?.materials || []).map((material) => material.templateId).filter(Boolean);
  const unique = detected.length ? [...new Set(detected)] : [...new Set(planned)];

  return unique.map((templateId) => {
    const template = MATERIAL_TEMPLATES.find((item) => item.id === templateId);
    const material = (materialPlan?.materials || []).find((item) => item.templateId === templateId);
    return {
      templateId,
      name: template?.name || material?.name || templateId,
      source: detected.includes(templateId) ? 'brief' : 'materialProduction',
      present: Boolean(material),
      materialId: material?.id || null,
    };
  });
}

function buildSourceRevision(project, checks, targets) {
  const parts = [
    project?.id || '',
    project?.brandName || project?.name || '',
    getDocumentText(project, 'brief'),
    getDocumentText(project, 'philosophy'),
    normalizeText(project?.brandKit?.philosophy),
    JSON.stringify(project?.brandKit?.colors || []),
    JSON.stringify(project?.brandKit?.typography || {}),
    checks
      .filter((item) => item.id !== 'target-coverage')
      .map((item) => `${item.id}:${item.value || item.passed}`)
      .join('|'),
    targets.map((item) => `${item.templateId}:${item.source}`).join('|'),
  ];
  return shortHash(parts.join('\n'));
}

function getStoredContract(project) {
  return project?.control?.designBriefContract || project?.designBriefContract || null;
}

function buildPromptRules(project, targets) {
  const brandName = project?.brandName || project?.name || 'the brand';
  const targetNames = targets.map((item) => item.name).join(', ') || 'the current phase deliverables';
  return [
    `Treat ${brandName} as the locked client identity unless the GUI changes the project name.`,
    'Use the brief, design philosophy, color tokens, typography tokens, and adopted logo as the non-negotiable design source.',
    'Do not invent new logos, palettes, fonts, slogans, or material formats when contract evidence is missing; request the missing evidence or return a GUI operation.',
    `Optimize outputs for ${targetNames}; every produced material must cite Manifest refs after Phase 3.`,
    'Use concept image generation only for exploration or mockups; final repeated VI assets must be deterministic source artwork with Source QA.',
  ];
}

export function buildDesignBriefContract(project, { manifest = null, materialPlan = null } = {}) {
  const resolvedManifest = manifest || buildBrandAssetManifest(project);
  const resolvedMaterialPlan = materialPlan || buildMaterialProductionPlan(project);
  const brandName = normalizeText(project?.brandName || project?.name);
  const brief = getDocument(project, 'brief');
  const philosophyText = normalizeText(project?.brandKit?.philosophy || getDocumentText(project, 'philosophy'));
  const colors = Array.isArray(project?.brandKit?.colors) ? project.brandKit.colors : [];
  const typography = project?.brandKit?.typography || {};
  const hasDisplayFont = Boolean(typography.display);
  const hasBodyFont = Boolean(typography.body);
  const logoItem = (resolvedManifest.items || []).find((item) => item.role === 'primary-logo');
  const targets = inferMaterialTargets(project, resolvedMaterialPlan);
  const missingTargets = targets.filter((item) => !item.present);

  const checks = [
    contractCheck({
      id: 'brand-identity',
      label: '品牌名称已明确',
      passed: Boolean(brandName),
      severity: 'critical',
      evidence: 'project.brandName',
      detail: '客户或品牌名称是所有 VI 判断的根身份。',
      value: brandName,
    }),
    contractCheck({
      id: 'brief',
      label: '客户需求已记录',
      passed: Boolean(brief?.content || brief?.title),
      severity: 'critical',
      evidence: 'documents.brief',
      detail: '解读设计方向前，工作台需要一份书面需求。',
      value: brief?.title || '',
    }),
    contractCheck({
      id: 'design-philosophy',
      label: '设计哲学已记录',
      passed: Boolean(philosophyText),
      severity: 'high',
      evidence: 'brandKit.philosophy / documents.philosophy',
      detail: '视觉系统需要一条稳定的策略句或设计哲学文档。',
      value: philosophyText.slice(0, 120),
    }),
    contractCheck({
      id: 'color-system',
      label: '品牌色可用',
      passed: colors.length > 0,
      severity: 'high',
      evidence: 'brandKit.colors',
      detail: '最终 VI 物料必须复用明确品牌色，不能让模型临场发明颜色。',
      value: colors.map((color) => color.hex || color.name).filter(Boolean).join(', '),
    }),
    contractCheck({
      id: 'typography-system',
      label: '品牌字体可用',
      passed: hasDisplayFont && hasBodyFont,
      severity: 'high',
      evidence: 'brandKit.typography',
      detail: '扩展商用物料前，标题和正文字体必须明确。',
      value: [typography.display, typography.body].filter(Boolean).join(' / '),
    }),
    contractCheck({
      id: 'logo-source',
      label: '主 Logo 源稿已选定',
      passed: Boolean(logoItem),
      severity: 'critical',
      evidence: 'assets.logo / assetManifest.items',
      detail: '工作台必须复用已采纳主 Logo，不能每个物料重新绘制。',
      value: logoItem?.name || logoItem?.assetId || '',
    }),
    contractCheck({
      id: 'material-targets',
      label: '需求目标物料已识别',
      passed: targets.length > 0,
      required: false,
      severity: 'medium',
      evidence: 'documents.brief / materialProduction.materials',
      detail: '约定书需要知道本项目要优化哪些商用物料。',
      value: targets.map((item) => item.name).join(', '),
    }),
    contractCheck({
      id: 'target-coverage',
      label: '目标物料已有生产单',
      passed: targets.length === 0 || missingTargets.length === 0,
      required: false,
      severity: 'medium',
      evidence: 'materialProduction.materials',
      detail: missingTargets.length
        ? `缺少生产单：${missingTargets.map((item) => item.name).join('、')}。`
        : '已识别的目标物料都有生产单。',
      value: `${targets.length - missingTargets.length}/${targets.length || 0}`,
    }),
  ];

  const requiredChecks = checks.filter((item) => item.required);
  const passedRequired = requiredChecks.filter((item) => item.passed).length;
  const readiness = requiredChecks.length ? Math.round((passedRequired / requiredChecks.length) * 100) : 0;
  const sourceRevision = buildSourceRevision(project, checks, targets);
  const stored = getStoredContract(project);
  const locked = Boolean(stored?.lockedAt && stored?.sourceRevision === sourceRevision);
  const stale = Boolean(stored?.lockedAt && stored?.sourceRevision !== sourceRevision);
  const violations = checks
    .filter((item) => item.required && !item.passed)
    .map((item) => ({
      id: item.id,
      severity: item.severity,
      title: item.label,
      detail: item.detail,
      evidence: item.evidence,
      fix: item.id === 'target-coverage'
        ? '添加缺失的物料生产单，或澄清需求中的目标物料。'
        : '在界面中补齐缺失的需求或品牌证据，然后锁定约定书。',
    }));
  const blocked = violations.some((item) => ['critical', 'high'].includes(item.severity));
  const status = locked
    ? 'locked'
    : stale
      ? 'stale'
      : blocked
        ? 'blocked'
        : 'ready-to-compile';

  return {
    schemaVersion: DESIGN_BRIEF_CONTRACT_SCHEMA_VERSION,
    projectId: project?.id || null,
    status,
    locked,
    stale,
    lockedAt: stored?.lockedAt || null,
    lockedBy: stored?.lockedBy || null,
    sourceRevision,
    readiness,
    passed: !blocked && locked,
    checks,
    violations,
    targets,
    missingTargets,
    promptRules: buildPromptRules(project, targets),
    stats: {
      required: requiredChecks.length,
      passedRequired,
      targets: targets.length,
      missingTargets: missingTargets.length,
      critical: violations.filter((item) => item.severity === 'critical').length,
      high: violations.filter((item) => item.severity === 'high').length,
      medium: violations.filter((item) => item.severity === 'medium').length,
    },
  };
}

export function createLockedDesignBriefContract(project, { lockedBy = 'gui' } = {}) {
  const contract = buildDesignBriefContract(project);
  return {
    ...contract,
    status: contract.violations.some((item) => ['critical', 'high'].includes(item.severity))
      ? 'blocked'
      : 'locked',
    locked: !contract.violations.some((item) => ['critical', 'high'].includes(item.severity)),
    lockedAt: !contract.violations.some((item) => ['critical', 'high'].includes(item.severity)) ? now() : null,
    lockedBy: !contract.violations.some((item) => ['critical', 'high'].includes(item.severity)) ? lockedBy : null,
  };
}

export function compileDesignBriefContract(project, { lockedBy = 'gui' } = {}) {
  const contract = createLockedDesignBriefContract(project, { lockedBy });
  return {
    ...project,
    control: {
      ...(project?.control || {}),
      designBriefContract: contract,
      lastAction: 'compile_design_brief_contract',
      lastUpdatedAt: now(),
      events: [
        {
          id: `evt_${now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: now(),
          source: 'design-brief-contract',
          type: contract.locked ? 'contract-compiled' : 'contract-blocked',
          label: contract.locked ? '需求约定书已锁定' : '需求约定书存在阻断',
          detail: contract.locked
            ? `完整度 ${contract.readiness}%，包含 ${contract.targets.length} 个目标物料。`
            : contract.violations.map((item) => item.title).join(', '),
        },
        ...((project?.control || {}).events || []),
      ].slice(0, 40),
    },
    documents: {
      ...(project?.documents || {}),
      briefContract: createDesignBriefContractDocument(project, { contract }),
    },
    updatedAt: now(),
  };
}

export function createDesignBriefContractDocument(project, options = {}) {
  const contract = options.contract || buildDesignBriefContract(project, options);
  const lines = [
    '# 需求约定书',
    '',
    `- Schema: ${DESIGN_BRIEF_CONTRACT_SCHEMA_VERSION}`,
    `- 状态: ${contract.status}`,
    `- 完整度: ${contract.readiness}%`,
    `- 是否锁定: ${contract.locked ? '是' : '否'}`,
    `- 源版本: ${contract.sourceRevision}`,
    '',
    '## 约定检查',
  ];

  contract.checks.forEach((item) => {
    lines.push(`- [${item.passed ? '通过' : '阻断'}] ${item.label}`);
    lines.push(`  - 依据: ${item.evidence}`);
    if (item.value) lines.push(`  - 值: ${item.value}`);
    if (!item.passed) lines.push(`  - 说明: ${item.detail}`);
  });

  lines.push('', '## 目标物料');
  if (!contract.targets.length) {
    lines.push('- 暂未识别明确目标物料。');
  }
  contract.targets.forEach((target) => {
    lines.push(`- [${target.present ? '已规划' : '缺失'}] ${target.name} (${target.templateId})`);
  });

  lines.push('', '## 创作约束');
  contract.promptRules.forEach((rule) => {
    lines.push(`- ${rule}`);
  });

  if (contract.violations.length) {
    lines.push('', '## 阻断项');
    contract.violations.forEach((item) => {
      lines.push(`- [${item.severity}] ${item.title}: ${item.fix}`);
    });
  }

  return {
    title: '需求约定书',
    content: lines.join('\n'),
    phase: 2,
    adoptedAt: now(),
    source: 'design-brief-contract',
    status: contract.locked ? 'locked' : 'needs-fix',
    metadata: {
      schemaVersion: DESIGN_BRIEF_CONTRACT_SCHEMA_VERSION,
      status: contract.status,
      readiness: contract.readiness,
      locked: contract.locked,
      sourceRevision: contract.sourceRevision,
      stats: contract.stats,
    },
  };
}
