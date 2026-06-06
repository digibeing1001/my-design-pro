import { buildDesignControlState } from './designControl';

export const WORKFLOW_GRAPH_SCHEMA_VERSION = 'gdpro.workflow-graph.v1';
export const WORKFLOW_CANVAS_SCHEMA_VERSION = 'gdpro.workflow-canvas.v1';

const NODE_SIZE = { width: 238, height: 150 };

const STATUS_LABELS = {
  locked: '已确认',
  ready: '可交付',
  pass: '已通过',
  signed: '已签收',
  clean: '无风险',
  'system-pass': '检查通过',
  'ready-to-compile': '可确认',
  'ready-to-lock': '可锁定',
  actionable: '可由工作台处理',
  'needs-fix': '需修复',
  'needs-review': '需人工确认',
  'needs-export': '待导出',
  'pending-signoff': '待签收',
  'changes-requested': '需修改',
  draft: '草稿',
  stale: '有变更待同步',
  blocked: '缺资料',
  rejected: '已拒绝',
};

const OPERATION_LABELS = {
  lock_asset_manifest: '锁定品牌资产',
  compile_design_brief_contract: '确认客户需求',
  add_material: '加入一项交付物',
  generate_material_artwork: '制作生产画稿',
  refresh_material_manifest_refs: '同步品牌资产',
  refresh_material_spec: '更新物料说明',
  set_material_status: '更新交付状态',
  run_preflight_review: '完成交付检查',
  create_delivery_package: '打包交付文件',
  record_review_decision: '记录审核意见',
  request_phase_transition: '进入下一阶段',
};

const RESULT_STATUS_LABELS = {
  applied: '已完成',
  skipped: '已跳过',
  blocked: '被挡住',
  rejected: '未处理',
  failed: '未完成',
};

const CONTROL_RULE_DETAILS = {
  'brief-contract': '客户目标、禁忌和交付范围必须先写清楚，后续制作才能一直按同一份任务书推进。',
  'asset-manifest': '所有后续画稿必须复用同一套 Logo、颜色、字体和基础素材，避免每张图重新发挥。',
  'material-plan': '先把客户真正会收到的物料列清楚，再逐项制作和检查。',
  'artwork-source': '每个交付物都要有可检查的源画稿，不能只停留在一次性预览图。',
  'preflight-review': '交付前必须检查尺寸、颜色、资产引用和源文件风险，减少返工。',
  'delivery-package': '客户可接收的文件、说明和清单要放在一起，交付才可追踪。',
  'review-board': '交付检查、总监判断和人工签收要留痕，方便复盘责任和修改记录。',
  'design-scorecard': '商业交付要同时看一致性、可生产性和完整度，不能只看画面好不好看。',
  'impact-matrix': '任何改动都要先看会影响哪些下游物料，避免局部修改造成整体漂移。',
};

const BASE_NODES = [
  {
    id: 'brief-contract',
    title: '需求确认',
    subtitle: '把客户目标、限制和交付范围锁清楚',
    phase: 2,
    artifact: 'brief-contract',
    position: { x: 80, y: 90 },
    inputs: ['客户访谈', '品牌方向', '交付范围'],
    outputs: ['已确认的设计任务书'],
    outputLabel: '客户需求已确认',
  },
  {
    id: 'asset-manifest',
    title: '品牌资产',
    subtitle: '统一标志、颜色、字体和基础素材',
    phase: 3,
    artifact: 'asset-manifest',
    position: { x: 392, y: 90 },
    inputs: ['设计任务书', '标志文件', '品牌规范'],
    outputs: ['可复用的品牌资产包'],
    outputLabel: '品牌资产可复用',
  },
  {
    id: 'material-plan',
    title: '交付物清单',
    subtitle: '确定名片、海报、包装等要做什么',
    phase: 4,
    artifact: 'material-plan',
    position: { x: 704, y: 90 },
    inputs: ['品牌资产包', '客户需要的应用场景'],
    outputs: ['每个交付物的尺寸和要求'],
    outputLabel: '交付范围已排好',
  },
  {
    id: 'artwork-source',
    title: '生产画稿',
    subtitle: '制作可反复检查的一致画稿源文件',
    phase: 4,
    artifact: 'material-source',
    position: { x: 918, y: 330 },
    inputs: ['交付物清单', '品牌资产包'],
    outputs: ['可交付的矢量源画稿'],
    outputLabel: '画稿源文件就绪',
  },
  {
    id: 'preflight-review',
    title: '交付检查',
    subtitle: '检查尺寸、引用、颜色和交付风险',
    phase: 5,
    artifact: 'preflight-review',
    position: { x: 704, y: 560 },
    inputs: ['生产画稿', '物料说明'],
    outputs: ['交付前检查报告'],
    outputLabel: '交付风险已检查',
  },
  {
    id: 'delivery-package',
    title: '交付包',
    subtitle: '汇总客户可接收的文件和说明',
    phase: 6,
    artifact: 'delivery-package',
    position: { x: 392, y: 560 },
    inputs: ['交付检查报告', '已导出的画稿'],
    outputs: ['VI 手册、交付说明、文件清单'],
    outputLabel: '客户交付包可整理',
  },
  {
    id: 'review-board',
    title: '签收看板',
    subtitle: '记录哪些内容已通过、哪些还要改',
    phase: 6,
    artifact: 'review-board',
    position: { x: 80, y: 560 },
    inputs: ['交付包', '总监评分'],
    outputs: ['最终签收记录'],
    outputLabel: '交付签收可追踪',
  },
  {
    id: 'design-scorecard',
    title: '总监评分',
    subtitle: '从商业交付角度评估一致性和完成度',
    phase: 6,
    artifact: 'design-scorecard',
    position: { x: 1036, y: 560 },
    inputs: ['设计任务书', '品牌资产', '生产画稿', '交付包'],
    outputs: ['商业交付评分'],
    outputLabel: '商业评分可查看',
  },
  {
    id: 'impact-matrix',
    title: '影响检查',
    subtitle: '看一个改动会影响哪些下游文件',
    phase: 6,
    artifact: 'production-impact',
    position: { x: 1036, y: 90 },
    inputs: ['当前项目状态'],
    outputs: ['推荐处理步骤'],
    outputLabel: '下游影响已列出',
  },
];

const BASE_EDGES = [
  ['brief-contract', 'asset-manifest'],
  ['asset-manifest', 'material-plan'],
  ['material-plan', 'artwork-source'],
  ['artwork-source', 'preflight-review'],
  ['preflight-review', 'delivery-package'],
  ['delivery-package', 'review-board'],
  ['design-scorecard', 'review-board'],
  ['brief-contract', 'design-scorecard'],
  ['asset-manifest', 'impact-matrix'],
  ['material-plan', 'impact-matrix'],
  ['impact-matrix', 'material-plan'],
  ['impact-matrix', 'artwork-source'],
];

function cloneDefaultNode(node) {
  return {
    id: node.id,
    title: node.title,
    subtitle: node.subtitle,
    phase: node.phase,
    artifact: node.artifact,
    position: { ...node.position },
    inputs: [...(node.inputs || [])],
    outputs: [...(node.outputs || [])],
    outputLabel: node.outputLabel,
    templateId: node.id,
    custom: false,
  };
}

export function createDefaultWorkflowCanvas() {
  return {
    schemaVersion: WORKFLOW_CANVAS_SCHEMA_VERSION,
    nodes: BASE_NODES.map(cloneDefaultNode),
    edges: BASE_EDGES.map(([from, to], index) => ({
      id: `edge-${from}-${to}-${index}`,
      from,
      to,
    })),
    updatedAt: Date.now(),
  };
}

function normalizeCanvasNode(node = {}, index = 0) {
  const base = BASE_NODES.find((item) => item.id === node.id || item.id === node.templateId);
  const merged = base ? { ...cloneDefaultNode(base), ...node } : {
    id: node.id || `custom-step-${index + 1}`,
    title: node.title || `自定义步骤 ${index + 1}`,
    subtitle: node.subtitle || '按项目需要补充这一步的目标和产物',
    phase: node.phase || index + 1,
    artifact: node.artifact || 'custom-workflow-step',
    position: node.position || { x: 120 + index * 80, y: 120 + index * 60 },
    inputs: node.inputs || ['上一步输出'],
    outputs: node.outputs || ['这一步产物'],
    outputLabel: node.outputLabel || '等待处理',
    templateId: node.templateId || null,
    custom: node.custom !== false,
  };
  return {
    ...merged,
    position: {
      x: Number.isFinite(Number(merged.position?.x)) ? Number(merged.position.x) : 120 + index * 80,
      y: Number.isFinite(Number(merged.position?.y)) ? Number(merged.position.y) : 120 + index * 60,
    },
    size: NODE_SIZE,
    inputs: Array.isArray(merged.inputs) ? merged.inputs : [],
    outputs: Array.isArray(merged.outputs) ? merged.outputs : [],
    custom: Boolean(merged.custom),
  };
}

function resolveCanvas(project) {
  const stored = project?.workflowCanvas;
  if (!stored?.nodes?.length) return createDefaultWorkflowCanvas();
  const nodes = stored.nodes.map(normalizeCanvasNode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (stored.edges?.length ? stored.edges : [])
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge, index) => ({
      id: edge.id || `edge-${edge.from}-${edge.to}-${index}`,
      from: edge.from,
      to: edge.to,
    }));
  return {
    schemaVersion: WORKFLOW_CANVAS_SCHEMA_VERSION,
    nodes,
    edges,
    updatedAt: stored.updatedAt || Date.now(),
  };
}

function statusTone(status) {
  if (['locked', 'ready', 'pass', 'signed', 'clean', 'system-pass'].includes(status)) return 'success';
  if (['ready-to-compile', 'ready-to-lock', 'actionable'].includes(status)) return 'info';
  if (['needs-fix', 'needs-review', 'needs-export', 'pending-signoff', 'changes-requested', 'draft', 'stale'].includes(status)) return 'warning';
  if (['blocked', 'rejected'].includes(status)) return 'danger';
  return 'muted';
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '未开始';
}

function operationLabel(type) {
  return OPERATION_LABELS[type] || '处理此步骤';
}

function resultStatusLabel(status) {
  return RESULT_STATUS_LABELS[status] || status || '未处理';
}

function nodeStatus(node, state) {
  if (node.custom) return node.done ? 'locked' : 'draft';
  switch (node.id) {
    case 'brief-contract':
      return state.designBriefContract?.status || 'blocked';
    case 'asset-manifest':
      return state.manifest?.status || 'draft';
    case 'material-plan':
      return state.materialPlan?.status || 'draft';
    case 'artwork-source': {
      const total = state.materialPlan?.stats?.total || 0;
      const passed = state.materialPlan?.stats?.sourceQaPassed || 0;
      if (!total) return 'blocked';
      if (passed === total) return 'pass';
      return passed ? 'needs-fix' : 'blocked';
    }
    case 'preflight-review':
      return state.preflightReview?.status || 'blocked';
    case 'delivery-package':
      return state.deliveryPackage?.status || 'blocked';
    case 'review-board':
      return state.reviewBoard?.status || 'blocked';
    case 'design-scorecard':
      return state.designScorecard?.status || 'blocked';
    case 'impact-matrix':
      return state.productionImpact?.status || 'blocked';
    default:
      return 'blocked';
  }
}

function nodeMetrics(node, state) {
  if (node.custom) {
    return [
      ['输入', node.inputs?.length || 0],
      ['产物', node.outputs?.length || 0],
      ['状态', node.done ? '完成' : '待做'],
    ];
  }
  switch (node.id) {
    case 'brief-contract':
      return [
        ['完整度', `${state.designBriefContract?.readiness || 0}%`],
        ['应用场景', state.designBriefContract?.stats?.targets || 0],
        ['需补充', state.designBriefContract?.violations?.length || 0],
      ];
    case 'asset-manifest':
      return [
        ['完整度', `${state.manifest?.readiness || 0}%`],
        ['资产数', state.manifest?.items?.length || 0],
        ['缺少项', state.manifest?.missing?.length || 0],
      ];
    case 'material-plan':
      return [
        ['交付物', state.materialPlan?.stats?.total || 0],
        ['可制作', state.materialPlan?.stats?.ready || 0],
        ['已确认', state.materialPlan?.stats?.approved || 0],
      ];
    case 'artwork-source':
      return [
        ['源画稿', state.materialPlan?.stats?.sourceArtworks || 0],
        ['已通过', state.materialPlan?.stats?.sourceQaPassed || 0],
        ['总数', state.materialPlan?.stats?.total || 0],
      ];
    case 'preflight-review':
      return [
        ['完整度', `${state.preflightReview?.readiness || 0}%`],
        ['严重问题', state.preflightReview?.summary?.critical || 0],
        ['高风险', state.preflightReview?.summary?.high || 0],
      ];
    case 'delivery-package':
      return [
        ['完整度', `${state.deliveryPackage?.readiness || 0}%`],
        ['已就绪', state.deliveryPackage?.stats?.readyEntries || 0],
        ['阻塞项', state.deliveryPackage?.blockers?.length || 0],
      ];
    case 'review-board':
      return [
        ['已签收', `${state.reviewBoard?.stats?.approved || 0}/${state.reviewBoard?.stats?.total || 0}`],
        ['待确认', state.reviewBoard?.stats?.pending || 0],
        ['阻塞项', state.reviewBoard?.stats?.blocked || 0],
      ];
    case 'design-scorecard':
      return [
        ['评分', state.designScorecard?.score || 0],
        ['门槛', state.designScorecard?.threshold || 0],
        ['问题数', state.designScorecard?.issues?.length || 0],
      ];
    case 'impact-matrix':
      return [
        ['影响项', state.productionImpact?.stats?.total || 0],
        ['可处理', state.productionImpact?.stats?.safe || 0],
        ['阻塞项', state.productionImpact?.stats?.blocked || 0],
      ];
    default:
      return [];
  }
}

function nodeIssues(node, state) {
  if (node.custom) return [];
  switch (node.id) {
    case 'brief-contract':
      return state.designBriefContract?.violations || [];
    case 'asset-manifest':
      return (state.manifest?.missing || []).map((item) => ({
        id: item.id,
        severity: 'high',
        title: item.label,
        detail: '需要在品牌套件中补齐。',
      }));
    case 'material-plan':
      return state.materialPlan?.blockers || [];
    case 'artwork-source':
      return (state.materialPlan?.evaluations || [])
        .flatMap((evaluation) => evaluation.artworkAudit?.issues?.map((issue) => ({
          ...issue,
          title: issue.label,
          materialId: evaluation.materialId,
        })) || []);
    case 'preflight-review':
      return state.preflightReview?.issues || [];
    case 'delivery-package':
      return state.deliveryPackage?.blockers || [];
    case 'design-scorecard':
      return state.designScorecard?.issues || [];
    case 'impact-matrix':
      return state.productionImpact?.items || [];
    case 'review-board':
      return (state.reviewBoard?.items || []).filter((item) => item.status === 'blocked' || item.status === 'pending');
    default:
      return [];
  }
}

function issueTitle(issue) {
  if (!issue) return '需要确认';
  if (issue.operation?.type) return operationLabel(issue.operation.type);
  return issue.title || issue.label || '需要确认';
}

function issueDetail(issue) {
  return issue?.fix || issue?.detail || issue?.evidence || '请先补齐这一步需要的信息，再继续下游交付。';
}

function operationDetail(item, node) {
  if (!item) return node.outputLabel;
  if (item.operation?.type) {
    const label = operationLabel(item.operation.type);
    if (item.operation.type === 'add_material') return `${label}，补齐客户要求的应用场景。`;
    if (item.operation.type === 'generate_material_artwork') return `${label}，让画稿重新符合当前品牌资产。`;
    if (item.operation.type === 'refresh_material_manifest_refs') return `${label}，避免旧素材继续影响交付物。`;
    if (item.operation.type === 'run_preflight_review') return `${label}，检查交付前风险。`;
    if (item.operation.type === 'create_delivery_package') return `${label}，整理客户可接收的文件包。`;
    return `${label}，让这一步回到可继续交付的状态。`;
  }
  return item.title || node.outputLabel;
}

function cleanSnippet(value, max = 120) {
  return String(value || '')
    .replace(/[#*_`>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function formatSize(size = {}) {
  if (!size.width || !size.height) return '尺寸待确认';
  return `${size.width} × ${size.height} ${size.unit || 'px'}`;
}

function documentReady(project, key) {
  return Boolean(project?.documents?.[key]?.content || project?.documents?.[key]);
}

function documentPreview(project, key, label) {
  const doc = project?.documents?.[key];
  return {
    id: key,
    label,
    ready: documentReady(project, key),
    detail: doc?.title || cleanSnippet(doc?.content, 80) || '尚未整理',
  };
}

function statusText(value) {
  if (value === 'exported') return '已导出';
  if (value === 'approved') return '已确认';
  if (value === 'designing') return '制作中';
  if (value === 'planned') return '已计划';
  if (value === 'ready') return '已就绪';
  if (value === 'blocked') return '有卡点';
  return value || '未开始';
}

function firstAction(operations = [], fallback = null) {
  const runnable = operations.find((item) => item.autoRunnable) || operations[0];
  if (runnable) {
    return {
      label: runnable.autoRunnable ? runnable.label : '请你先确认',
      detail: runnable.detail,
      tone: runnable.autoRunnable ? 'success' : 'warning',
    };
  }
  return fallback;
}

function checkStatusLabel(tone) {
  if (tone === 'success') return '已通过';
  if (tone === 'info') return '可处理';
  if (tone === 'warning') return '需确认';
  if (tone === 'danger') return '被阻塞';
  return '待观察';
}

function upstreamInputTone(upstream) {
  if (!upstream.length) return 'success';
  if (upstream.every((item) => item.tone === 'success')) return 'success';
  if (upstream.some((item) => item.tone === 'danger')) return 'danger';
  return 'warning';
}

function completionTone(node, autoCount) {
  if (node.tone === 'success') return 'success';
  if (autoCount > 0) return 'info';
  if (node.tone === 'danger') return 'danger';
  return 'warning';
}

function actionTone(node, autoCount, manualCount) {
  if (autoCount > 0) return 'info';
  if (manualCount > 0) return 'warning';
  if (node.tone === 'success') return 'success';
  return 'muted';
}

function buildNodeControl(node, allNodes, edges, state) {
  const upstream = edges
    .filter((edge) => edge.to === node.id)
    .map((edge) => allNodes.find((entry) => entry.id === edge.from))
    .filter(Boolean);
  const autoCount = node.operations.filter((item) => item.autoRunnable).length;
  const manualCount = Math.max(0, node.operations.length - autoCount);
  const inputTone = upstreamInputTone(upstream);
  const issueTone = node.issues.length ? (node.tone === 'danger' ? 'danger' : 'warning') : 'success';
  const brandKit = state?.brandConsistencyKit;
  const brandKitHasCritical = brandKit?.issues?.some((issue) => issue.severity === 'critical');
  const brandKitTone = brandKit?.readyForDelivery || (node.phase < 4 && brandKit?.locked)
    ? 'success'
    : brandKitHasCritical
      ? 'danger'
      : 'warning';
  const outputTone = completionTone(node, autoCount);
  const safeActionTone = actionTone(node, autoCount, manualCount);
  const firstIssue = node.issues[0];

  const checks = [
    {
      id: 'inputs',
      label: '开始前需要',
      labelEn: 'Inputs',
      tone: inputTone,
      statusLabel: checkStatusLabel(inputTone),
      detail: node.inputs?.length ? `需要先准备：${node.inputs.join('、')}` : '这一步不需要前置材料。',
      evidence: upstream.length
        ? upstream.map((item) => `${item.title}：${item.statusLabel}`).join('；')
        : '这是工作流入口，可以从这里开始。',
    },
    {
      id: 'output',
      label: '完成后要看到',
      labelEn: 'Output',
      tone: outputTone,
      statusLabel: checkStatusLabel(outputTone),
      detail: node.outputs?.length ? node.outputs.join('、') : node.outputLabel,
      evidence: `当前状态：${node.statusLabel}`,
    },
    {
      id: 'consistency',
      label: '一致性规则',
      labelEn: 'Consistency',
      tone: issueTone,
      statusLabel: checkStatusLabel(issueTone),
      detail: CONTROL_RULE_DETAILS[node.id] || '保持这一步的产物和上下游要求一致。',
      evidence: firstIssue ? `${firstIssue.displayTitle}：${firstIssue.displayDetail}` : '未发现阻塞问题。',
    },
    {
      id: 'brand-kit',
      label: '品牌套件引用',
      labelEn: 'Brand Kit',
      tone: brandKitTone,
      statusLabel: checkStatusLabel(brandKitTone),
      detail: brandKit
        ? `${brandKit.statusLabel}；矢量源稿 ${brandKit.stats.sourceSvgReady}/${brandKit.stats.materials}，物料引用 ${brandKit.stats.boundMaterials}/${brandKit.stats.materials}。`
        : '品牌套件还没有建立一致性契约。',
      evidence: brandKit?.issues?.[0]
        ? `${brandKit.issues[0].title}：${brandKit.issues[0].fix}`
        : '所有后续物料都应引用同一套 Logo、颜色、字体和可编辑源稿。',
    },
    {
      id: 'agent-actions',
      label: '工作台可做的事',
      labelEn: 'Desk',
      tone: safeActionTone,
      statusLabel: checkStatusLabel(safeActionTone),
      detail: '只处理已经通过检查的事项；需要人工判断的内容会停下来等你确认。',
      evidence: `${autoCount} 项可直接处理，${manualCount} 项需要你确认。`,
    },
  ];

  const passed = checks.filter((item) => item.tone === 'success').length;
  const attention = checks.filter((item) => item.tone === 'warning' || item.tone === 'danger').length;

  return {
    checks,
    passed,
    total: checks.length,
    attention,
    safeActions: autoCount,
    summaryLabel: attention ? `${attention} 项需确认` : `${passed}/${checks.length} 已过关`,
    detailLabel: autoCount ? `${autoCount} 项可由工作台处理` : '暂无可直接处理事项',
  };
}

function operationNodeIds(operationType) {
  switch (operationType) {
    case 'compile_design_brief_contract':
      return ['brief-contract'];
    case 'lock_asset_manifest':
      return ['asset-manifest'];
    case 'add_material':
    case 'refresh_material_spec':
      return ['material-plan'];
    case 'generate_material_artwork':
    case 'refresh_material_manifest_refs':
      return ['artwork-source'];
    case 'set_material_status':
      return ['material-plan', 'artwork-source', 'delivery-package'];
    case 'run_preflight_review':
      return ['preflight-review'];
    case 'create_delivery_package':
      return ['delivery-package'];
    case 'record_review_decision':
      return ['review-board'];
    case 'request_phase_transition':
      return ['review-board'];
    default:
      return [];
  }
}

function activityTone(status) {
  if (status === 'applied') return 'success';
  if (status === 'skipped') return 'info';
  if (status === 'blocked') return 'warning';
  if (status === 'rejected' || status === 'failed') return 'danger';
  return 'muted';
}

function buildOperationActivity(node, state) {
  if (node.custom) return [];
  const results = state.operationResults || [];
  return results
    .filter((item) => operationNodeIds(item.operationType).includes(node.id))
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      label: operationLabel(item.operationType),
      status: item.status,
      statusLabel: resultStatusLabel(item.status),
      tone: activityTone(item.status),
      detail: item.detail || item.label || '工作台已保存处理记录。',
      rawLabel: item.label,
      timestamp: item.timestamp || null,
    }));
}

function buildNodePreview(base, project, state, operations, issues) {
  const colors = Array.isArray(project?.brandKit?.colors) ? project.brandKit.colors : [];
  const materialPlan = state.materialPlan || {};
  const materials = materialPlan.materials || [];
  const deliveryPackage = state.deliveryPackage || {};
  const reviewBoard = state.reviewBoard || {};
  const scorecard = state.designScorecard || {};
  const impact = state.productionImpact || {};

  switch (base.id) {
    case 'brief-contract':
      return {
        title: '这一步的产物',
        summary: '一份可直接落地的客户需求边界，避免后续自由发挥。',
        items: [
          { label: '品牌名称', value: project?.brandName || '待确认' },
          { label: '需求简报', value: project?.documents?.brief?.title || '待补充' },
          { label: '客户场景', value: `${state.designBriefContract?.targets?.length || 0} 个` },
        ],
        documents: [documentPreview(project, 'brief', '需求简报')],
        nextStep: firstAction(operations, issues.length
          ? { label: '补齐客户信息', detail: issues[0]?.displayDetail || '先把缺少的需求内容补完整。', tone: 'warning' }
          : { label: '继续检查品牌资产', detail: '需求边界已经清楚，可以进入品牌资产统一。', tone: 'success' }),
      };
    case 'asset-manifest':
      return {
        title: '品牌资产预览',
        summary: '这里汇总后续所有交付物必须复用的标志、颜色、字体和基础素材。',
        swatches: colors.map((color) => ({
          id: color.hex || color.name,
          name: color.name || '品牌色',
          hex: color.hex || '#8B8276',
          detail: color.usage || '品牌色',
        })),
        items: (state.manifest?.items || []).slice(0, 5).map((item) => ({
          label: item.name || item.value || item.role,
          value: item.role,
        })),
        nextStep: firstAction(operations, issues.length
          ? { label: '补齐品牌资产', detail: issues[0]?.displayTitle || '缺少可复用的品牌资产。', tone: 'warning' }
          : { label: '安排交付物', detail: '品牌资产已可复用，下一步确定要做哪些物料。', tone: 'success' }),
      };
    case 'material-plan':
      return {
        title: '交付物预览',
        summary: '把客户要用到的实际物料拆成可制作、可检查、可导出的清单。',
        items: materials.length
          ? materials.slice(0, 6).map((material) => ({
            label: material.name,
            value: statusText(material.status),
            detail: `${formatSize(material.size)} · ${material.colorMode || '色彩模式待确认'}`,
          }))
          : [{ label: '还没有交付物', value: '待创建', detail: '先加入名片、海报、包装或招牌等实际交付物。' }],
        nextStep: firstAction(operations, materials.length
          ? { label: '制作生产画稿', detail: '交付物清单已有内容，可以开始制作可检查的源画稿。', tone: 'success' }
          : { label: '加入第一项交付物', detail: '先创建一个客户真的会收到的物料。', tone: 'warning' }),
      };
    case 'artwork-source':
      return {
        title: '生产画稿预览',
        summary: '这里展示当前交付物是否已经有可复用、可检查的源画稿。',
        thumbnails: materials.slice(0, 4).map((material) => ({
          id: material.id,
          name: material.name,
          status: statusText(material.status),
          svg: material.artwork?.svg || '',
          detail: material.artwork?.sourcePath || '源画稿待制作',
        })),
        items: materials.length
          ? materials.slice(0, 4).map((material) => ({
            label: material.name,
            value: material.artwork?.svg ? '有源画稿' : '待制作',
            detail: material.artwork?.sourcePath || '还没有可检查的矢量源文件',
          }))
          : [{ label: '没有可预览的物料', value: '待创建', detail: '先在交付物清单里加入一个物料。' }],
        nextStep: firstAction(operations, { label: '继续交付检查', detail: '源画稿通过后，就可以完成交付前检查。', tone: 'success' }),
      };
    case 'preflight-review':
      return {
        title: '检查报告预览',
        summary: '交付前检查会暴露尺寸、资产引用、源文件和文档风险。',
        items: [
          { label: '严重问题', value: state.preflightReview?.summary?.critical || 0 },
          { label: '高风险', value: state.preflightReview?.summary?.high || 0 },
          { label: '完整度', value: `${state.preflightReview?.readiness || 0}%` },
        ],
        documents: [documentPreview(project, 'audit', '交付前检查报告')],
        nextStep: firstAction(operations, issues.length
          ? { label: '先处理检查问题', detail: issues[0]?.displayDetail || '交付检查仍有问题。', tone: 'warning' }
          : { label: '整理交付包', detail: '检查通过后，可以汇总客户可接收的文件。', tone: 'success' }),
      };
    case 'delivery-package':
      return {
        title: '交付包预览',
        summary: '客户最终拿到的文件、说明和归档清单会在这里汇总。',
        documents: [
          documentPreview(project, 'viManual', 'VI 规范手册'),
          documentPreview(project, 'handoff', '交接说明'),
          documentPreview(project, 'deliveryManifest', '交付清单'),
        ],
        items: (deliveryPackage.folders || []).slice(0, 6).map((folder) => ({
          label: folder.label,
          value: `${folder.readyCount || 0}/${folder.itemCount || 0}`,
          detail: folder.path,
        })),
        nextStep: firstAction(operations, deliveryPackage.ready
          ? { label: '进入签收', detail: '交付包已就绪，可以让客户或总监签收。', tone: 'success' }
          : { label: '补齐交付包', detail: deliveryPackage.blockers?.[0]?.detail || '还有交付文件未就绪。', tone: 'warning' }),
      };
    case 'review-board':
      return {
        title: '签收状态预览',
        summary: '把交付检查、设计总监判断和人工确认统一记录，方便复盘交付责任。',
        items: (reviewBoard.items || []).slice(0, 6).map((item) => ({
          label: item.label,
          value: statusLabel(item.status),
          detail: item.detail,
        })),
        nextStep: firstAction(operations, reviewBoard.signed
          ? { label: '交付已签收', detail: '所有关键内容已完成签收记录。', tone: 'success' }
          : { label: '继续确认签收项', detail: '还有内容需要人工确认或修改。', tone: 'warning' }),
      };
    case 'design-scorecard':
      return {
        title: '商业评分预览',
        summary: '从品牌一致性、生产可用性和交付完整度三个方向判断是否能商用。',
        items: [
          { label: '当前评分', value: `${scorecard.score || 0}/${scorecard.threshold || 0}`, detail: scorecard.grade ? `等级 ${scorecard.grade}` : '尚未评分' },
          ...(scorecard.dimensions || []).slice(0, 4).map((dimension) => ({
            label: dimension.label,
            value: `${dimension.score}/100`,
            detail: dimension.detail || '评分维度',
          })),
        ],
        nextStep: firstAction(operations, scorecard.passed
          ? { label: '可以进入签收', detail: '商业评分达到交付门槛。', tone: 'success' }
          : { label: '先修复低分项', detail: scorecard.issues?.[0]?.fix || scorecard.issues?.[0]?.detail || '评分还没达到商用交付门槛。', tone: 'warning' }),
      };
    case 'impact-matrix':
      return {
        title: '影响范围预览',
        summary: '当你改动需求、品牌资产或交付物时，这里会提示哪些下游文件需要一起更新。',
        items: (impact.items || []).slice(0, 6).map((item) => ({
          label: item.title,
          value: statusLabel(item.status),
          detail: item.detail,
        })),
        nextStep: firstAction(operations, impact.stats?.total
          ? { label: '按影响顺序处理', detail: '先处理工作台可处理的影响项，再人工确认剩余风险。', tone: 'warning' }
          : { label: '没有下游风险', detail: '当前改动没有发现需要同步的下游文件。', tone: 'success' }),
      };
    default:
      return {
        title: '这一步的产物',
        summary: base.outputLabel,
        nextStep: firstAction(operations),
      };
  }
}

function nodeOperations(node, state) {
  const impactOps = (state.productionImpact?.items || [])
    .filter((item) => item.operation && (
      item.artifact === node.artifact ||
      item.artifact?.startsWith(node.artifact) ||
      (node.id === 'artwork-source' && item.artifact?.startsWith('material:')) ||
      (node.id === 'impact-matrix')
    ))
    .map((item) => ({
      itemId: item.id,
      label: operationLabel(item.operation.type),
      autoRunnable: item.autoRunnable,
      operation: item.operation,
      detail: operationDetail(item, node),
    }));

  const repairOps = (state.repairQueue?.items || [])
    .filter((item) => item.operation && (
      item.source === node.artifact ||
      item.evidence?.includes(node.artifact) ||
      item.source === node.id ||
      (node.id === 'delivery-package' && item.source === 'deliveryPackage') ||
      (node.id === 'artwork-source' && item.source === 'artworkQuality')
    ))
    .map((item) => ({
      itemId: item.id,
      label: operationLabel(item.operation.type),
      autoRunnable: item.autoRunnable,
      operation: item.operation,
      detail: operationDetail(item, node),
    }));

  if (!impactOps.length) return repairOps;

  const seen = new Set(impactOps.map((item) => `${item.operation?.type}:${JSON.stringify(item.operation?.params || {})}`));
  return [
    ...impactOps,
    ...repairOps.filter((item) => {
      const key = `${item.operation?.type}:${JSON.stringify(item.operation?.params || {})}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
}

function buildNode(base, state) {
  const status = nodeStatus(base, state);
  const issues = nodeIssues(base, state);
  const operations = nodeOperations(base, state);
  const activity = buildOperationActivity(base, state);
  return {
    ...base,
    size: NODE_SIZE,
    status,
    statusLabel: statusLabel(status),
    tone: statusTone(status),
    metrics: nodeMetrics(base, state),
    issues: issues.map((issue) => ({
      ...issue,
      displayTitle: issueTitle(issue),
      displayDetail: issueDetail(issue),
    })),
    operations,
    activity,
    lastActivity: activity[0] || null,
  };
}

export function buildWorkflowGraph(project) {
  const state = buildDesignControlState(project);
  const canvas = resolveCanvas(project);
  const nodesWithoutControl = canvas.nodes.map((node) => {
    const built = buildNode(node, state);
    return {
      ...built,
      preview: buildNodePreview(node, project, state, built.operations, built.issues),
    };
  });
  const baseEdges = canvas.edges.map((edge, index) => ({
    id: edge.id || `edge-${edge.from}-${edge.to}-${index}`,
    from: edge.from,
    to: edge.to,
    tone: 'muted',
  }));
  const nodes = nodesWithoutControl.map((node) => ({
    ...node,
    control: buildNodeControl(node, nodesWithoutControl, baseEdges, state),
  }));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = canvas.edges.map((edge, index) => ({
    id: edge.id || `edge-${edge.from}-${edge.to}-${index}`,
    from: edge.from,
    to: edge.to,
    tone: nodeMap.get(edge.to)?.tone || 'muted',
  }));
  const safeOperations = nodes.reduce((sum, node) => sum + node.operations.filter((op) => op.autoRunnable).length, 0);
  const passedChecks = nodes.reduce((sum, node) => sum + (node.control?.passed || 0), 0);
  const totalChecks = nodes.reduce((sum, node) => sum + (node.control?.total || 0), 0);
  const attentionChecks = nodes.reduce((sum, node) => sum + (node.control?.attention || 0), 0);
  const recentActivity = nodes.flatMap((node) => node.activity.map((item) => ({
    ...item,
    nodeId: node.id,
    nodeTitle: node.title,
  }))).slice(0, 8);
  const brandKit = state.brandConsistencyKit;

  return {
    schemaVersion: WORKFLOW_GRAPH_SCHEMA_VERSION,
    projectId: project?.id || null,
    canvas,
    nodes,
    edges,
    state,
    stats: {
      nodes: nodes.length,
      blocked: nodes.filter((node) => node.tone === 'danger').length,
      actionable: nodes.filter((node) => node.operations.some((op) => op.autoRunnable)).length,
      safeOperations,
      passedChecks,
      totalChecks,
      attentionChecks,
      recentActivity: recentActivity.length,
      brandKitReadiness: brandKit?.readiness || 0,
      brandKitStatus: brandKit?.status || 'draft',
      brandKitStatusLabel: brandKit?.statusLabel || '品牌套件待整理',
      vectorSourceReady: brandKit ? `${brandKit.stats.sourceSvgReady}/${brandKit.stats.materials}` : '0/0',
      summaryLabel: `${nodes.length} 个流程步骤 · 品牌套件 ${brandKit?.readiness || 0}% · ${nodes.filter((node) => node.tone === 'danger').length} 个卡点 · ${safeOperations} 个可处理项`,
    },
    recentActivity,
  };
}
