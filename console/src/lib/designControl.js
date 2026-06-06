import {
  evaluatePhaseGate,
  getOutputPathForPhase,
  getProjectAssets,
  getRequiredLocks,
} from './phaseStateMachine';
import { buildBrandAssetManifest } from './brandAssetManifest';
import { buildDeliveryPackage } from './deliveryPackage';
import { AGENT_OPERATION_TYPES } from './agentOperations';
import { buildProductionRepairQueue } from './productionRepairQueue';
import { buildReviewBoard } from './reviewBoard';
import { buildDesignScorecard } from './designScorecard';
import { buildDesignBriefContract } from './designBriefContract';
import { buildProductionImpactMatrix } from './productionImpact';
import { buildBrandConsistencyKit } from './brandConsistencyKit';

function buildRisks(project, phaseState) {
  const phase = project?.currentPhase || 1;
  const assets = getProjectAssets(project);
  const adopted = assets.filter((asset) => asset.status === 'adopted');
  const risks = [];

  const agentRisks = Array.isArray(project?.control?.risks) ? project.control.risks : [];
  agentRisks.forEach((risk) => {
    risks.push({
      id: risk.id || `agent-${risks.length + 1}`,
      level: risk.level || risk.severity || 'medium',
      title: risk.title || risk.label || '工作流风险',
      detail: risk.detail || risk.description || '',
      ruleRef: risk.ruleRef,
      source: risk.source || 'agent',
    });
  });

  if (phaseState.missingLocks.length) {
    risks.push({
      id: 'missing-locks',
      level: 'critical',
      title: '锁定项不足',
      detail: `缺少 ${phaseState.missingLocks.map((lock) => lock.label).join('、')}，继续创作会放大一致性漂移。`,
      ruleRef: 'phase.locks.required',
    });
  }

  if (phaseState.blockingGates.length) {
    risks.push({
      id: 'gate-blocked',
      level: 'critical',
      title: '阶段门禁未通过',
      detail: `${phaseState.blockingGates.length} 个阻断项未完成：${phaseState.blockingGates.map((gate) => gate.label).join('、')}。`,
      ruleRef: 'phase.gates.blocking',
    });
  }

  if (phase >= 3 && phaseState.manifest && !phaseState.manifest.locked) {
    risks.push({
      id: phaseState.manifest.stale ? 'manifest-stale' : 'manifest-unlocked',
      level: 'critical',
      title: phaseState.manifest.stale ? '品牌资产清单有变更' : '品牌资产清单未锁定',
      detail: phaseState.manifest.stale
        ? 'Logo、颜色、字体或基础素材有变化，需要重新锁定品牌资产清单后再进入物料生产。'
        : `还缺少或未锁定 ${phaseState.manifest.missing.map((item) => item.label).join('、') || '生产资产清单'}。`,
      ruleRef: 'assetManifest.locked',
    });
  }

  if (phase >= 3 && phaseState.designBriefContract && !phaseState.designBriefContract.locked) {
    risks.push({
      id: phaseState.designBriefContract.stale ? 'brief-contract-stale' : 'brief-contract-unlocked',
      level: phaseState.designBriefContract.stats.critical ? 'critical' : 'high',
      title: phaseState.designBriefContract.stale ? 'Design Brief Contract 已过期' : 'Design Brief Contract 未编译',
      detail: phaseState.designBriefContract.violations.map((item) => item.title).join('、') || '需要先把需求、品牌 token 和物料目标编译成工作台可读取的合同。',
      ruleRef: 'designBriefContract.locked',
    });
  }

  if (phase >= 4 && phaseState.materialPlan?.blockers?.length) {
    risks.push({
      id: 'material-plan-blocked',
      level: 'critical',
      title: '物料生产计划未就绪',
      detail: phaseState.materialPlan.blockers.map((blocker) => blocker.title).join('、'),
      ruleRef: 'materialProduction.ready',
    });
  }

  if (phase >= 5 && phaseState.preflightReview?.issues?.length) {
    phaseState.preflightReview.issues.slice(0, 4).forEach((item) => {
      risks.push({
        id: `preflight-${item.id}`,
        level: item.severity === 'critical' ? 'critical' : item.severity === 'high' ? 'high' : 'medium',
        title: item.title,
        detail: item.detail,
        ruleRef: `preflight.${item.category}`,
      });
    });
  }

  if (phase >= 6 && phaseState.deliveryPackage?.blockers?.length) {
    phaseState.deliveryPackage.blockers.slice(0, 4).forEach((item) => {
      risks.push({
        id: `delivery-${item.id}`,
        level: item.level === 'critical' ? 'critical' : item.level === 'high' ? 'high' : 'medium',
        title: item.title,
        detail: item.detail,
        ruleRef: 'deliveryPackage.ready',
      });
    });
  }

  if (phase >= 4 && !adopted.some((asset) => asset.category === 'logo')) {
    risks.push({
      id: 'logo-missing',
      level: 'critical',
      title: 'Logo 未采纳',
      detail: '物料扩展前必须有可复用 Logo 主资产，禁止让模型每张图重新画。',
      ruleRef: 'assets.logo.reuse',
    });
  }

  if (phase >= 4 && adopted.length > 0 && adopted.length < 3) {
    risks.push({
      id: 'reuse-weak',
      level: 'high',
      title: '复用资产偏少',
      detail: '建议先沉淀 Logo、辅助图形、品牌文字或核心纹理，再批量扩展物料。',
      ruleRef: 'assets.reuse.minimum',
    });
  }

  if (phase === 3 && assets.some((asset) => asset.source === 'ai-generated' && asset.status === 'adopted')) {
    risks.push({
      id: 'ai-adopted',
      level: 'medium',
      title: '概念图已采纳',
      detail: '采纳后需要转成确定性资产或明确仅作 mood reference，避免用于最终排版。',
      ruleRef: 'generation.ai.boundary',
    });
  }

  if (!risks.length) {
    risks.push({
      id: 'stable',
      level: 'info',
      title: '控制面稳定',
      detail: '当前阶段没有明显阻断项，可以继续推进并保持用户确认节奏。',
    });
  }

  return risks;
}

function getRiskLevel(risks) {
  if (risks.some((risk) => risk.level === 'critical')) return 'critical';
  if (risks.some((risk) => risk.level === 'high')) return 'high';
  if (risks.some((risk) => risk.level === 'medium')) return 'medium';
  return 'stable';
}

export function buildDesignControlState(project) {
  if (!project) {
    return {
      phase: 1,
      phaseName: '未选择项目',
      readiness: 0,
      riskLevel: 'critical',
      locks: [],
      gates: [],
      risks: [{ id: 'no-project', level: 'critical', title: '未选择项目', detail: '请选择或创建项目。' }],
      stats: { totalAssets: 0, adoptedAssets: 0, pendingAssets: 0, documents: 0 },
      outputPath: getOutputPathForPhase(1),
      phaseState: null,
      manifest: null,
      materialPlan: null,
      preflightReview: null,
      deliveryPackage: null,
      repairQueue: null,
      designBriefContract: null,
      brandConsistencyKit: null,
      designScorecard: null,
      productionImpact: null,
      reviewBoard: null,
      controlEvents: [],
      operationResults: [],
    };
  }

  const phaseState = evaluatePhaseGate(project, project.currentPhase || 1);
  const manifest = buildBrandAssetManifest(project);
  const designBriefContract = buildDesignBriefContract(project, {
    manifest,
    materialPlan: phaseState.materialPlan,
  });
  const deliveryPackage = buildDeliveryPackage(project);
  const brandConsistencyKit = buildBrandConsistencyKit(project, {
    manifest,
    materialPlan: phaseState.materialPlan,
  });
  const repairQueue = buildProductionRepairQueue(project);
  const designScorecard = buildDesignScorecard(project, {
    manifest,
    designBriefContract,
    materialPlan: phaseState.materialPlan,
    preflightReview: phaseState.preflightReview,
    deliveryPackage,
  });
  const productionImpact = buildProductionImpactMatrix(project, {
    manifest,
    designBriefContract,
    materialPlan: phaseState.materialPlan,
    preflightReview: phaseState.preflightReview,
    deliveryPackage,
    designScorecard,
  });
  const reviewBoard = buildReviewBoard(project, { deliveryPackage, designScorecard });
  const assets = getProjectAssets(project);
  const risks = buildRisks(project, phaseState);

  return {
    phase: phaseState.phase,
    phaseName: phaseState.name,
    readiness: phaseState.readiness,
    riskLevel: getRiskLevel(risks),
    locks: phaseState.locks,
    gates: phaseState.gates,
    risks,
    outputPath: phaseState.outputPath,
    phaseState,
    manifest,
    materialPlan: phaseState.materialPlan,
    preflightReview: phaseState.preflightReview,
    deliveryPackage,
    repairQueue,
    designBriefContract,
    brandConsistencyKit,
    designScorecard,
    productionImpact,
    reviewBoard,
    stats: {
      totalAssets: assets.length,
      adoptedAssets: assets.filter((asset) => asset.status === 'adopted').length,
      pendingAssets: assets.filter((asset) => asset.status === 'pending').length,
      documents: Object.keys(project.documents || {}).length,
    },
    controlEvents: (project.control?.events || []).slice(0, 8),
    operationResults: (project.control?.operationResults || []).slice(0, 8),
  };
}

export function buildDesignControlPrompt(project, state = buildDesignControlState(project)) {
  const requiredLocks = getRequiredLocks(state.phase);
  const lockedLines = state.locks
    .filter((lock) => lock.required)
    .map((lock) => `- ${lock.locked ? '[locked]' : '[missing]'} ${lock.label}: ${lock.value} (${lock.source})`);
  const gateLines = state.gates.map((gate) => (
    `- ${gate.passed ? '[pass]' : '[block]'} ${gate.label} | evidence: ${gate.evidence || 'n/a'}${gate.blocker ? ' | blocker' : ''}`
  ));
  const riskLines = state.risks.map((risk) => `- ${risk.level}: ${risk.title} - ${risk.detail}`);
  const eventLines = (state.controlEvents || []).map((event) => `- ${event.type || 'event'}: ${event.label}${event.detail ? ` - ${event.detail}` : ''}`);
  const operationResultLines = (state.operationResults || []).map((item) => `- ${item.status}: ${item.operationType} - ${item.label}${item.detail ? ` (${item.detail})` : ''}`);
  const taskLines = (state.phaseState?.tasks || []).map((task) => `- ${task.done ? '[done]' : '[todo]'} ${task.text}`);
  const outputKeys = state.phaseState?.outputKeys || [];
  const manifest = state.manifest;
  const materialPlan = state.materialPlan;
  const preflightReview = state.preflightReview;
  const deliveryPackage = state.deliveryPackage;
  const repairQueue = state.repairQueue;
  const designBriefContract = state.designBriefContract;
  const brandConsistencyKit = state.brandConsistencyKit;
  const designScorecard = state.designScorecard;
  const productionImpact = state.productionImpact;
  const reviewBoard = state.reviewBoard;
  const manifestLines = manifest
    ? [
      `Status: ${manifest.status}`,
      `Readiness: ${manifest.readyItemCount}/${manifest.requiredItemCount} (${manifest.readiness}%)`,
      `Locked: ${manifest.locked ? 'yes' : 'no'}${manifest.stale ? ' (stale)' : ''}`,
      `Missing: ${manifest.missing.map((item) => item.label).join('、') || 'none'}`,
      ...manifest.items.slice(0, 8).map((item) => `- ${item.role}: ${item.name || item.value} (${item.assetId || item.source || item.id})`),
    ]
    : ['none'];
  const materialLines = materialPlan
    ? [
      `Status: ${materialPlan.status}`,
      `Readiness: ${materialPlan.readiness}%`,
      `Materials: ${materialPlan.stats.total} total / ${materialPlan.stats.ready} ready / ${materialPlan.stats.sourceArtworks || 0} source artwork / ${materialPlan.stats.sourceQaPassed || 0} source QA pass / ${materialPlan.stats.approved} approved / ${materialPlan.stats.exported} exported`,
      `Blockers: ${materialPlan.blockers.map((blocker) => blocker.title).join('、') || 'none'}`,
      ...materialPlan.materials.slice(0, 8).map((material) => (
        `- ${material.name}: ${material.status}, ${material.size.width}x${material.size.height}${material.size.unit}, source ${material.artwork?.sourcePath || 'missing'}, refs ${material.manifestRefs.map((ref) => `${ref.role}:${ref.itemId || 'missing'}`).join(', ')}`
      )),
    ]
    : ['none'];
  const preflightLines = preflightReview
    ? [
      `Status: ${preflightReview.status}`,
      `Passed: ${preflightReview.passed ? 'yes' : 'no'}`,
      `Readiness: ${preflightReview.readiness}%`,
      `Issues: critical ${preflightReview.summary.critical || 0}, high ${preflightReview.summary.high || 0}, medium ${preflightReview.summary.medium || 0}`,
      ...preflightReview.issues.slice(0, 8).map((item) => `- ${item.severity}/${item.category}: ${item.title} | fix: ${item.fix}`),
    ]
    : ['none'];
  const deliveryLines = deliveryPackage
    ? [
      `Status: ${deliveryPackage.status}`,
      `Ready: ${deliveryPackage.ready ? 'yes' : 'no'}`,
      `Readiness: ${deliveryPackage.readiness}%`,
      `Entries: ${deliveryPackage.stats.readyEntries}/${deliveryPackage.stats.entries} ready, required ${deliveryPackage.stats.readyRequired}/${deliveryPackage.stats.requiredEntries}`,
      `Material exports: ${deliveryPackage.stats.readyMaterialExports}/${deliveryPackage.stats.materialExports}`,
      `Blockers: ${deliveryPackage.blockers.map((blocker) => blocker.title).join('、') || 'none'}`,
      ...deliveryPackage.entries.slice(0, 8).map((entry) => `- ${entry.ready ? '[ready]' : '[missing]'} ${entry.label}: ${entry.path}`),
    ]
    : ['none'];
  const repairLines = repairQueue
    ? [
      `Status: ${repairQueue.status}`,
      `Priority: ${repairQueue.priority}`,
      `Items: ${repairQueue.stats.open} open / ${repairQueue.stats.safe} safe auto-run / ${repairQueue.stats.manual} manual / ${repairQueue.stats.blocked} blocked`,
      ...repairQueue.items.slice(0, 8).map((item) => (
        `- [${item.priority}/${item.status}] ${item.title} | evidence: ${item.evidence || 'n/a'} | op: ${item.operation ? JSON.stringify({ type: item.operation.type, params: item.operation.params }) : 'manual'}`
      )),
    ]
    : ['none'];
  const contractLines = designBriefContract
    ? [
      `Status: ${designBriefContract.status}`,
      `Locked: ${designBriefContract.locked ? 'yes' : 'no'}${designBriefContract.stale ? ' (stale)' : ''}`,
      `Readiness: ${designBriefContract.readiness}%`,
      `Targets: ${designBriefContract.targets.map((item) => `${item.name}:${item.present ? 'planned' : 'missing'}`).join(', ') || 'none'}`,
      `Violations: ${designBriefContract.violations.map((item) => item.title).join('、') || 'none'}`,
      ...designBriefContract.promptRules.map((rule) => `- ${rule}`),
    ]
    : ['none'];
  const brandKitLines = brandConsistencyKit
    ? [
      `Status: ${brandConsistencyKit.status}`,
      `Readiness: ${brandConsistencyKit.readiness}%`,
      `Ready for delivery: ${brandConsistencyKit.readyForDelivery ? 'yes' : 'no'}`,
      `Vector logos: ${brandConsistencyKit.stats.vectorLogos}`,
      `Material refs: ${brandConsistencyKit.stats.boundMaterials}/${brandConsistencyKit.stats.materials}`,
      `SVG sources: ${brandConsistencyKit.stats.sourceSvgReady}/${brandConsistencyKit.stats.materials}`,
      `Vector export targets: ${brandConsistencyKit.stats.vectorTargets}/${brandConsistencyKit.stats.materials}`,
      ...brandConsistencyKit.contract.map((item) => `- ${item.passed ? '[pass]' : '[missing]'} ${item.label}: ${item.detail} | evidence: ${item.evidence}`),
      ...brandConsistencyKit.issues.slice(0, 6).map((item) => `- ${item.severity}: ${item.title} | fix: ${item.fix}`),
    ]
    : ['none'];
  const scorecardLines = designScorecard
    ? [
      `Status: ${designScorecard.status}`,
      `Passed: ${designScorecard.passed ? 'yes' : 'no'}`,
      `Score: ${designScorecard.score}/${designScorecard.threshold} (${designScorecard.grade})`,
      `Issues: critical ${designScorecard.stats.critical || 0}, high ${designScorecard.stats.high || 0}, medium ${designScorecard.stats.medium || 0}`,
      ...designScorecard.dimensions.map((dimension) => `- ${dimension.label}: ${dimension.score}/100`),
      ...designScorecard.issues.slice(0, 5).map((item) => `- ${item.severity}/${item.dimension}: ${item.title} | fix: ${item.fix}`),
    ]
    : ['none'];
  const impactLines = productionImpact
    ? [
      `Status: ${productionImpact.status}`,
      `Items: ${productionImpact.stats.total} total / ${productionImpact.stats.blocked} blocked / ${productionImpact.stats.stale} stale / ${productionImpact.stats.safe} safe operations`,
      ...productionImpact.items.slice(0, 8).map((item) => (
        `- [${item.severity}/${item.status}] ${item.artifact}: ${item.title} | affectedBy: ${item.affectedBy.join(', ') || 'n/a'} | affects: ${item.affects.join(', ') || 'n/a'} | op: ${item.operation ? JSON.stringify({ type: item.operation.type, params: item.operation.params }) : 'manual'}`
      )),
    ]
    : ['none'];
  const reviewLines = reviewBoard
    ? [
      `Status: ${reviewBoard.status}`,
      `Signed: ${reviewBoard.signed ? 'yes' : 'no'}`,
      `Items: ${reviewBoard.stats.approved}/${reviewBoard.stats.total} approved, ${reviewBoard.stats.pending} pending, ${reviewBoard.stats.blocked} blocked`,
      ...reviewBoard.items.slice(0, 8).map((item) => (
        `- [${item.status}] ${item.label} | target: ${item.targetId} | evidence: ${item.evidence}${item.decision ? ` | decision: ${item.decision.decision}` : ''}`
      )),
    ]
    : ['none'];

  return [
    '## Design Control Protocol',
    '',
    `Current phase: ${state.phase} / ${state.phaseName}`,
    `Phase objective: ${state.phaseState?.objective || 'n/a'}`,
    `Production readiness: ${state.readiness}%`,
    `Ready to advance: ${state.phaseState?.readyToAdvance ? 'yes' : 'no'}`,
    `Output path: ${state.outputPath.label} - ${state.outputPath.description}`,
    `Required locked fields through this phase: ${requiredLocks.map((lock) => lock.label).join('、') || 'none'}`,
    `Expected outputs: ${outputKeys.join('、') || 'none'}`,
    '',
    '### Locked Item Ledger',
    lockedLines.join('\n') || '- none',
    '',
    '### Phase Gates',
    gateLines.join('\n') || '- none',
    '',
    '### GUI Worklist',
    taskLines.join('\n') || '- none',
    '',
    '### Brand Asset Manifest',
    manifestLines.join('\n'),
    '',
    '### Material Production Plan',
    materialLines.join('\n'),
    '',
    '### Preflight Review',
    preflightLines.join('\n'),
    '',
    '### Delivery Package',
    deliveryLines.join('\n'),
    '',
    '### Production Repair Queue',
    repairLines.join('\n'),
    '',
    '### Design Brief Contract',
    contractLines.join('\n'),
    '',
    '### Brand Kit Consistency Contract',
    brandKitLines.join('\n'),
    '',
    '### Design Director Scorecard',
    scorecardLines.join('\n'),
    '',
    '### Production Impact Matrix',
    impactLines.join('\n'),
    '',
    '### Review Board',
    reviewLines.join('\n'),
    '',
    '### Active Risks',
    riskLines.join('\n') || '- none',
    '',
    '### Recent Studio Control Events',
    eventLines.join('\n') || '- none',
    '',
    '### Recent GUI Operation Results',
    operationResultLines.join('\n') || '- none',
    '',
    '### Allowed GUI Operations',
    `Whitelist: ${AGENT_OPERATION_TYPES.join(', ')}`,
    'Return them as `agentControl.operations`, for example: {"type":"add_material","params":{"templateId":"business-card"}}.',
    'Operations are executed by the GUI whitelist only; unknown, unsafe, or prerequisite-breaking operations are rejected and logged.',
    '',
    '### Response Contract',
    '1. Before making design decisions, explicitly respect locked items. Missing critical locks must become questions or blocking tasks.',
    '2. Treat Design Brief Contract as the LLM intent boundary. If it is missing, stale, or blocked, compile it through GUI operations or ask for the missing evidence before generating final VI assets.',
    '3. Pick the correct production path: strategy text, concept image exploration, deterministic SVG/HTML/Canvas production, or review/delivery. Do not use image generation as the final path for precise layout, repeated brand assets, 3D/package structure, strict brand colors, or cross-asset consistency.',
    '4. When proposing visual work, state what is locked, what is still variable, and what evidence is needed to proceed.',
    '5. To drive the GUI, return optional structured data under `agentControl` with schemaVersion `gdpro.agent-control.v1`.',
    '6. `agentControl` may include: phase/currentPhase, documents, brandKit, assetManifest, materialProduction, preflightReview, deliveryPackage, operations, workflow/tasks, risks, and events. Keep values explicit and auditable.',
    '7. For Phase 3 and later, every reusable visual decision must cite a manifest item id. If the manifest is missing, stale, or unlocked, ask the GUI/user to lock it before production.',
    '8. For Phase 4, materialProduction.materials is the production source of truth. Each material must include size, channel, colorMode, exportTargets, status, manifestRefs with concrete itemId values, deterministic SVG artwork, and passing Source QA before approval/export.',
    '9. For Phase 5, preflightReview is the review source of truth. Critical or high issues block delivery until fixed or explicitly marked as accepted risk in documents.audit.',
    '10. For Phase 6, deliveryPackage is the handoff source of truth. It must include VI manual, handoff guide, delivery manifest, source assets, and exported material files before the project can be treated as commercially deliverable.',
    '11. Prefer `agentControl.operations` for deterministic GUI actions instead of manually rewriting derived objects. Use operations only from the whitelist and include a short reason.',
    '12. Use Production Impact Matrix to explain which downstream artifacts become stale or blocked before proposing broad redesign work. Prefer operations that repair the earliest upstream impact.',
    '13. Use the highest-priority Production Repair Queue items before freeform advice. Safe queue operations may be returned directly under `agentControl.operations`; manual or blocked items need user-facing rationale first.',
    '14. Design Director Scorecard is the deterministic commercial-quality gate. If it is below threshold, prioritize the weakest dimension and blocking issues before asking for signoff.',
    '15. Review Board decisions are the commercial signoff ledger. Never approve a blocked review item. For ready items, return `record_review_decision` only when the GUI/user has explicitly confirmed approval or requested a decision record.',
    '16. Treat Brand Kit Consistency Contract as the project-level consistency source of truth. If vector logo, manifest lock, material refs, SVG sources, or vector export targets are missing, block final delivery and propose the smallest repair operation.',
    '17. Final client deliverables must include editable vector/source files, especially SVG source artwork for every VI material. Bitmap exports are previews or supplements, not the production source of truth.',
    '18. Do not request or apply a phase advance unless `Ready to advance` is yes. If no, output the smallest set of missing evidence and tasks.',
    '19. End with a small set of concrete action buttons or next actions that preserve phase gates and user confirmation.',
  ].join('\n');
}
