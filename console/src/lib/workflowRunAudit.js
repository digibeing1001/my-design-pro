export const WORKFLOW_RUN_AUDIT_SCHEMA_VERSION = 'gdpro.workflow-run-audit.v1';

const SECRET_FIELD_PATTERN = /(api[-_ ]?key|token|secret|authorization|password|credential|access[-_ ]?key)/i;

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

function auditPaths(audit) {
  const projectId = slug(audit?.project?.id || 'project');
  const runId = slug(audit?.id || `run-${Date.now()}`);
  const base = `.gdpro/workflow-runs/${projectId}`;
  return {
    primaryPath: `${base}/${runId}.json`,
    latestPath: `${base}/latest.json`,
  };
}

function redactSecrets(value, parentKey = '') {
  if (SECRET_FIELD_PATTERN.test(parentKey)) {
    return '[redacted]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactSecrets(item, key)]),
    );
  }
  return value;
}

function publicMissingFields(fields = []) {
  return [...new Set((fields || []).map((field) => (
    SECRET_FIELD_PATTERN.test(String(field || ''))
      ? 'provider-authorization'
      : safeText(field)
  )).filter(Boolean))];
}

function summarizeImageModel(config = {}, imageModel = '') {
  const credentials = config.credentials || {};
  const credentialFields = Object.entries(credentials)
    .filter(([, value]) => String(value || '').trim())
    .map(([key]) => key);
  const capabilities = config.capabilities || {};
  return {
    id: imageModel || config.id || '',
    providerId: config.providerId || '',
    provider: config.provider || '',
    displayName: config.displayName || imageModel || '',
    configured: Boolean(config.configured),
    missingFields: publicMissingFields(config.missingFields),
    authorizationStatus: credentialFields.length ? 'present-redacted' : 'missing-or-not-saved',
    authorizationFields: [...new Set(credentialFields.map(() => 'provider-authorization'))],
    model: config.model || '',
    endpoint: {
      baseUrl: config.endpoint?.baseUrl || '',
      service: config.endpoint?.service || '',
    },
    defaults: config.defaults || {},
    deliveryRoute: config.deliveryRoute || null,
    capabilitySummary: {
      role: capabilities.role || '',
      editableSource: Boolean(capabilities.editableSource),
      vectorOutput: Boolean(capabilities.vectorOutput),
      finalDelivery: Boolean(capabilities.finalDelivery),
      textReliability: capabilities.textReliability || '',
    },
  };
}

function summarizeOperationItem(item = {}, index = 0) {
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
      params: redactSecrets(item.operation.params || {}),
      reason: item.operation.reason || '',
    } : null,
  };
}

function summarizeResult(result = {}) {
  return {
    id: result.id || '',
    operationId: result.operationId || '',
    operationType: result.operationType || '',
    status: result.status || '',
    label: result.label || '',
    detail: result.detail || '',
    timestamp: result.timestamp || null,
  };
}

function summarizeProject(project = {}) {
  return {
    id: project.id || '',
    name: project.name || '',
    brandName: project.brandName || project.name || '',
    currentPhase: project.currentPhase || null,
    updatedAt: project.updatedAt || null,
  };
}

function summarizeGraph(graph = {}) {
  const state = graph.state || {};
  return {
    stats: graph.stats || {},
    brandKit: {
      readiness: state.brandConsistencyKit?.readiness ?? null,
      readyForDelivery: Boolean(state.brandConsistencyKit?.readyForDelivery),
      issues: state.brandConsistencyKit?.issues?.length || 0,
    },
    delivery: {
      status: state.deliveryPackage?.status || '',
      ready: Boolean(state.deliveryPackage?.ready),
      readiness: state.deliveryPackage?.readiness ?? null,
      blockers: state.deliveryPackage?.blockers?.length || 0,
    },
    materials: {
      total: state.materialPlan?.stats?.total || state.materialPlan?.materials?.length || 0,
      sourceArtworks: state.materialPlan?.stats?.sourceArtworks || 0,
      exported: state.materialPlan?.stats?.exported || 0,
    },
  };
}

function summarizeOperations(operations = []) {
  return operations.map((operation, index) => ({
    index,
    id: operation?.id || '',
    type: operation?.type || '',
    params: redactSecrets(operation?.params || {}),
    reason: operation?.reason || '',
  }));
}

function summarizeHandoffPlan(plan = null) {
  if (!plan) return null;
  return {
    schemaVersion: plan.schemaVersion || '',
    status: plan.status || '',
    selectedCount: plan.selectedCount || 0,
    operationTypes: plan.operationTypes || [],
    needsVisualChannel: Boolean(plan.needsVisualChannel),
    touchesDelivery: Boolean(plan.touchesDelivery),
    partnerReady: Boolean(plan.partnerReady),
    canHandOffToPartner: Boolean(plan.canHandOffToPartner),
    canUseVisualChannel: Boolean(plan.canUseVisualChannel),
    canCreateSourceCandidate: Boolean(plan.canCreateSourceCandidate),
    routeKind: plan.routeKind || '',
    imageChannel: {
      id: plan.imageChannel?.id || '',
      providerId: plan.imageChannel?.providerId || '',
      provider: plan.imageChannel?.provider || '',
      displayName: plan.imageChannel?.displayName || '',
      configured: Boolean(plan.imageChannel?.configured),
      missingFields: publicMissingFields(plan.imageChannel?.missingFields),
    },
    checks: (plan.checks || []).map((item) => ({
      id: item.id || '',
      state: item.state || '',
      detailCode: item.detailCode || '',
    })),
  };
}

export function buildWorkflowRunAudit({
  project,
  graph,
  plan,
  runtimeInfo,
  runnableItems,
  operations,
  operationResult,
  report,
} = {}) {
  const id = report?.id || `run_${Date.now()}`;
  const audit = {
    schemaVersion: WORKFLOW_RUN_AUDIT_SCHEMA_VERSION,
    id,
    createdAt: nowIso(),
    project: summarizeProject(project),
    scope: {
      label: plan?.scopeLabel || report?.scopeLabel || '',
      runLabel: plan?.label || report?.title || '',
      selectedCount: runnableItems?.length || 0,
    },
    runtime: {
      agentEnv: runtimeInfo?.agentEnv || 'unknown',
      connectionStatus: runtimeInfo?.connectionStatus || 'unknown',
      llm: runtimeInfo?.llm || '',
      imageModel: summarizeImageModel(runtimeInfo?.imageModelConfig, runtimeInfo?.imageModel),
      handoffPlan: summarizeHandoffPlan(runtimeInfo?.handoffPlan),
    },
    graph: summarizeGraph(graph),
    requestedItems: (runnableItems || []).map(summarizeOperationItem),
    operations: summarizeOperations(operations || []),
    results: (operationResult?.results || []).map(summarizeResult),
    changedKeys: operationResult?.changedKeys || [],
    report: {
      id: report?.id || id,
      title: report?.title || '',
      summary: report?.summary || {},
      hasIssues: Boolean(report?.hasIssues),
    },
  };
  return {
    ...audit,
    ...auditPaths(audit),
  };
}

export function workflowRunAuditFiles(audit) {
  const paths = {
    ...auditPaths(audit),
    primaryPath: audit?.primaryPath || auditPaths(audit).primaryPath,
    latestPath: audit?.latestPath || auditPaths(audit).latestPath,
  };
  const auditWithPaths = {
    ...audit,
    ...paths,
  };
  const content = JSON.stringify(auditWithPaths, null, 2);
  return {
    [paths.primaryPath]: content,
    [paths.latestPath]: content,
  };
}
