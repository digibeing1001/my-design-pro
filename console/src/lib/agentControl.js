import {
  getOutputPathForPhase,
  resolvePhaseTransition,
  syncWorkflowWithPhase,
} from './phaseStateMachine';
import { BRAND_ASSET_MANIFEST_SCHEMA_VERSION } from './brandAssetManifest';
import { MATERIAL_PRODUCTION_SCHEMA_VERSION } from './materialProduction';
import { PREFLIGHT_REVIEW_SCHEMA_VERSION } from './preflightReview';
import { DELIVERY_PACKAGE_SCHEMA_VERSION } from './deliveryPackage';
import { applyAgentOperations, collectAgentOperations } from './agentOperations';

export const AGENT_CONTROL_SCHEMA_VERSION = 'gdpro.agent-control.v1';

const DOCUMENT_TITLES = {
  brief: '需求档案',
  philosophy: '设计哲学',
  strategy: '品牌战略',
  materialSpec: '物料规格',
  audit: '审查报告',
  critique: '设计评审',
  handoff: '交付说明',
  viManual: 'VI 规范手册',
  deliveryManifest: '交付物文件清单',
};

const STRUCTURED_DOC_MAP = {
  design_philosophy: 'philosophy',
  compliance_report: 'audit',
  critique: 'critique',
  vi_manual: 'viManual',
};

function now() {
  return Date.now();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isValidPhase(value) {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

function clampPhase(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const phase = Math.trunc(n);
  return isValidPhase(phase) ? phase : null;
}

function stringifyContent(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeDocument(key, value, phase) {
  if (!value) return null;
  if (typeof value === 'string') {
    return {
      title: DOCUMENT_TITLES[key] || key,
      content: value,
      phase,
      adoptedAt: now(),
      source: 'agent-control',
    };
  }

  const doc = asObject(value);
  const content = doc.content ?? doc.markdown ?? doc.text ?? doc.summary ?? doc.data;
  if (content == null) return null;

  return {
    title: doc.title || DOCUMENT_TITLES[key] || key,
    content: stringifyContent(content),
    phase: clampPhase(doc.phase) || phase,
    adoptedAt: doc.adoptedAt || now(),
    source: doc.source || 'agent-control',
    status: doc.status || 'locked',
    metadata: doc.metadata || undefined,
  };
}

function normalizeColors(colors) {
  if (!Array.isArray(colors)) return [];
  return colors
    .map((color) => {
      if (typeof color === 'string') return { name: color, hex: color };
      const c = asObject(color);
      const hex = c.hex || c.color || c.value;
      if (!hex) return null;
      return {
        name: c.name || c.label || hex,
        hex,
        usage: c.usage || c.role || c.note || '',
      };
    })
    .filter(Boolean);
}

function colorsFromStructuredData(data = {}) {
  const groups = ['primary', 'secondary', 'accent', 'neutrals'];
  return groups.flatMap((key) => {
    const colors = normalizeColors(data[key]);
    return colors.map((color) => ({
      ...color,
      usage: color.usage || {
        primary: '主色',
        secondary: '辅助色',
        accent: '强调色',
        neutrals: '中性色',
      }[key],
    }));
  });
}

function getControlPayload(response = {}) {
  return asObject(
    response.agentControl ||
    response.control ||
    response.workflowControl ||
    response._control
  );
}

function getProjectPatch(response = {}, control = {}) {
  return asObject(response.projectPatch || control.projectPatch);
}

function pickPhase(response = {}, control = {}, action) {
  const patch = getProjectPatch(response, control);
  const phaseSpec = response.phaseChange || control.phase || control.phaseChange || patch.phase || patch.currentPhase;
  const candidates = [];

  if (typeof phaseSpec === 'number' || typeof phaseSpec === 'string') {
    candidates.push(phaseSpec);
  } else if (phaseSpec && typeof phaseSpec === 'object') {
    candidates.push(phaseSpec.to, phaseSpec.current, phaseSpec.next, phaseSpec.phase);
  }

  candidates.push(response.currentPhase);
  candidates.push(response.phase);
  if (control.currentPhase != null) candidates.push(control.currentPhase);

  for (const candidate of candidates) {
    const phase = clampPhase(candidate);
    if (phase) return phase;
  }
  return null;
}

function buildDocuments(response = {}, control = {}, phase) {
  const patch = getProjectPatch(response, control);
  const sources = [
    asObject(response.documents),
    asObject(control.documents),
    asObject(patch.documents),
  ];
  const documents = {};

  sources.forEach((source) => {
    Object.entries(source).forEach(([key, value]) => {
      const doc = normalizeDocument(key, value, phase);
      if (doc) documents[key] = doc;
    });
  });

  const skillData = response._skillData;
  const docKey = STRUCTURED_DOC_MAP[skillData?.type];
  if (docKey && skillData?.data) {
    const title = DOCUMENT_TITLES[docKey] || docKey;
    documents[docKey] = {
      title,
      content: stringifyContent(skillData.data),
      phase,
      adoptedAt: now(),
      source: `structured-output:${skillData.type}`,
      status: 'locked',
    };
  }

  return documents;
}

function buildBrandKit(response = {}, control = {}) {
  const patch = getProjectPatch(response, control);
  const brandKit = {
    ...asObject(response.brandKit),
    ...asObject(control.brandKit),
    ...asObject(patch.brandKit),
  };

  const skillData = response._skillData;
  if (skillData?.type === 'design_philosophy' && skillData.data) {
    const data = skillData.data;
    brandKit.philosophy = data.name || data.statement || brandKit.philosophy;
    brandKit.philosophyStatement = data.statement || brandKit.philosophyStatement;
    brandKit.visualDna = data.dna || brandKit.visualDna;
  }

  if (skillData?.type === 'color_system' && skillData.data) {
    brandKit.colors = colorsFromStructuredData(skillData.data);
  } else if (brandKit.colors) {
    brandKit.colors = normalizeColors(brandKit.colors);
  }

  if (brandKit.typography && typeof brandKit.typography !== 'object') {
    brandKit.typography = { display: String(brandKit.typography) };
  }

  return brandKit;
}

function buildWorkflow(response = {}, control = {}, phase) {
  const patch = getProjectPatch(response, control);
  const workflow = {
    ...asObject(response.workflow),
    ...asObject(control.workflow),
    ...asObject(patch.workflow),
  };

  if (phase) {
    workflow.outputPath = getOutputPathForPhase(phase).id;
  }

  const tasks = response.skillTasks || control.tasks || workflow.tasks;
  if (Array.isArray(tasks)) {
    workflow.tasks = tasks.map((task) => (
      typeof task === 'string'
        ? { text: task, done: false }
        : { text: task.text || task.label || '未命名任务', done: Boolean(task.done), ...task }
    ));
  }

  return workflow;
}

function buildAssetManifest(response = {}, control = {}) {
  const patch = getProjectPatch(response, control);
  const manifest = {
    ...asObject(response.assetManifest),
    ...asObject(control.assetManifest),
    ...asObject(patch.assetManifest),
  };

  if (!Object.keys(manifest).length) return {};

  return {
    schemaVersion: manifest.schemaVersion || BRAND_ASSET_MANIFEST_SCHEMA_VERSION,
    source: manifest.source || 'agent-control',
    ...manifest,
  };
}

function buildMaterialProduction(response = {}, control = {}) {
  const patch = getProjectPatch(response, control);
  const production = {
    ...asObject(response.materialProduction),
    ...asObject(control.materialProduction),
    ...asObject(patch.materialProduction),
  };

  if (!Object.keys(production).length) return {};

  return {
    schemaVersion: production.schemaVersion || MATERIAL_PRODUCTION_SCHEMA_VERSION,
    source: production.source || 'agent-control',
    ...production,
  };
}

function buildPreflightReview(response = {}, control = {}) {
  const patch = getProjectPatch(response, control);
  const review = {
    ...asObject(response.preflightReview),
    ...asObject(control.preflightReview),
    ...asObject(patch.preflightReview),
  };

  if (!Object.keys(review).length) return {};

  return {
    schemaVersion: review.schemaVersion || PREFLIGHT_REVIEW_SCHEMA_VERSION,
    source: review.source || 'agent-control',
    ...review,
  };
}

function buildDeliveryPackage(response = {}, control = {}) {
  const patch = getProjectPatch(response, control);
  const deliveryPackage = {
    ...asObject(response.deliveryPackage),
    ...asObject(control.deliveryPackage),
    ...asObject(patch.deliveryPackage),
  };

  if (!Object.keys(deliveryPackage).length) return {};

  return {
    schemaVersion: deliveryPackage.schemaVersion || DELIVERY_PACKAGE_SCHEMA_VERSION,
    source: deliveryPackage.source || 'agent-control',
    ...deliveryPackage,
  };
}

function normalizeRisks(response = {}, control = {}) {
  const risks = response.risks || control.risks || control.consistencyRisks;
  if (!Array.isArray(risks)) return [];

  return risks.map((risk, index) => {
    if (typeof risk === 'string') {
      return {
        id: `risk_${index + 1}`,
        level: 'medium',
        title: risk,
        detail: '',
      };
    }
    return {
      id: risk.id || `risk_${index + 1}`,
      level: risk.level || risk.severity || 'medium',
      title: risk.title || risk.label || '未命名风险',
      detail: risk.detail || risk.description || risk.remediation || '',
      ruleRef: risk.ruleRef,
    };
  });
}

function buildControlEvents(response = {}, control = {}, action, changedKeys) {
  const events = [];
  const sourceEvents = response.events || control.events;

  if (Array.isArray(sourceEvents)) {
    sourceEvents.forEach((event) => {
      if (typeof event === 'string') {
        events.push({ type: 'note', label: event });
      } else if (event && typeof event === 'object') {
        events.push({
          type: event.type || 'note',
          label: event.label || event.title || event.type || 'Workspace event',
          detail: event.detail || event.description || '',
        });
      }
    });
  }

  if (changedKeys.length) {
    events.unshift({
      type: action || 'agent_response',
      label: `Workspace updated ${changedKeys.join(', ')}`,
      detail: response.text?.slice?.(0, 160) || '',
    });
  }

  return events.map((event) => ({
    id: `evt_${now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now(),
    source: 'agent-control',
    ...event,
  }));
}

export function applyAgentControl(project, response = {}, { action } = {}) {
  if (!project || !response || typeof response !== 'object') {
    return { project, changed: false, events: [] };
  }

  const control = getControlPayload(response);
  const patch = getProjectPatch(response, control);
  const nextProject = {
    ...project,
    documents: { ...(project.documents || {}) },
    brandKit: { ...(project.brandKit || {}) },
    workflow: { ...(project.workflow || {}) },
    control: { ...(project.control || {}) },
    assetManifest: project.assetManifest ? { ...project.assetManifest } : undefined,
    materialProduction: project.materialProduction ? { ...project.materialProduction } : undefined,
    preflightReview: project.preflightReview ? { ...project.preflightReview } : undefined,
    deliveryPackage: project.deliveryPackage ? { ...project.deliveryPackage } : undefined,
  };
  const changedKeys = [];

  const requestedPhase = pickPhase(response, control, action);
  const phase = nextProject.currentPhase || project.currentPhase || 1;
  const documents = buildDocuments(response, control, phase);
  if (Object.keys(documents).length) {
    nextProject.documents = { ...nextProject.documents, ...documents };
    changedKeys.push('documents');
  }

  const brandKit = buildBrandKit(response, control);
  if (Object.keys(brandKit).length) {
    nextProject.brandKit = {
      ...nextProject.brandKit,
      ...brandKit,
      typography: {
        ...(nextProject.brandKit.typography || {}),
        ...(brandKit.typography || {}),
      },
    };
    changedKeys.push('brandKit');
  }

  if (patch.status) {
    nextProject.status = patch.status;
    changedKeys.push('status');
  }

  const assetManifest = buildAssetManifest(response, control);
  if (Object.keys(assetManifest).length) {
    nextProject.assetManifest = {
      ...(nextProject.assetManifest || {}),
      ...assetManifest,
    };
    changedKeys.push('assetManifest');
  }

  const materialProduction = buildMaterialProduction(response, control);
  if (Object.keys(materialProduction).length) {
    nextProject.materialProduction = {
      ...(nextProject.materialProduction || {}),
      ...materialProduction,
    };
    changedKeys.push('materialProduction');
  }

  const preflightReview = buildPreflightReview(response, control);
  if (Object.keys(preflightReview).length) {
    nextProject.preflightReview = {
      ...(nextProject.preflightReview || {}),
      ...preflightReview,
    };
    changedKeys.push('preflightReview');
  }

  const deliveryPackage = buildDeliveryPackage(response, control);
  if (Object.keys(deliveryPackage).length) {
    nextProject.deliveryPackage = {
      ...(nextProject.deliveryPackage || {}),
      ...deliveryPackage,
    };
    changedKeys.push('deliveryPackage');
  }

  const operations = collectAgentOperations(response, control, patch);
  const operationResult = operations.length
    ? applyAgentOperations(nextProject, operations, { action })
    : { project: nextProject, changed: false, changedKeys: [], events: [], risks: [], results: [] };
  if (operationResult.changed) {
    Object.assign(nextProject, operationResult.project);
    operationResult.changedKeys.forEach((key) => {
      if (!changedKeys.includes(key)) changedKeys.push(key);
    });
  }

  const phaseTransition = requestedPhase
    ? resolvePhaseTransition(nextProject, requestedPhase, { action })
    : null;

  if (phaseTransition?.allowed && phaseTransition.phase !== nextProject.currentPhase) {
    nextProject.currentPhase = phaseTransition.phase;
    changedKeys.push('phase');
  }

  const workflow = buildWorkflow(response, control, nextProject.currentPhase);
  if (Object.keys(workflow).length) {
    nextProject.workflow = { ...nextProject.workflow, ...workflow };
    changedKeys.push('workflow');
  }

  const syncedWorkflow = syncWorkflowWithPhase(nextProject);
  if (syncedWorkflow.changed) {
    nextProject.workflow = syncedWorkflow.workflow;
    if (!changedKeys.includes('workflow')) changedKeys.push('workflow');
  }

  const transitionRisks = phaseTransition?.risk ? [phaseTransition.risk] : [];
  const transitionEvents = phaseTransition?.event ? [phaseTransition.event] : [];
  const risks = [...normalizeRisks(response, control), ...operationResult.risks, ...transitionRisks];
  const events = [
    ...operationResult.events,
    ...transitionEvents.map((event) => ({
      id: `evt_${now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now(),
      source: 'phase-state-machine',
      ...event,
    })),
    ...buildControlEvents(response, control, action, changedKeys),
  ];
  if (risks.length || events.length) {
    nextProject.control = {
      ...nextProject.control,
      schemaVersion: AGENT_CONTROL_SCHEMA_VERSION,
      risks: risks.length ? risks : nextProject.control.risks || [],
      operationResults: operationResult.results?.length
        ? [...operationResult.results, ...(nextProject.control.operationResults || [])].slice(0, 30)
        : nextProject.control.operationResults || [],
      lastAction: action || control.action || 'agent_response',
      lastUpdatedAt: now(),
      events: [...events, ...(nextProject.control.events || [])].slice(0, 40),
    };
    if (!changedKeys.includes('control')) changedKeys.push('control');
  }

  if (changedKeys.length) {
    nextProject.updatedAt = now();
  }

  return {
    project: nextProject,
    changed: changedKeys.length > 0,
    changedKeys,
    events,
  };
}
