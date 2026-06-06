export const RUNTIME_HANDOFF_SCHEMA_VERSION = 'gdpro.runtime-handoff.v1';
export const PARTNER_HANDOFF_SCHEMA_VERSION = 'gdpro.partner-handoff-task.v1';

const VISUAL_OPERATION_TYPES = new Set([
  'generate_material_artwork',
]);

const DELIVERY_OPERATION_TYPES = new Set([
  'create_delivery_package',
  'set_material_status',
  'record_review_decision',
]);

const SENSITIVE_FIELD_PATTERN = /(api[-_ ]?key|token|secret|authorization|password|credential|access[-_ ]?key)/i;

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function publicMissingFields(fields = []) {
  return unique((fields || []).map((field) => (
    SENSITIVE_FIELD_PATTERN.test(String(field || ''))
      ? 'provider-authorization'
      : safeText(field)
  )));
}

function operationType(item = {}) {
  return item.operation?.type || item.operationType || item.type || '';
}

function routeKind(config = {}) {
  const route = config.deliveryRoute || {};
  if (route.finalDeliveryAllowed) return 'source-candidate';
  if (route.vectorOutput || route.editableSource) return 'editable-source';
  return 'concept-only';
}

function check(id, state, detailCode, extra = {}) {
  return { id, state, detailCode, ...extra };
}

function nowIso() {
  return new Date().toISOString();
}

function safeText(value, fallback = '') {
  return String(value ?? fallback);
}

function slug(value) {
  return safeText(value, 'untitled')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

function projectSummary(project = {}) {
  return {
    id: project.id || '',
    name: project.name || '',
    brandName: project.brandName || project.name || '',
    currentPhase: project.currentPhase || null,
  };
}

function imageChannelSummary(config = {}, imageModel = '') {
  return {
    id: imageModel || config.id || '',
    providerId: config.providerId || '',
    provider: config.provider || '',
    displayName: config.displayName || imageModel || '',
    configured: Boolean(config.configured),
    missingFields: publicMissingFields(config.missingFields),
    routeKind: routeKind(config),
    deliveryRoute: config.deliveryRoute || null,
    defaults: config.defaults || {},
    model: config.model || '',
  };
}

function summarizeTaskItem(item = {}, index = 0) {
  return {
    index,
    itemId: item.itemId || '',
    nodeId: item.nodeId || '',
    nodeTitle: item.nodeTitle || '',
    label: item.label || '',
    detail: item.detail || '',
    autoRunnable: Boolean(item.autoRunnable),
    operation: item.operation ? {
      id: item.operation.id || '',
      type: item.operation.type || '',
      params: item.operation.params || {},
      reason: item.operation.reason || '',
    } : null,
  };
}

function handoffQueueStatus(plan = {}) {
  if (plan.status === 'ready') return 'ready-for-partner';
  if (plan.status === 'needs-visual-key') return 'waiting-for-visual-key';
  if (plan.status === 'concept-only') return 'preview-only-review';
  if (plan.status === 'partner-offline') return 'waiting-for-partner';
  return 'saved-for-review';
}

function nextActionCode(plan = {}) {
  if (plan.status === 'needs-visual-key') return 'add-visual-provider-key';
  if (plan.status === 'concept-only') return 'rebuild-accepted-output-as-source';
  if (plan.status === 'partner-offline') return 'connect-local-partner';
  if (plan.status === 'local-only') return 'select-workflow-items';
  return 'continue-from-handoff';
}

function handoffTaskPaths(task = {}) {
  const projectId = slug(task.project?.id || 'project');
  const taskId = slug(task.id || `handoff-${Date.now()}`);
  const base = `.gdpro/partner-handoffs/${projectId}`;
  return {
    primaryPath: `${base}/${taskId}.json`,
    latestPath: `${base}/latest.json`,
  };
}

export function buildRuntimeHandoffPlan(runtimeInfo = {}, selectedItems = []) {
  const runtime = runtimeInfo || {};
  const imageConfig = runtime.imageModelConfig || {};
  const operationTypes = unique((selectedItems || []).map(operationType));
  const selectedCount = selectedItems?.length || 0;
  const needsVisualChannel = operationTypes.some((type) => VISUAL_OPERATION_TYPES.has(type));
  const touchesDelivery = operationTypes.some((type) => DELIVERY_OPERATION_TYPES.has(type));
  const partnerReady = runtime.connectionStatus === 'connected';
  const hasPlanningModel = Boolean(runtime.llm);
  const visualConfigured = Boolean(imageConfig.configured);
  const kind = routeKind(imageConfig);
  const canCreateSourceCandidate = visualConfigured && ['source-candidate', 'editable-source'].includes(kind);

  let status = 'ready';
  if (!partnerReady) status = 'partner-offline';
  else if (needsVisualChannel && !visualConfigured) status = 'needs-visual-key';
  else if (needsVisualChannel && kind === 'concept-only') status = 'concept-only';
  else if (!selectedCount) status = 'local-only';

  return {
    schemaVersion: RUNTIME_HANDOFF_SCHEMA_VERSION,
    status,
    selectedCount,
    operationTypes,
    needsVisualChannel,
    touchesDelivery,
    partnerReady,
    canHandOffToPartner: partnerReady,
    canUseVisualChannel: !needsVisualChannel || visualConfigured,
    canCreateSourceCandidate,
    routeKind: kind,
    imageChannel: {
      id: runtime.imageModel || imageConfig.id || '',
      providerId: imageConfig.providerId || '',
      provider: imageConfig.provider || '',
      displayName: imageConfig.displayName || runtime.imageModel || '',
      configured: visualConfigured,
      missingFields: publicMissingFields(imageConfig.missingFields),
    },
    checks: [
      check('partner', partnerReady ? 'ready' : 'attention', partnerReady ? 'connected' : 'offline'),
      check('planning', hasPlanningModel ? 'ready' : 'attention', hasPlanningModel ? 'selected' : 'missing'),
      check(
        'visual',
        !needsVisualChannel ? 'idle' : visualConfigured ? 'ready' : 'attention',
        !needsVisualChannel ? 'not-needed' : visualConfigured ? 'ready' : 'needs-key',
        { missingFields: publicMissingFields(imageConfig.missingFields) },
      ),
      check('delivery', kind === 'concept-only' ? 'attention' : 'ready', kind),
    ],
  };
}

export function buildPartnerHandoffTask({
  project,
  graph,
  runtimeInfo,
  handoffPlan,
  runnableItems,
  operations,
  report,
  auditRecord,
} = {}) {
  const runtime = runtimeInfo || {};
  const plan = handoffPlan || buildRuntimeHandoffPlan(runtime, runnableItems || []);
  const id = `handoff_${report?.id || auditRecord?.id || Date.now()}`;
  const task = {
    schemaVersion: PARTNER_HANDOFF_SCHEMA_VERSION,
    id,
    createdAt: nowIso(),
    queueStatus: handoffQueueStatus(plan),
    nextAction: nextActionCode(plan),
    project: projectSummary(project),
    run: {
      id: report?.id || auditRecord?.id || '',
      label: report?.title || '',
      scopeLabel: report?.scopeLabel || '',
      auditPath: auditRecord?.primaryPath || '',
    },
    partner: {
      env: runtime.agentEnv || 'unknown',
      connectionStatus: runtime.connectionStatus || 'unknown',
      canHandOff: Boolean(plan.canHandOffToPartner),
    },
    planning: {
      model: runtime.llm || '',
    },
    imageChannel: imageChannelSummary(runtime.imageModelConfig, runtime.imageModel),
    handoffPlan: plan,
    graphSnapshot: {
      stats: graph?.stats || {},
      currentNodeCount: graph?.nodes?.length || 0,
      blockers: graph?.stats?.blocked || 0,
      safeOperations: graph?.stats?.safeOperations || 0,
    },
    selectedItems: (runnableItems || []).map(summarizeTaskItem),
    operations: (operations || []).map((operation, index) => ({
      index,
      id: operation?.id || '',
      type: operation?.type || '',
      params: operation?.params || {},
      reason: operation?.reason || '',
    })),
  };

  return {
    ...task,
    ...handoffTaskPaths(task),
  };
}

export function partnerHandoffFiles(task) {
  const derivedPaths = handoffTaskPaths(task);
  const paths = {
    primaryPath: task?.primaryPath || derivedPaths.primaryPath,
    latestPath: task?.latestPath || derivedPaths.latestPath,
  };
  const taskWithPaths = {
    ...task,
    ...paths,
  };
  const content = JSON.stringify(taskWithPaths, null, 2);
  return {
    [paths.primaryPath]: content,
    [paths.latestPath]: content,
  };
}
