import {
  addMaterialToProduction,
  createMaterialSpecDocument,
  MATERIAL_STATUSES,
  MATERIAL_TEMPLATES,
  refreshMaterialManifestRefs,
  refreshMaterialSpecDocument,
  updateMaterialStatus,
} from './materialProduction';
import { createLockedBrandAssetManifest, buildBrandAssetManifest } from './brandAssetManifest';
import { runPreflightReview } from './preflightReview';
import { createDeliveryPackage } from './deliveryPackage';
import { resolvePhaseTransition } from './phaseStateMachine';
import { generateAllMaterialArtwork, generateMaterialArtwork } from './materialArtwork';
import { auditMaterialArtwork } from './artworkQuality';
import { buildReviewBoard, recordReviewDecision, REVIEW_DECISIONS } from './reviewBoard';
import { buildDesignBriefContract, compileDesignBriefContract } from './designBriefContract';

export const AGENT_OPERATIONS_SCHEMA_VERSION = 'gdpro.agent-operations.v1';

export const AGENT_OPERATION_TYPES = [
  'lock_asset_manifest',
  'compile_design_brief_contract',
  'add_material',
  'generate_material_artwork',
  'refresh_material_manifest_refs',
  'refresh_material_spec',
  'set_material_status',
  'run_preflight_review',
  'create_delivery_package',
  'record_review_decision',
  'request_phase_transition',
];

const OPERATION_ALIASES = {
  lockManifest: 'lock_asset_manifest',
  lock_manifest: 'lock_asset_manifest',
  lockAssetManifest: 'lock_asset_manifest',
  compileDesignBriefContract: 'compile_design_brief_contract',
  compile_brief_contract: 'compile_design_brief_contract',
  lock_design_brief_contract: 'compile_design_brief_contract',
  addMaterial: 'add_material',
  add_material_to_production: 'add_material',
  generateMaterialArtwork: 'generate_material_artwork',
  generate_material_source: 'generate_material_artwork',
  generate_all_material_artwork: 'generate_material_artwork',
  refreshMaterialManifestRefs: 'refresh_material_manifest_refs',
  refresh_material_refs: 'refresh_material_manifest_refs',
  refreshMaterialSpec: 'refresh_material_spec',
  refresh_material_spec_document: 'refresh_material_spec',
  setMaterialStatus: 'set_material_status',
  update_material_status: 'set_material_status',
  runPreflight: 'run_preflight_review',
  run_preflight: 'run_preflight_review',
  createDeliveryPackage: 'create_delivery_package',
  generate_delivery_package: 'create_delivery_package',
  recordReviewDecision: 'record_review_decision',
  approve_review_item: 'record_review_decision',
  review_decision: 'record_review_decision',
  advancePhase: 'request_phase_transition',
  requestPhaseTransition: 'request_phase_transition',
  request_phase: 'request_phase_transition',
};

const OPERATION_ORDER = {
  compile_design_brief_contract: 10,
  lock_asset_manifest: 20,
  add_material: 30,
  generate_material_artwork: 40,
  refresh_material_manifest_refs: 50,
  set_material_status: 60,
  refresh_material_spec: 70,
  run_preflight_review: 80,
  create_delivery_package: 90,
  record_review_decision: 100,
  request_phase_transition: 110,
};

function now() {
  return Date.now();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeType(value) {
  const raw = String(value || '').trim();
  return OPERATION_ALIASES[raw] || raw;
}

function normalizeOperation(value, index = 0) {
  if (!value) return null;
  if (typeof value === 'string') {
    return {
      id: `op_${index + 1}`,
      type: normalizeType(value),
      params: {},
      reason: '',
    };
  }

  const op = asObject(value);
  const type = normalizeType(op.type || op.action || op.command || op.name);
  if (!type) return null;

  return {
    id: op.id || `op_${index + 1}`,
    type,
    params: {
      ...asObject(op.params),
      ...asObject(op.payload),
    },
    reason: op.reason || op.description || '',
    requiresConfirmation: Boolean(op.requiresConfirmation || op.confirm),
  };
}

export function collectAgentOperations(response = {}, control = {}, patch = {}) {
  const operationSources = [
    response.operations,
    response.commands,
    response.guiOperations,
    control.operations,
    control.commands,
    control.guiOperations,
    patch.operations,
    patch.commands,
  ];

  return operationSources
    .filter(Array.isArray)
    .flat()
    .map(normalizeOperation)
    .filter(Boolean);
}

function result(operation, status, label, detail = '', patch = {}) {
  return {
    id: `opres_${now()}_${Math.random().toString(36).slice(2, 7)}`,
    operationId: operation.id,
    operationType: operation.type,
    status,
    label,
    detail,
    timestamp: now(),
    ...patch,
  };
}

function eventFromResult(item) {
  return {
    id: `evt_${now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now(),
    source: 'agent-operation',
    type: `operation-${item.status}`,
    label: item.label,
    detail: item.detail,
    operationId: item.operationId,
    operationType: item.operationType,
  };
}

function riskFromResult(item) {
  if (!['blocked', 'rejected', 'failed'].includes(item.status)) return null;
  return {
    id: `operation-${item.operationType}-${item.operationId}`,
    level: item.status === 'failed' ? 'critical' : 'high',
    title: `Operation ${item.status}: ${item.operationType}`,
    detail: item.detail || item.label,
    ruleRef: 'agentOperation.whitelist',
  };
}

function findMaterial(project, params = {}) {
  const materials = project?.materialProduction?.materials || [];
  if (params.materialId) {
    return materials.find((material) => material.id === params.materialId);
  }
  if (params.materialName) {
    return materials.find((material) => material.name === params.materialName);
  }
  if (materials.length === 1) return materials[0];
  return null;
}

function getRequestedPhase(params = {}) {
  const candidate = params.to ?? params.phase ?? params.nextPhase ?? params.currentPhase;
  const n = Number(candidate);
  if (!Number.isFinite(n)) return null;
  const phase = Math.trunc(n);
  return phase >= 1 && phase <= 6 ? phase : null;
}

function applyOperation(project, operation, options = {}) {
  if (operation.requiresConfirmation) {
    return {
      project,
      changedKeys: [],
      result: result(operation, 'rejected', '需要人工确认', '这项处理需要确认，工作台已暂停。'),
    };
  }

  const params = operation.params || {};

  switch (operation.type) {
    case 'lock_asset_manifest': {
      const manifest = buildBrandAssetManifest(project);
      if (!manifest.productionReady) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '品牌资产清单无法锁定', `缺少：${manifest.missing.map((item) => item.label).join('、') || '可生产的品牌资产'}。`),
        };
      }

      return {
        project: {
          ...project,
          assetManifest: createLockedBrandAssetManifest(project, { lockedBy: 'agent-operation' }),
          updatedAt: now(),
        },
        changedKeys: ['assetManifest'],
        result: result(operation, 'applied', '品牌资产清单已锁定', operation.reason || '已基于当前项目状态创建锁定快照。'),
      };
    }

    case 'compile_design_brief_contract': {
      const contract = buildDesignBriefContract(project);
      const blocking = contract.violations.filter((item) => ['critical', 'high'].includes(item.severity));
      if (blocking.length) {
        return {
          project,
          changedKeys: [],
          result: result(
            operation,
            'blocked',
            '需求约定书无法锁定',
            blocking.map((item) => item.title).join('、') || '约定证据不完整。',
          ),
        };
      }

      return {
        project: compileDesignBriefContract(project, { lockedBy: 'agent-operation' }),
        changedKeys: ['control', 'documents'],
        result: result(operation, 'applied', '需求约定书已锁定', operation.reason || '需求、品牌规范和目标物料已锁定为工作台可读取的约定。'),
      };
    }

    case 'add_material': {
      const templateId = params.templateId || params.template || params.id;
      const template = MATERIAL_TEMPLATES.find((item) => item.id === templateId);
      if (!template) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '未找到物料模板', `未知模板：${templateId || '缺失'}。`),
        };
      }
      const manifest = buildBrandAssetManifest(project);
      if (!manifest.locked) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '品牌资产未锁定，无法添加物料', '请先锁定品牌资产清单。'),
        };
      }

      return {
        project: addMaterialToProduction(project, template.id),
        changedKeys: ['materialProduction', 'documents'],
        result: result(operation, 'applied', `已添加物料：${template.name}`, operation.reason || template.name),
      };
    }

    case 'set_material_status': {
      const status = params.status;
      if (!MATERIAL_STATUSES.includes(status)) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '物料状态无效', '请选择可用的物料状态。'),
        };
      }
      const material = findMaterial(project, params);
      if (!material) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '未找到物料', '请提供有效物料，或只保留一项物料后再处理。'),
        };
      }
      if (status === 'exported') {
        const artworkAudit = auditMaterialArtwork(project, material);
        const issueDetail = artworkAudit.issues
          .slice(0, 3)
          .map((item) => item.label)
          .join(', ');
        if (!artworkAudit.passed) {
          return {
            project,
            changedKeys: [],
            result: result(
              operation,
              'blocked',
              '源稿检查通过前不能导出',
              issueDetail || `${material.name} 源稿尚未达到商用导出要求。`,
            ),
          };
        }
      }

      return {
        project: updateMaterialStatus(project, material.id, status),
        changedKeys: ['materialProduction', 'documents'],
        result: result(operation, 'applied', `${material.name} 状态已更新`, operation.reason || material.name),
      };
    }

    case 'generate_material_artwork': {
      const materials = project?.materialProduction?.materials || [];
      if (!materials.length) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '没有可制作的物料', '请先创建物料，再制作源稿。'),
        };
      }
      const material = findMaterial(project, params);
      const nextProject = material
        ? generateMaterialArtwork(project, material.id)
        : generateAllMaterialArtwork(project);
      const documentedProject = {
        ...nextProject,
        documents: {
          ...(nextProject.documents || {}),
          materialSpec: createMaterialSpecDocument(nextProject),
        },
      };

      return {
        project: documentedProject,
        changedKeys: ['materialProduction', 'documents'],
        result: result(operation, 'applied', material ? `已制作源稿：${material.name}` : '已制作所有物料源稿', operation.reason || '已创建可编辑矢量源稿。'),
      };
    }

    case 'refresh_material_manifest_refs': {
      const manifest = buildBrandAssetManifest(project);
      if (!manifest.locked) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '品牌资产未锁定，无法刷新引用', '请先锁定品牌资产清单。'),
        };
      }
      const material = params.materialId || params.materialName ? findMaterial(project, params) : null;
      if ((params.materialId || params.materialName) && !material) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '未找到物料', '请提供有效物料。'),
        };
      }

      return {
        project: refreshMaterialManifestRefs(project, material?.id || null),
        changedKeys: ['materialProduction', 'documents'],
        result: result(operation, 'applied', material ? `已刷新品牌引用：${material.name}` : '已刷新所有物料品牌引用', operation.reason || '已基于当前锁定清单重建物料引用。'),
      };
    }

    case 'refresh_material_spec': {
      return {
        project: refreshMaterialSpecDocument(project),
        changedKeys: ['documents'],
        result: result(operation, 'applied', 'VI 物料生产规格已刷新', operation.reason || '已基于当前物料清单重建规格文档。'),
      };
    }

    case 'run_preflight_review': {
      return {
        project: runPreflightReview(project),
        changedKeys: ['preflightReview', 'documents'],
        result: result(operation, 'applied', '交付前检查已完成', operation.reason || '已整理审查报告和审查状态。'),
      };
    }

    case 'create_delivery_package': {
      return {
        project: createDeliveryPackage(project),
        changedKeys: ['deliveryPackage', 'documents'],
        result: result(operation, 'applied', '交付包已完成', operation.reason || '已整理 VI 手册、维护说明和交付清单。'),
      };
    }

    case 'record_review_decision': {
      const targetId = params.targetId || params.id;
      const decision = params.decision || 'approved';
      if (!targetId || !REVIEW_DECISIONS.includes(decision)) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '签收决定无效', '请提供有效的签收对象和决定。'),
        };
      }
      const board = buildReviewBoard(project);
      const item = board.items.find((entry) => entry.targetId === targetId);
      if (!item) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '未找到签收对象', targetId),
        };
      }
      if (item.status === 'blocked' && ['approved', 'accepted_risk'].includes(decision)) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '阻断项不能批准', `${item.label}: ${item.detail}`),
        };
      }

      return {
        project: recordReviewDecision(project, {
          targetId,
          decision,
          note: params.note || operation.reason || '',
          reviewer: params.reviewer || 'agent-operation',
          reviewerRole: params.reviewerRole || 'design-director',
        }),
        changedKeys: ['control'],
        result: result(operation, 'applied', `已记录签收决定：${item.label}`, params.note || ''),
      };
    }

    case 'request_phase_transition': {
      const phase = getRequestedPhase(params);
      if (!phase) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', '阶段推进目标无效', '请选择 1 到 6 之间的阶段。'),
        };
      }
      const transition = resolvePhaseTransition(project, phase, { action: options.action || 'agent_operation' });
      if (!transition.allowed) {
        return {
          project,
          changedKeys: [],
          result: result(operation, 'blocked', `阶段推进受阻：${project.currentPhase || 1} -> ${phase}`, transition.reason || '阶段检查未允许推进。', {
            gate: transition.gate,
          }),
        };
      }
      if (transition.noop) {
        return {
          project,
          changedKeys: [],
        result: result(operation, 'skipped', `已在第 ${phase} 阶段`, transition.reason || ''),
        };
      }
      return {
        project: {
          ...project,
          currentPhase: transition.phase,
          updatedAt: now(),
        },
        changedKeys: ['phase'],
        result: result(operation, 'applied', `已推进到第 ${transition.phase} 阶段`, transition.event?.detail || operation.reason || ''),
      };
    }

    default:
      return {
        project,
        changedKeys: [],
        result: result(operation, 'rejected', '未知处理项', '工作台暂不支持这项处理。'),
      };
  }
}

export function applyAgentOperations(project, operations = [], options = {}) {
  let nextProject = project;
  const results = [];
  const changedKeys = new Set();

  [...operations]
    .map((operation, index) => ({ operation, index }))
    .sort((a, b) => {
      const left = OPERATION_ORDER[normalizeType(a.operation?.type)] ?? 999;
      const right = OPERATION_ORDER[normalizeType(b.operation?.type)] ?? 999;
      return left - right || a.index - b.index;
    })
    .forEach(({ operation }) => {
      const applied = applyOperation(nextProject, operation, options);
      nextProject = applied.project;
      results.push(applied.result);
      applied.changedKeys.forEach((key) => changedKeys.add(key));
    });

  return {
    project: nextProject,
    changed: changedKeys.size > 0,
    changedKeys: [...changedKeys],
    results,
    events: results.map(eventFromResult),
    risks: results.map(riskFromResult).filter(Boolean),
  };
}
