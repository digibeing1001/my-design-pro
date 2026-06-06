import { PHASE_CONFIG } from './phaseGuard';
import { buildBrandAssetManifest } from './brandAssetManifest';
import { buildMaterialProductionPlan } from './materialProduction';
import { buildPreflightReview } from './preflightReview';
import { buildDeliveryPackage } from './deliveryPackage';
import { buildReviewBoard } from './reviewBoard';
import { buildDesignScorecard } from './designScorecard';
import { buildDesignBriefContract } from './designBriefContract';

export const PHASE_STATE_SCHEMA_VERSION = 'gdpro.phase-state.v1';

export const OUTPUT_PATHS = {
  strategy: {
    id: 'strategy',
    label: '策略澄清',
    description: '只做调研、访谈、品牌定义和设计哲学，不制作最终视觉。',
  },
  concept: {
    id: 'concept',
    label: '概念探索',
    description: '可用图像服务探索方向，但输出必须经过人工选择和品牌锁定。',
  },
  production: {
    id: 'production',
    label: '确定性生产',
    description: '使用可编辑矢量源稿、画布和源文件路径制作可复用资产，避免跨图漂移。',
  },
  review: {
    id: 'review',
    label: '审查交付',
    description: '冻结创作，优先做合规、审美、一致性和交付检查。',
  },
};

export function normalizePhase(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const phase = Math.trunc(n);
  return phase >= 1 && phase <= 6 ? phase : fallback;
}

export function getProjectAssets(project) {
  return Object.values(project?.assets || {}).flat();
}

function adoptedAssets(project) {
  return getProjectAssets(project).filter((asset) => asset.status === 'adopted');
}

function hasDocument(project, key) {
  return Boolean(project?.documents?.[key]?.content || project?.documents?.[key]);
}

function getLogoAsset(project) {
  return adoptedAssets(project).find((asset) => asset.category === 'logo');
}

export function getOutputPathForPhase(phase) {
  const p = normalizePhase(phase);
  if (p <= 2) return OUTPUT_PATHS.strategy;
  if (p === 3) return OUTPUT_PATHS.concept;
  if (p === 4) return OUTPUT_PATHS.production;
  return OUTPUT_PATHS.review;
}

export const LOCK_DEFINITIONS = [
  {
    id: 'brand-name',
    label: '品牌名称',
    phase: 1,
    source: 'project.brandName',
    getLocked: (project) => Boolean(project?.brandName),
    getValue: (project) => project?.brandName || '未锁定',
  },
  {
    id: 'brief',
    label: '需求档案',
    phase: 1,
    source: 'documents.brief',
    getLocked: (project) => hasDocument(project, 'brief'),
    getValue: (project) => project?.documents?.brief?.title || '品牌档案',
  },
  {
    id: 'philosophy',
    label: '设计哲学',
    phase: 2,
    source: 'documents.philosophy',
    getLocked: (project) => Boolean(hasDocument(project, 'philosophy') || project?.brandKit?.philosophy),
    getValue: (project) => project?.brandKit?.philosophy || project?.documents?.philosophy?.title || '未锁定',
  },
  {
    id: 'palette',
    label: '品牌色',
    phase: 2,
    source: 'brandKit.colors',
    getLocked: (project) => Boolean(project?.brandKit?.colors?.length),
    getValue: (project) => (project?.brandKit?.colors || []).map((c) => c.hex).join(' / ') || '未锁定',
  },
  {
    id: 'typography',
    label: '字体系统',
    phase: 2,
    source: 'brandKit.typography',
    getLocked: (project) => Boolean(project?.brandKit?.typography?.display || project?.brandKit?.typography?.body),
    getValue: (project) => {
      const typo = project?.brandKit?.typography || {};
      return [typo.display, typo.body].filter(Boolean).join(' / ') || '未锁定';
    },
  },
  {
    id: 'logo',
    label: 'Logo 主资产',
    phase: 3,
    source: 'assets.logo',
    getLocked: (project) => Boolean(getLogoAsset(project)),
    getValue: (project) => getLogoAsset(project)?.name || '未采纳',
  },
  {
    id: 'asset-manifest',
    label: '品牌资产清单',
    phase: 3,
    source: 'assetManifest',
    getLocked: (project) => buildBrandAssetManifest(project).locked,
    getValue: (project) => {
      const manifest = buildBrandAssetManifest(project);
      if (manifest.locked) return `已锁定 ${manifest.items.length} 项`;
      if (manifest.stale) return '已过期，需重新锁定';
      return `${manifest.readyItemCount}/${manifest.requiredItemCount} 项可锁定`;
    },
  },
  {
    id: 'reuse-assets',
    label: '复用素材',
    phase: 4,
    source: 'assets.*',
    getLocked: (project) => adoptedAssets(project).length >= 3,
    getValue: (project) => `${adoptedAssets(project).length} 个已采纳资产`,
  },
  {
    id: 'review-report',
    label: '审查报告',
    phase: 5,
    source: 'documents.audit',
    getLocked: (project) => Boolean(hasDocument(project, 'audit') || getProjectAssets(project).some((asset) => asset.category === 'report')),
    getValue: (project) => project?.documents?.audit?.title || '未完成',
  },
  {
    id: 'delivery-package',
    label: '交付包',
    phase: 6,
    source: 'deliveryPackage',
    getLocked: (project) => buildDeliveryPackage(project).ready,
    getValue: (project) => {
      const deliveryPackage = buildDeliveryPackage(project);
      return deliveryPackage.ready
        ? `${deliveryPackage.stats.readyEntries}/${deliveryPackage.stats.entries} 项就绪`
        : `${deliveryPackage.blockers.length} 项需处理`;
    },
  },
];

function task(id, text, done = false) {
  return { id, text, done };
}

export const PHASE_WORKLIST = {
  1: {
    title: 'Phase 1 · 需求追问',
    description: '明确设计需求、品牌信息、目标受众',
    objective: '把模糊需求整理成可追溯的品牌档案，并锁定品牌基本事实。',
    outputKeys: ['documents.brief'],
    tasks: [
      task('p1-describe-need', '在设计工作台中描述需求'),
      task('p1-upload-reference', '上传参考图/Logo 等素材'),
      task('p1-confirm-brand', '确认品牌名称和基本方向'),
      task('p1-clarity-loop', '需求澄清：重述表面需求、识别模糊词、区分目标与手段、暴露假设'),
      task('p1-score-clarity', '需求精确度评分（1-3分）'),
      task('p1-create-profile', '创建品牌档案（基础信息）'),
      task('p1-asset-precheck', '资产预检查（R15）：追问 Logo/产品图/UI/色值/字体清单'),
      task('p1-ingest-assets', '用户资产入库（保存到项目素材库）'),
    ],
  },
  2: {
    title: 'Phase 2 · 竞品分析 + 设计哲学',
    description: '竞品视觉分析 + 品牌战略 + 设计哲学创建',
    objective: '形成可落地的视觉 DNA，锁定色彩、字体、品牌叙事和禁忌。',
    outputKeys: ['documents.philosophy', 'brandKit.colors', 'brandKit.typography'],
    tasks: [
      task('p2-read-assets', '查看已上传的竞品参考资料', true),
      task('p2-confirm-direction', '确认设计方向', true),
      task('p2-competitor-analysis', '竞品视觉分析（品牌定位/视觉策略/差异化机会）'),
      task('p2-brand-strategy', '品牌战略定义'),
      task('p2-design-philosophy', '设计哲学创建（哲学名 + 阐述 + 视觉 DNA）'),
      task('p2-moodboard', 'Moodboard 制作（色彩/字体/构图/质感参考）'),
      task('p2-positioning-questions', '位置四问（叙事角色/观众距离/视觉温度/容量估算）'),
      task('p2-profile-layer2', '完善品牌档案（口号/色值/字体/设计哲学）'),
      task('p2-color-system', '色彩系统整理（色阶/渐变+WCAG）'),
    ],
  },
  3: {
    title: 'Phase 3 · 样稿方向',
    description: 'Logo + 样稿 + 辅助图形',
    objective: '探索方向后沉淀为可复用 Logo 主资产和辅助图形资产。',
    outputKeys: ['assets.logo', 'assets.draft', 'assetManifest', 'documents.critique'],
    tasks: [
      task('p3-image-explore', '使用概念图面板创建设计方向', true),
      task('p3-critique-draft', '在对话中评审样稿', true),
      task('p3-adopt-or-reject', '采纳/拒绝资产', true),
      task('p3-logo-vector', 'Logo 设计（矢量绘制 + 品牌规范检查）'),
      task('p3-aux-graphics', '辅助图形/纹理系统创建'),
      task('p3-brand-drafts', '品牌样稿创建（多场景应用）'),
      task('p3-design-critique', '设计评审：多维度评分'),
      task('p3-consistency-selfcheck', '品牌一致性自检（R1-R14）'),
      task('p3-core-asset-cache', '核心资产预渲染（Logo/辅助图形进入素材库）'),
      task('p3-lock-manifest', '锁定品牌资产清单（Logo/色彩/字体/设计哲学）'),
      task('p3-profile-layer3', '完善品牌档案（Logo 变体/辅助图形策略）'),
    ],
  },
  4: {
    title: 'Phase 4 · 物料扩展',
    description: '全套 VI 物料扩展',
    objective: '基于锁定资产批量扩展物料，所有跨物料元素必须复用同一套品牌规则和源资产。',
    outputKeys: ['assetManifest', 'materialProduction', 'documents.materialSpec', 'assets.deliverable'],
    tasks: [
      task('p4-read-adopted-assets', '查看已采纳资产', true),
      task('p4-upload-material-inputs', '上传新物料素材', true),
      task('p4-material-list', 'VI 物料清单确认（100+ 物料选择）'),
      task('p4-material-plan', '创建物料生产单（每项记录尺寸、渠道、品牌资产引用和导出目标）'),
      task('p4-deterministic-layout', '各物料精确排版（画布/矢量源稿）'),
      task('p4-kit-generation', '品牌套件批量制作'),
      task('p4-cross-material-check', '跨物料一致性检查（素材复用）'),
      task('p4-vector-output', '矢量化输出'),
      task('p4-layered-output', 'PSD 分层输出'),
      task('p4-mockup-output', 'Mockup 效果图制作（3D 软件/PSD 样机）'),
    ],
  },
  5: {
    title: 'Phase 5 · 合规审查',
    description: '合规审查 + 审美自检',
    objective: '冻结创作，审查版权、合规、审美质量和跨资产一致性。',
    outputKeys: ['preflightReview', 'documents.audit'],
    tasks: [
      task('p5-read-project-state', '查看项目资产和文档', true),
      task('p5-industry-compliance', '14 行业合规扫描（商标法/广告法/食品标签/3C 等）'),
      task('p5-auto-compliance', '合规自动检测'),
      task('p5-font-license', '字体版权审查'),
      task('p5-aesthetic-review', '审美自检（格式塔/色彩/排版/网格）'),
      task('p5-preflight-review', '运行交付前审查（品牌资产/物料/授权/导出规格）'),
      task('p5-audit-report', '输出合规审查报告'),
    ],
  },
  6: {
    title: 'Phase 6 · 落地交付',
    description: '印刷前检查 + 数字检查 + VI 规范手册',
    objective: '归档源文件、成品文件、VI 手册和维护说明，形成可交付包。',
    outputKeys: ['deliveryPackage', 'documents.deliveryManifest', 'documents.handoff', 'documents.viManual', 'assets.deliverable'],
    tasks: [
      task('p6-export-project-data', '导出 .gdpro 项目数据', true),
      task('p6-download-assets', '下载资产文件', true),
      task('p6-print-preflight', '印刷前检查（出血/色彩模式/分辨率/刀模）'),
      task('p6-digital-check', '数字检查（多设备适配/加载速度/交互）'),
      task('p6-vi-manual', 'VI 规范手册制作'),
      task('p6-maintenance-guide', '品牌维护指南'),
      task('p6-delivery-manifest', '交付物清单 + 文件路径归档'),
    ],
  },
};

function buildFacts(project) {
  const assets = getProjectAssets(project);
  const adopted = assets.filter((asset) => asset.status === 'adopted');
  const colors = project?.brandKit?.colors || [];
  const typography = project?.brandKit?.typography || {};
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
  const reviewBoard = buildReviewBoard(project, { deliveryPackage, designScorecard });
  const hasColorTokens = colors.length > 0;
  const hasTypographyTokens = Boolean(typography.display || typography.body);

  return {
    assets,
    adopted,
    adoptedCount: adopted.length,
    manifest,
    materialPlan,
    designBriefContract,
    preflightReview,
    deliveryPackage,
    designScorecard,
    reviewBoard,
    hasProductionManifest: manifest.productionReady,
    hasLockedManifest: manifest.locked && manifest.productionReady,
    hasMaterialPlan: materialPlan.materials.length > 0,
    hasReadyMaterialPlan: materialPlan.materials.length > 0 && materialPlan.blockers.length === 0,
    hasPreflightReview: Boolean(project?.preflightReview?.reviewedAt || hasDocument(project, 'audit')),
    hasPassedPreflight: preflightReview.passed,
    hasBrandName: Boolean(project?.brandName),
    hasBrief: hasDocument(project, 'brief'),
    hasReferences: assets.some((asset) => asset.category === 'reference') || assets.length > 0,
    hasPhilosophy: Boolean(hasDocument(project, 'philosophy') || project?.brandKit?.philosophy),
    hasColorTokens,
    hasTypographyTokens,
    hasBrandTokens: hasColorTokens && hasTypographyTokens,
    hasLockedDesignBriefContract: designBriefContract.locked && !designBriefContract.stale,
    hasLogo: adopted.some((asset) => asset.category === 'logo'),
    hasDraft: adopted.some((asset) => ['draft', 'deliverable'].includes(asset.category)),
    hasMaterialSpec: hasDocument(project, 'materialSpec') || materialPlan.materials.length > 0,
    hasAudit: Boolean(hasDocument(project, 'audit') || assets.some((asset) => asset.category === 'report')),
    hasFontLicense: Boolean(project?.documents?.audit?.metadata?.fontLicense || project?.documents?.fontLicense),
    hasDeliverables: assets.some((asset) => asset.category === 'deliverable' && asset.status === 'adopted'),
    hasHandoff: hasDocument(project, 'handoff'),
    hasViManual: hasDocument(project, 'viManual'),
    hasDeliveryManifest: hasDocument(project, 'deliveryManifest'),
    hasDeliveryPackage: Boolean(project?.deliveryPackage?.builtAt || hasDocument(project, 'deliveryManifest')),
    hasReadyDeliveryPackage: deliveryPackage.ready,
    hasPassingDesignScorecard: designScorecard.passed,
    hasSignedReviewBoard: reviewBoard.signed,
  };
}

const GATE_DEFINITIONS = {
  1: [
    { id: 'brand-name', label: '品牌名称已锁定', blocker: true, evidence: 'project.brandName', test: (f) => f.hasBrandName },
    { id: 'brief', label: '需求档案已形成', blocker: true, evidence: 'documents.brief', test: (f) => f.hasBrief },
    { id: 'asset-inventory', label: '用户素材已登记', blocker: false, evidence: 'assets.reference', test: (f) => f.hasReferences },
    { id: 'clarity-score', label: '需求精确度达到可执行', blocker: true, evidence: 'documents.brief', test: (f) => f.hasBrief },
  ],
  2: [
    { id: 'brief-read', label: '已读取 Phase 1 锁定项', blocker: true, evidence: 'documents.brief', test: (f) => f.hasBrief },
    { id: 'philosophy', label: '设计哲学已确认', blocker: true, evidence: 'documents.philosophy', test: (f) => f.hasPhilosophy },
    { id: 'palette', label: '品牌色规范已锁定', blocker: true, evidence: 'brandKit.colors', test: (f) => f.hasColorTokens },
    { id: 'typography', label: '字体规范已锁定', blocker: true, evidence: 'brandKit.typography', test: (f) => f.hasTypographyTokens },
  ],
  3: [
    { id: 'philosophy-read', label: '样稿依据 Phase 2 设计哲学', blocker: true, evidence: 'documents.philosophy', test: (f) => f.hasPhilosophy },
    { id: 'token-read', label: '样稿读取色彩和字体规范', blocker: true, evidence: 'brandKit.*', test: (f) => f.hasBrandTokens },
    { id: 'logo-locked', label: '核心 Logo 主资产已采纳', blocker: true, evidence: 'assets.logo', test: (f) => f.hasLogo },
    { id: 'brief-contract', label: '需求约定书已锁定', blocker: true, evidence: 'control.designBriefContract', test: (f) => f.hasLockedDesignBriefContract },
    { id: 'asset-manifest', label: '品牌资产清单已锁定', blocker: true, evidence: 'assetManifest.lockedAt', test: (f) => f.hasLockedManifest },
    { id: 'draft-reviewable', label: '样稿已有可评审资产', blocker: false, evidence: 'assets.draft', test: (f) => f.hasLogo || f.hasDraft },
    { id: 'ai-boundary', label: '概念图只用于方向探索，不直接作为最终跨物料源稿', blocker: true, evidence: 'control.policy', test: () => true },
  ],
  4: [
    { id: 'logo-locked', label: '核心 Logo 已采纳', blocker: true, evidence: 'assets.logo', test: (f) => f.hasLogo },
    { id: 'manifest-reuse', label: '跨物料元素使用已锁定品牌资产', blocker: true, evidence: 'assetManifest', test: (f) => f.hasLockedManifest },
    { id: 'material-plan', label: '物料生产单已创建且引用完整', blocker: true, evidence: 'materialProduction.materials', test: (f) => f.hasReadyMaterialPlan },
    { id: 'reuse', label: '跨物料元素走复用资产', blocker: true, evidence: 'assets.*', test: (f) => f.adoptedCount >= 3 },
    { id: 'material-spec', label: '每个物料有尺寸/色彩/工艺规格', blocker: true, evidence: 'documents.materialSpec', test: (f) => f.hasMaterialSpec },
  ],
  5: [
    { id: 'assets-ready', label: '待审物料已归档', blocker: true, evidence: 'assets.*', test: (f) => f.adoptedCount > 0 },
    { id: 'material-plan-ready', label: '物料生产计划可审查', blocker: true, evidence: 'materialProduction', test: (f) => f.hasReadyMaterialPlan },
    { id: 'preflight', label: '交付前审查无高风险阻断', blocker: true, evidence: 'preflightReview', test: (f) => f.hasPassedPreflight },
    { id: 'audit', label: '合规与审美报告已输出', blocker: true, evidence: 'documents.audit', test: (f) => f.hasAudit && f.hasPreflightReview },
    { id: 'font-license', label: '字体/图片授权已记录', blocker: false, evidence: 'documents.audit.metadata.fontLicense', test: (f) => f.hasFontLicense || f.hasAudit },
  ],
  6: [
    { id: 'audit-pass', label: '审查问题已清零或标注风险', blocker: true, evidence: 'documents.audit', test: (f) => f.hasAudit && f.hasPassedPreflight },
    { id: 'vi-manual', label: 'VI 规范手册已完成', blocker: true, evidence: 'documents.viManual', test: (f) => f.hasViManual },
    { id: 'handoff', label: '落地维护说明已完成', blocker: true, evidence: 'documents.handoff', test: (f) => f.hasHandoff },
    { id: 'delivery-manifest', label: '交付物文件清单已归档', blocker: true, evidence: 'documents.deliveryManifest', test: (f) => f.hasDeliveryManifest },
    { id: 'delivery-package', label: '交付包所有必需项已就绪', blocker: true, evidence: 'deliveryPackage', test: (f) => f.hasReadyDeliveryPackage },
    { id: 'design-scorecard', label: '设计总监评分达到商用阈值', blocker: true, evidence: 'designScorecard.score', test: (f) => f.hasPassingDesignScorecard },
    { id: 'review-board', label: '评审板已完成签核', blocker: true, evidence: 'control.reviewDecisions', test: (f) => f.hasSignedReviewBoard },
  ],
};

export function buildLocks(project, throughPhase = project?.currentPhase || 1) {
  const phase = normalizePhase(throughPhase);
  return LOCK_DEFINITIONS.map((lock) => {
    const locked = lock.getLocked(project);
    return {
      id: lock.id,
      label: lock.label,
      phase: lock.phase,
      required: lock.phase <= phase,
      locked,
      value: lock.getValue(project),
      source: lock.source,
    };
  });
}

export function getRequiredLocks(phase) {
  const p = normalizePhase(phase);
  return LOCK_DEFINITIONS.filter((lock) => lock.phase <= p);
}

function getStoredPhaseTasks(project, phase) {
  const phaseState = project?.workflow?.phaseStates?.[phase];
  if (Array.isArray(phaseState?.tasks)) return phaseState.tasks;
  if (normalizePhase(project?.currentPhase) === phase && Array.isArray(project?.workflow?.tasks)) {
    return project.workflow.tasks;
  }
  return [];
}

export function getPhaseWorklist(phase) {
  return PHASE_WORKLIST[normalizePhase(phase)] || PHASE_WORKLIST[1];
}

export function mergePhaseTasks(existingTasks = [], defaultTasks = []) {
  const existingById = new Map();
  const existingByText = new Map();

  existingTasks.forEach((taskItem) => {
    if (!taskItem) return;
    if (taskItem.id) existingById.set(taskItem.id, taskItem);
    if (taskItem.text) existingByText.set(taskItem.text, taskItem);
  });

  const merged = defaultTasks.map((defaultTask) => {
    const existing = existingById.get(defaultTask.id) || existingByText.get(defaultTask.text);
    return {
      ...defaultTask,
      ...(existing || {}),
      id: defaultTask.id,
      text: defaultTask.text,
      done: Boolean(existing?.done ?? defaultTask.done),
    };
  });

  existingTasks.forEach((existing) => {
    if (!existing?.text) return;
    const alreadyMerged = merged.some((taskItem) => (
      taskItem.id === existing.id || taskItem.text === existing.text
    ));
    if (!alreadyMerged) {
      merged.push({
        id: existing.id || `custom_${merged.length + 1}`,
        text: existing.text,
        done: Boolean(existing.done),
        custom: true,
      });
    }
  });

  return merged;
}

function buildTaskProgress(tasks) {
  const total = tasks.length;
  const done = tasks.filter((taskItem) => taskItem.done).length;
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 100,
  };
}

export function evaluatePhaseGate(project, phaseValue = project?.currentPhase || 1) {
  const phase = normalizePhase(phaseValue);
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG[1];
  const worklist = getPhaseWorklist(phase);
  const facts = buildFacts(project);
  const locks = buildLocks(project, phase);
  const requiredLocks = locks.filter((lock) => lock.required);
  const missingLocks = requiredLocks.filter((lock) => !lock.locked);
  const tasks = mergePhaseTasks(getStoredPhaseTasks(project, phase), worklist.tasks);
  const gates = (GATE_DEFINITIONS[phase] || []).map((gate) => {
    const passed = Boolean(gate.test(facts, project));
    return {
      id: gate.id,
      label: gate.label,
      blocker: gate.blocker,
      passed,
      evidence: gate.evidence,
      phase,
    };
  });
  const blockingGates = gates.filter((gate) => gate.blocker && !gate.passed);
  const lockScore = requiredLocks.length
    ? requiredLocks.filter((lock) => lock.locked).length / requiredLocks.length
    : 1;
  const gateScore = gates.length
    ? gates.filter((gate) => gate.passed).length / gates.length
    : 1;
  const taskProgress = buildTaskProgress(tasks);
  const readiness = Math.round((lockScore * 0.45 + gateScore * 0.45 + (taskProgress.percent / 100) * 0.10) * 100);

  return {
    schemaVersion: PHASE_STATE_SCHEMA_VERSION,
    phase,
    name: cfg.name,
    description: cfg.description,
    objective: worklist.objective,
    outputKeys: worklist.outputKeys,
    outputPath: getOutputPathForPhase(phase),
    manifest: facts.manifest,
    materialPlan: facts.materialPlan,
    designBriefContract: facts.designBriefContract,
    preflightReview: facts.preflightReview,
    deliveryPackage: facts.deliveryPackage,
    designScorecard: facts.designScorecard,
    reviewBoard: facts.reviewBoard,
    allowedAssetCategories: cfg.allowedAssetCategories || [],
    canGenerateImage: Boolean(cfg.canGenerateImage),
    canAdoptAsset: Boolean(cfg.canAdoptAsset),
    locks,
    requiredLocks,
    missingLocks,
    gates,
    blockingGates,
    readyToAdvance: missingLocks.length === 0 && blockingGates.length === 0,
    readiness,
    tasks,
    taskProgress,
  };
}

export function evaluateAllPhaseGates(project) {
  return [1, 2, 3, 4, 5, 6].map((phase) => evaluatePhaseGate(project, phase));
}

export function resolvePhaseTransition(project, requestedPhaseValue, { action } = {}) {
  const currentPhase = normalizePhase(project?.currentPhase || 1);
  const requestedPhase = normalizePhase(requestedPhaseValue, currentPhase);

  if (requestedPhase === currentPhase) {
    return { allowed: false, noop: true, phase: currentPhase, reason: '阶段未变化' };
  }

  if (requestedPhase < currentPhase) {
    return {
      allowed: true,
      phase: requestedPhase,
      direction: 'backward',
      event: {
        type: 'phase-regress',
        label: `Phase moved back to ${requestedPhase}`,
        detail: '允许回退以补齐上游锁定项。',
      },
    };
  }

  if (requestedPhase > currentPhase + 1) {
    return {
      allowed: false,
      phase: currentPhase,
      requestedPhase,
      reason: '禁止跳过阶段',
      risk: {
        id: 'phase-skip-blocked',
        level: 'critical',
        title: '阶段跳转被阻断',
        detail: `请求从 Phase ${currentPhase} 跳到 Phase ${requestedPhase}，生产状态机只允许逐阶段推进。`,
        ruleRef: 'phase.transition.no-skip',
      },
      event: {
        type: 'phase-blocked',
        label: `Blocked Phase ${currentPhase} -> ${requestedPhase}`,
        detail: '禁止跳过阶段。',
      },
    };
  }

  const gate = evaluatePhaseGate(project, currentPhase);
  if (!gate.readyToAdvance) {
    const blockers = [
      ...gate.missingLocks.map((lock) => lock.label),
      ...gate.blockingGates.map((blockedGate) => blockedGate.label),
    ];
    return {
      allowed: false,
      phase: currentPhase,
      requestedPhase,
      reason: '当前阶段门禁未通过',
      gate,
      risk: {
        id: 'phase-gate-blocked',
        level: 'critical',
        title: '阶段推进被门禁阻断',
        detail: `Phase ${currentPhase} 尚未满足：${blockers.join('、') || '未知阻断项'}。`,
        ruleRef: 'phase.transition.gate',
      },
      event: {
        type: 'phase-blocked',
        label: `Blocked Phase ${currentPhase} -> ${requestedPhase}`,
        detail: blockers.join('、'),
      },
    };
  }

  return {
    allowed: true,
    phase: requestedPhase,
    direction: 'forward',
    action,
    event: {
      type: 'phase-advance',
      label: `Phase advanced to ${requestedPhase}`,
      detail: `Phase ${currentPhase} gates passed.`,
    },
  };
}

export function createWorkflowSeed(phaseValue = 1, workflow = {}) {
  const phase = normalizePhase(phaseValue);
  const phaseState = evaluatePhaseGate({ currentPhase: phase, workflow }, phase);
  return {
    mode: workflow.mode || 'medium',
    approvalPolicy: workflow.approvalPolicy || 'phase-gated',
    schemaVersion: PHASE_STATE_SCHEMA_VERSION,
    currentPhaseId: phase,
    outputPath: phaseState.outputPath.id,
    tasks: phaseState.tasks,
    phaseStates: {
      ...(workflow.phaseStates || {}),
      [phase]: {
        phase,
        name: phaseState.name,
        objective: phaseState.objective,
        outputPath: phaseState.outputPath.id,
        readiness: phaseState.readiness,
        readyToAdvance: phaseState.readyToAdvance,
        gates: phaseState.gates,
        tasks: phaseState.tasks,
        updatedAt: Date.now(),
      },
    },
  };
}

export function syncWorkflowWithPhase(project) {
  if (!project) return { workflow: {}, changed: false };

  const phase = normalizePhase(project.currentPhase || 1);
  const phaseState = evaluatePhaseGate(project, phase);
  const previousWorkflow = project.workflow || {};
  const nextWorkflow = {
    ...previousWorkflow,
    schemaVersion: PHASE_STATE_SCHEMA_VERSION,
    approvalPolicy: previousWorkflow.approvalPolicy || 'phase-gated',
    currentPhaseId: phase,
    outputPath: phaseState.outputPath.id,
    tasks: phaseState.tasks,
    phaseStates: {
      ...(previousWorkflow.phaseStates || {}),
      [phase]: {
        phase,
        name: phaseState.name,
        objective: phaseState.objective,
        outputPath: phaseState.outputPath.id,
        readiness: phaseState.readiness,
        readyToAdvance: phaseState.readyToAdvance,
        gates: phaseState.gates,
        tasks: phaseState.tasks,
        updatedAt: Date.now(),
      },
    },
  };

  return {
    workflow: nextWorkflow,
    changed: JSON.stringify(previousWorkflow) !== JSON.stringify(nextWorkflow),
    phaseState,
  };
}
