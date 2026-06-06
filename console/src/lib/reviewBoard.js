import { buildBrandAssetManifest } from './brandAssetManifest';
import { buildMaterialProductionPlan } from './materialProduction';
import { buildPreflightReview } from './preflightReview';
import { buildDesignScorecard } from './designScorecard';

export const REVIEW_BOARD_SCHEMA_VERSION = 'gdpro.review-board.v1';

export const REVIEW_DECISIONS = ['approved', 'changes_requested', 'rejected', 'accepted_risk'];

function now() {
  return Date.now();
}

function hasDocument(project, key) {
  return Boolean(project?.documents?.[key]?.content || project?.documents?.[key]);
}

function getDecisions(project) {
  return Array.isArray(project?.control?.reviewDecisions)
    ? project.control.reviewDecisions
    : [];
}

function latestDecisionFor(project, targetId) {
  return getDecisions(project)
    .filter((decision) => decision.targetId === targetId)
    .sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0))[0] || null;
}

function reviewItem({
  id,
  targetId,
  type,
  label,
  detail,
  phase,
  required = true,
  status = 'pending',
  evidence = '',
  decision = null,
  blocker = false,
}) {
  return {
    id,
    targetId,
    type,
    label,
    detail,
    phase,
    required,
    status,
    evidence,
    decision,
    blocker: Boolean(blocker || status === 'blocked' || (required && status !== 'approved' && status !== 'system-pass')),
  };
}

function statusFromDecision(decision, fallback = 'pending') {
  if (!decision) return fallback;
  if (decision.decision === 'approved' || decision.decision === 'accepted_risk') return 'approved';
  if (decision.decision === 'changes_requested') return 'changes-requested';
  if (decision.decision === 'rejected') return 'rejected';
  return fallback;
}

function materialTarget(material) {
  return `material-design:${material.id}:${material.artwork?.manifestRevision || material.updatedAt || 'draft'}`;
}

function preflightTarget(project, review) {
  return `preflight:${review.reviewedAt || project?.preflightReview?.reviewedAt || 'draft'}:${review.summary.critical || 0}:${review.summary.high || 0}:${review.summary.medium || 0}`;
}

function deliveryTarget(project, deliveryPackage) {
  return `delivery:${deliveryPackage?.builtAt || project?.deliveryPackage?.builtAt || 'draft'}:${deliveryPackage?.readiness || 0}`;
}

function scorecardTarget(scorecard) {
  return `scorecard:${scorecard?.manifestRevision || 'draft'}:${scorecard?.score || 0}:${scorecard?.stats?.materials || 0}`;
}

export function buildReviewBoard(project, { deliveryPackage = null, designScorecard = null } = {}) {
  if (!project) {
    return {
      schemaVersion: REVIEW_BOARD_SCHEMA_VERSION,
      projectId: null,
      status: 'blocked',
      signed: false,
      items: [],
      decisions: [],
      stats: { total: 0, approved: 0, pending: 0, blocked: 0, changesRequested: 0, rejected: 0 },
    };
  }

  const manifest = buildBrandAssetManifest(project);
  const materialPlan = buildMaterialProductionPlan(project);
  const preflightReview = buildPreflightReview(project);
  const scorecard = designScorecard || buildDesignScorecard(project, {
    manifest,
    materialPlan,
    preflightReview,
    deliveryPackage,
  });
  const items = [];

  items.push(reviewItem({
    id: 'manifest-lock',
    targetId: `manifest:${manifest.sourceRevision}`,
    type: 'system-gate',
    label: '品牌资产清单已锁定',
    detail: manifest.locked
      ? '可复用品牌资产已锁定，可进入生产。'
      : '进入商用评审前必须先锁定品牌资产清单。',
    phase: 3,
    status: manifest.locked ? 'system-pass' : 'blocked',
    evidence: 'assetManifest',
    blocker: !manifest.locked,
  }));

  items.push(reviewItem({
    id: 'design-director-scorecard',
    targetId: scorecardTarget(scorecard),
    type: 'system-gate',
    label: '设计总监评分',
    detail: scorecard.passed
      ? `评分 ${scorecard.score}/100（${scorecard.grade}）已达到商用签收线。`
      : `评分 ${scorecard.score}/100（${scorecard.grade}）低于 ${scorecard.threshold}/100 签收线，或仍有阻断问题。`,
    phase: 6,
    status: scorecard.passed ? 'system-pass' : 'blocked',
    evidence: 'designScorecard',
    blocker: !scorecard.passed,
  }));

  materialPlan.materials.forEach((material) => {
    const evaluation = materialPlan.evaluations.find((item) => item.materialId === material.id);
    const audit = evaluation?.artworkAudit;
    items.push(reviewItem({
      id: `source-qa-${material.id}`,
      targetId: `material-source:${material.id}:${material.artwork?.manifestRevision || 'missing'}`,
      type: 'system-gate',
      label: `${material.name} 源稿检查`,
      detail: audit?.passed
        ? '可编辑源稿已通过所有阻断检查。'
        : audit?.issues?.map((item) => item.label).slice(0, 3).join('、') || '源稿检查仍有阻断问题。',
      phase: 4,
      status: audit?.passed ? 'system-pass' : 'blocked',
      evidence: `materialProduction.materials.${material.id}.artwork`,
      blocker: !audit?.passed,
    }));

    const targetId = materialTarget(material);
    const decision = latestDecisionFor(project, targetId);
    const canReview = Boolean(audit?.passed);
    items.push(reviewItem({
      id: `material-design-${material.id}`,
      targetId,
      type: 'material-design',
      label: `${material.name} 设计签收`,
      detail: canReview
        ? '最终交付前，需要人工或指定评审人确认该物料设计。'
        : '源稿检查通过前，不能签收该物料设计。',
      phase: 5,
      status: canReview ? statusFromDecision(decision) : 'blocked',
      evidence: `materialProduction.materials.${material.id}`,
      decision,
      blocker: !canReview,
    }));
  });

  const preflightId = preflightTarget(project, preflightReview);
  const preflightDecision = latestDecisionFor(project, preflightId);
  const preflightReady = preflightReview.passed && hasDocument(project, 'audit');
  items.push(reviewItem({
    id: 'preflight-signoff',
    targetId: preflightId,
    type: 'preflight-signoff',
    label: '交付前审查签收',
    detail: preflightReady
      ? '交付前检查已无严重或高风险问题，并已整理审查报告。'
      : '修复严重/高风险问题并整理审查报告后，才能签收。',
    phase: 5,
    status: preflightReady ? statusFromDecision(preflightDecision) : 'blocked',
    evidence: 'preflightReview / documents.audit',
    decision: preflightDecision,
    blocker: !preflightReady,
  }));

  const deliveryReady = Boolean(deliveryPackage?.ready || project?.deliveryPackage?.ready);
  const deliveryId = deliveryTarget(project, deliveryPackage || project?.deliveryPackage || {});
  const deliveryDecision = latestDecisionFor(project, deliveryId);
  items.push(reviewItem({
    id: 'delivery-signoff',
    targetId: deliveryId,
    type: 'delivery-signoff',
    label: '最终交付签收',
    detail: deliveryReady
      ? '交付包已就绪，需要最终发布确认。'
      : '交付包就绪前，最终交付签收会被阻断。',
    phase: 6,
    status: deliveryReady ? statusFromDecision(deliveryDecision) : 'blocked',
    evidence: 'deliveryPackage',
    decision: deliveryDecision,
    blocker: !deliveryReady,
  }));

  const requiredItems = items.filter((item) => item.required);
  const approvedCount = requiredItems.filter((item) => ['approved', 'system-pass'].includes(item.status)).length;
  const blockedCount = requiredItems.filter((item) => item.status === 'blocked').length;
  const pendingCount = requiredItems.filter((item) => item.status === 'pending').length;
  const changesRequested = requiredItems.filter((item) => item.status === 'changes-requested').length;
  const rejected = requiredItems.filter((item) => item.status === 'rejected').length;
  const signed = requiredItems.length > 0 && approvedCount === requiredItems.length;
  const status = signed
    ? 'signed'
    : blockedCount
      ? 'blocked'
      : (changesRequested || rejected)
        ? 'changes-requested'
        : 'pending-signoff';

  return {
    schemaVersion: REVIEW_BOARD_SCHEMA_VERSION,
    projectId: project.id || null,
    status,
    signed,
    items,
    decisions: getDecisions(project),
    stats: {
      total: requiredItems.length,
      approved: approvedCount,
      pending: pendingCount,
      blocked: blockedCount,
      changesRequested,
      rejected,
    },
  };
}

export function recordReviewDecision(project, {
  targetId,
  decision = 'approved',
  note = '',
  reviewer = 'gui',
  reviewerRole = 'design-director',
} = {}) {
  if (!targetId || !REVIEW_DECISIONS.includes(decision)) return project;
  const board = buildReviewBoard(project);
  const item = board.items.find((entry) => entry.targetId === targetId);
  if (!item) return project;

  const record = {
    id: `review_${now()}_${Math.random().toString(36).slice(2, 7)}`,
    schemaVersion: REVIEW_BOARD_SCHEMA_VERSION,
    targetId,
    targetType: item.type,
    label: item.label,
    decision,
    note,
    reviewer,
    reviewerRole,
    evidence: item.evidence,
    decidedAt: now(),
  };

  return {
    ...project,
    control: {
      ...(project.control || {}),
      reviewDecisions: [
        record,
        ...getDecisions(project),
      ].slice(0, 100),
      lastAction: 'record_review_decision',
      lastUpdatedAt: now(),
      events: [
        {
          id: `evt_${now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: now(),
          source: 'review-board',
          type: 'review-decision',
          label: `${decision}: ${item.label}`,
          detail: note,
        },
        ...((project.control || {}).events || []),
      ].slice(0, 40),
    },
    updatedAt: now(),
  };
}

export function createReviewBoardDocument(project, options = {}) {
  const board = buildReviewBoard(project, options);
  const lines = [
    '# Review Board Signoff',
    '',
    `- Schema: ${REVIEW_BOARD_SCHEMA_VERSION}`,
    `- Status: ${board.status}`,
    `- Signed: ${board.signed ? 'yes' : 'no'}`,
    `- Approved: ${board.stats.approved}/${board.stats.total}`,
    '',
    '## Required Items',
  ];

  board.items.forEach((item) => {
    lines.push(`- [${item.status}] ${item.label}`);
    lines.push(`  - target: ${item.targetId}`);
    lines.push(`  - evidence: ${item.evidence}`);
    if (item.decision) {
      lines.push(`  - decision: ${item.decision.decision} by ${item.decision.reviewerRole || item.decision.reviewer}`);
    }
  });

  return {
    title: 'Review Board Signoff',
    content: lines.join('\n'),
    phase: 6,
    adoptedAt: now(),
    source: 'review-board',
    status: board.signed ? 'locked' : 'needs-signoff',
    metadata: {
      schemaVersion: REVIEW_BOARD_SCHEMA_VERSION,
      status: board.status,
      signed: board.signed,
      stats: board.stats,
    },
  };
}
