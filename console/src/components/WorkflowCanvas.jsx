import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Image as ImageIcon,
  Layers3,
  Maximize2,
  MessageSquare,
  MousePointer2,
  PackageCheck,
  PenTool,
  Plus,
  Play,
  ScrollText,
  ShieldCheck,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { buildWorkflowGraph, createDefaultWorkflowCanvas, WORKFLOW_CANVAS_SCHEMA_VERSION } from '../lib/workflowGraph';
import { applyAgentOperations } from '../lib/agentOperations';
import { MATERIAL_TEMPLATES } from '../lib/materialProduction';
import { uiText } from '../lib/uiLanguage';
import { syncWorkspaceFiles } from '../lib/storage';
import { buildWorkflowRunAudit, workflowRunAuditFiles } from '../lib/workflowRunAudit';
import { buildPartnerHandoffTask, buildRuntimeHandoffPlan, partnerHandoffFiles } from '../lib/runtimeHandoff';
import { openclaw } from '../lib/api';

const WORLD = { width: 1440, height: 940 };

const TONE = {
  success: {
    rail: 'bg-gdpro-success',
    border: 'border-gdpro-success/40',
    badge: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
    panel: 'border-gdpro-success/20 bg-gdpro-success/10',
    edge: 'rgba(111, 191, 115, 0.72)',
    dot: 'bg-gdpro-success',
  },
  info: {
    rail: 'bg-gdpro-info',
    border: 'border-gdpro-info/40',
    badge: 'text-gdpro-info bg-gdpro-info/10 border-gdpro-info/20',
    panel: 'border-gdpro-info/20 bg-gdpro-info/10',
    edge: 'rgba(122, 131, 199, 0.66)',
    dot: 'bg-gdpro-info',
  },
  warning: {
    rail: 'bg-gdpro-warning',
    border: 'border-gdpro-warning/40',
    badge: 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
    panel: 'border-gdpro-warning/20 bg-gdpro-warning/10',
    edge: 'rgba(214, 169, 74, 0.66)',
    dot: 'bg-gdpro-warning',
  },
  danger: {
    rail: 'bg-gdpro-danger',
    border: 'border-gdpro-danger/40',
    badge: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
    panel: 'border-gdpro-danger/20 bg-gdpro-danger/10',
    edge: 'rgba(224, 108, 100, 0.74)',
    dot: 'bg-gdpro-danger',
  },
  muted: {
    rail: 'bg-gdpro-text-muted',
    border: 'border-gdpro-border',
    badge: 'text-gdpro-text-muted bg-gdpro-bg-elevated border-gdpro-border',
    panel: 'border-gdpro-border bg-gdpro-bg-elevated',
    edge: 'rgba(139, 130, 118, 0.42)',
    dot: 'bg-gdpro-text-muted',
  },
};

function toneClass(tone) {
  return TONE[tone] || TONE.muted;
}

function edgePath(from, to) {
  const x1 = from.position.x + from.size.width;
  const y1 = from.position.y + from.size.height / 2;
  const x2 = to.position.x;
  const y2 = to.position.y + to.size.height / 2;
  const dx = Math.max(92, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function StatusIcon({ tone }) {
  if (tone === 'success') return <CheckCircle2 className="w-3.5 h-3.5 text-gdpro-success shrink-0" strokeWidth={2.3} />;
  if (tone === 'danger') return <AlertTriangle className="w-3.5 h-3.5 text-gdpro-danger shrink-0" strokeWidth={2.3} />;
  return <Circle className="w-3.5 h-3.5 text-gdpro-warning shrink-0" strokeWidth={2.3} />;
}

function activityClass(tone) {
  return toneClass(tone).badge;
}

function operationResultTone(status) {
  if (status === 'applied') return 'success';
  if (status === 'skipped') return 'info';
  if (status === 'blocked') return 'warning';
  if (status === 'rejected' || status === 'failed') return 'danger';
  return 'muted';
}

function operationResultLabel(status, copy) {
  if (copy?.operationResults?.[status]) return copy.operationResults[status];
  if (status === 'applied') return '已完成';
  if (status === 'skipped') return '已跳过';
  if (status === 'blocked') return '被挡住';
  if (status === 'rejected') return '未处理';
  if (status === 'failed') return '未完成';
  return '已记录';
}

function formatActivityTime(timestamp, copy) {
  if (!timestamp) return copy?.timeJustNow || '刚刚';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return copy?.timeJustNow || '刚刚';
  if (diff < 3_600_000) {
    const minutes = Math.max(1, Math.round(diff / 60_000));
    return typeof copy?.timeMinutesAgo === 'function' ? copy.timeMinutesAgo(minutes) : `${minutes} 分钟前`;
  }
  return new Date(timestamp).toLocaleTimeString(copy?.timeFormatLocale || 'zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function operationKey(item) {
  const op = item?.operation;
  if (!op) return item?.itemId || '';
  return `${op.type}:${JSON.stringify(op.params || {})}`;
}

function dedupeRunnable(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = operationKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scopedOperations(node, items) {
  return dedupeRunnable((items || []).map((item) => ({
    ...item,
    nodeId: item.nodeId || node?.id,
    nodeTitle: item.nodeTitle || node?.title,
  })));
}

function shortStatusLabel(label, copy) {
  return String(label || copy?.statusNotStarted || '未开始').split(' ')[0];
}

function workflowTerm(copy, value) {
  if (value == null) return value;
  if (copy?.locale !== 'en') return value;
  return copy.terms?.[value] || value;
}

function workflowList(copy, value) {
  if (copy?.locale !== 'en') return value;
  return String(value || '')
    .split(/[、,，]/)
    .map((part) => workflowTerm(copy, part.trim()))
    .filter(Boolean)
    .join(', ');
}

function workflowValue(copy, value) {
  if (value == null || copy?.locale !== 'en') return value;
  const text = String(value);
  const countMatch = text.match(/^(\d+)\s*个$/);
  if (countMatch) return countMatch[1];
  const gradeMatch = text.match(/^等级\s*(.+)$/);
  if (gradeMatch) return `Grade ${gradeMatch[1]}`;
  return workflowTerm(copy, text);
}

function workflowSentence(copy, value) {
  if (value == null || copy?.locale !== 'en') return value;
  const text = String(value);
  const plainText = text.replace(/[。.]$/, '');
  if (copy.terms?.[plainText]) return copy.terms[plainText];
  const prepMatch = text.match(/^需要先准备：(.+)$/);
  if (prepMatch) return `Required before start: ${workflowList(copy, prepMatch[1])}`;
  const stateMatch = text.match(/^当前状态：(.+)$/);
  if (stateMatch) return `Current status: ${workflowStatus(copy, stateMatch[1])}`;
  const brandKitMatch = text.match(/^(.+?)；矢量源稿\s*(\d+)\/(\d+)，物料引用\s*(\d+)\/(\d+)。?$/);
  if (brandKitMatch) {
    return `${workflowStatus(copy, brandKitMatch[1])} · vector sources ${brandKitMatch[2]}/${brandKitMatch[3]} · material links ${brandKitMatch[4]}/${brandKitMatch[5]}`;
  }
  const actionCountMatch = text.match(/^(\d+)\s*项可直接处理，(\d+)\s*项需要你确认。?$/);
  if (actionCountMatch) return `${actionCountMatch[1]} can be handled now · ${actionCountMatch[2]} need your review`;
  const commaMatch = text.match(/^(.+?)，(.+)。?$/);
  if (commaMatch) {
    const lead = workflowTerm(copy, commaMatch[1]);
    const detail = workflowSentence(copy, commaMatch[2]);
    if (lead !== commaMatch[1] || detail !== commaMatch[2]) return `${lead}. ${detail}`;
  }
  const colonMatch = text.match(/^(.+?)：(.+)$/);
  if (colonMatch) return `${workflowTerm(copy, colonMatch[1])}: ${workflowStatus(copy, colonMatch[2])}`;
  return workflowTerm(copy, text);
}

function workflowStatus(copy, value) {
  if (value == null) return value;
  if (copy?.locale !== 'en') return value;
  return copy.statuses?.[value] || copy.terms?.[value] || value;
}

function workflowNodeCopy(copy, node) {
  const translated = copy?.locale === 'en' ? copy.nodes?.[node?.id] : null;
  return {
    title: translated?.title || node?.title || '',
    subtitle: translated?.subtitle || node?.subtitle || '',
    outputLabel: translated?.outputLabel || node?.outputLabel || '',
  };
}

function workflowMetricLabel(copy, label) {
  return workflowTerm(copy, label);
}

function workflowActivityLabel(copy, item) {
  if (!item) return '';
  return workflowTerm(copy, item.label);
}

function workflowActivityStatus(copy, item) {
  if (!item) return '';
  return workflowStatus(copy, item.statusLabel);
}

function workflowStatsSummary(copy, graph) {
  const stats = { ...(graph?.stats || {}), nodes: graph?.nodes?.length || 0 };
  return typeof copy.statsSummary === 'function' ? copy.statsSummary(stats) : graph?.stats?.summaryLabel;
}

function svgToDataUrl(svg) {
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : '';
}

function downloadSvgMaterial(material) {
  if (!material?.artwork?.svg) return;
  const blob = new Blob([material.artwork.svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${material.name || material.id || 'material-source'}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function serializeWorkflowNode(node) {
  return {
    id: node.id,
    title: node.title,
    subtitle: node.subtitle,
    phase: node.phase,
    artifact: node.artifact,
    position: node.position,
    inputs: node.inputs || [],
    outputs: node.outputs || [],
    outputLabel: node.outputLabel,
    templateId: node.templateId || node.id,
    custom: Boolean(node.custom),
    done: Boolean(node.done),
  };
}

function serializeWorkflowEdge(edge, index) {
  return {
    id: edge.id || `edge-${edge.from}-${edge.to}-${index}`,
    from: edge.from,
    to: edge.to,
  };
}

function templateSizeLabel(size = {}, copy) {
  if (!size.width || !size.height) return copy?.templateSizePending || '尺寸待确认';
  return `${size.width} × ${size.height} ${size.unit || 'px'}`;
}

function templateChannelLabel(channel, copy) {
  if (copy?.templateChannels?.[channel]) return copy.templateChannels[channel];
  if (channel === 'print') return '印刷物料';
  if (channel === 'digital') return '线上内容';
  if (channel === 'environment') return '空间应用';
  return copy?.templateChannels?.default || '交付物';
}

function materialTemplateName(copy, template) {
  return copy?.materialTemplates?.[template.id] || template.name;
}

function templateDetail(template, copy) {
  return `${templateChannelLabel(template.channel, copy)} · ${templateSizeLabel(template.size, copy)} · ${template.colorMode}`;
}

function exportTargetLabel(target, copy) {
  return copy?.exportTargets?.[target] || target;
}

function reviewStatusTone(status) {
  if (status === 'approved' || status === 'system-pass') return 'success';
  if (status === 'pending') return 'info';
  if (status === 'changes-requested') return 'warning';
  if (status === 'blocked' || status === 'rejected') return 'danger';
  return 'muted';
}

function reviewStatusLabel(status, copy) {
  if (copy?.reviewStatusLabels?.[status]) return copy.reviewStatusLabels[status];
  if (status === 'system-pass') return '检查已通过';
  if (status === 'approved') return '已签收';
  if (status === 'pending') return '待确认';
  if (status === 'changes-requested') return '要求修改';
  if (status === 'rejected') return '已拒绝';
  if (status === 'blocked') return '先修复';
  return status || '待确认';
}

function reviewDecisionLabel(decision, copy) {
  if (copy?.reviewDecisionLabels?.[decision]) return copy.reviewDecisionLabels[decision];
  if (decision === 'approved') return '通过';
  if (decision === 'changes_requested') return '要修改';
  if (decision === 'rejected') return '拒绝';
  if (decision === 'accepted_risk') return '接受风险';
  return '记录意见';
}

function friendlyReviewLabel(item, copy) {
  if (!item) return '签收项目';
  if (copy?.reviewLabels?.[item.id]) return copy.reviewLabels[item.id];
  if (item.id === 'manifest-lock') return '品牌资产已锁定';
  if (item.id === 'design-director-scorecard') return '交付评分已达标';
  if (item.id === 'preflight-signoff') return '交付前检查';
  if (item.id === 'delivery-signoff') return '最终交付确认';
  if (item.type === 'material-design') {
    const raw = workflowTerm(copy, item.label);
    return copy?.locale === 'en'
      ? raw.replace(' 设计确认', ' design approval').replace(' design approval', ' design approval')
      : raw.replace(' design approval', ' 设计确认');
  }
  if (item.type === 'system-gate' && item.label.includes('Source QA')) {
    return copy?.locale === 'en' ? workflowTerm(copy, item.label) : item.label.replace(' Source QA', ' 源画稿检查');
  }
  return workflowTerm(copy, item.label);
}

function friendlyReviewDetail(item, copy) {
  if (!item) return '';
  if (item.id === 'manifest-lock') {
    return item.status === 'blocked'
      ? copy?.reviewDetails?.manifestLockBlocked || '请先锁定 Logo、颜色、字体等品牌资产，再进入商用签收。'
      : copy?.reviewDetails?.manifestLockReady || '品牌资产已经固定，可以作为后续物料制作依据。';
  }
  if (item.id === 'design-director-scorecard') {
    return item.status === 'blocked'
      ? copy?.reviewDetails?.scoreBlocked || '当前交付评分还没达到门槛，请先处理低分项和阻断问题。'
      : copy?.reviewDetails?.scoreReady || '商业交付评分已经达到签收门槛。';
  }
  if (item.id === 'preflight-signoff') {
    return item.status === 'blocked'
      ? copy?.reviewDetails?.preflightBlocked || '交付前检查还有严重或高风险问题，请先完成检查并修复。'
      : copy?.reviewDetails?.preflightReady || '交付前检查已通过，可以记录签收意见。';
  }
  if (item.id === 'delivery-signoff') {
    return item.status === 'blocked'
      ? copy?.reviewDetails?.packageBlocked || '交付包还没有准备好，请先整理手册、交接说明和文件清单。'
      : copy?.reviewDetails?.packageReady || '交付包已准备好，可以做最终确认。';
  }
  if (item.type === 'material-design') {
    return item.status === 'blocked'
      ? copy?.reviewDetails?.materialBlocked || '这项物料还没通过源画稿检查，暂时不能签收。'
      : copy?.reviewDetails?.materialReady || '请确认这项物料是否可以进入最终交付。';
  }
  if (item.type === 'system-gate') {
    return item.status === 'blocked'
      ? copy?.reviewDetails?.gateBlocked || '这项检查还没通过，请先修复对应步骤。'
      : copy?.reviewDetails?.gateReady || '这项检查已经通过。';
  }
  return workflowSentence(copy, item.detail);
}

function friendlyReviewEvidence(item, copy) {
  if (!item) return '';
  if (copy?.reviewEvidence?.[item.id]) return copy.reviewEvidence[item.id];
  if (item.id === 'manifest-lock') return '品牌资产步骤';
  if (item.id === 'design-director-scorecard') return '总监评分步骤';
  if (item.id === 'preflight-signoff') return '交付检查步骤';
  if (item.id === 'delivery-signoff') return '交付包步骤';
  if (item.type === 'material-design') return copy?.reviewEvidence?.materialDesign || '生产画稿与交付物清单';
  if (item.type === 'system-gate' && item.label.includes('Source QA')) return copy?.reviewEvidence?.sourceQa || '源画稿检查';
  return workflowTerm(copy, item.evidence || '');
}

function buildExecutionReport(plan, items, operationResult, copy) {
  const resultItems = (operationResult.results || []).map((result, index) => {
    const request = items[index] || {};
    const tone = operationResultTone(result.status);
    return {
      id: result.id || `${operationKey(request)}-${index}`,
      label: workflowTerm(copy, request.label || result.label || copy?.handledItemLabel || '已处理事项'),
      detail: workflowSentence(copy, request.detail || result.detail || result.label || copy?.handledItemDetail || '这件事已写入处理记录。'),
      status: result.status,
      statusLabel: operationResultLabel(result.status, copy),
      tone,
      nodeId: request.nodeId,
      nodeTitle: workflowTerm(copy, request.nodeTitle),
      operationType: result.operationType,
    };
  });
  const summary = resultItems.reduce((acc, item) => {
    if (item.status === 'applied') acc.applied += 1;
    else if (item.status === 'skipped') acc.skipped += 1;
    else acc.blocked += 1;
    return acc;
  }, { applied: 0, skipped: 0, blocked: 0 });
  return {
    id: `report_${Date.now()}`,
    createdAt: Date.now(),
    title: workflowTerm(copy, plan?.label || copy?.handledSelectedLabel || '已处理选中事项'),
    scopeLabel: workflowTerm(copy, plan?.scopeLabel || copy?.defaultScope || '当前画布'),
    summary,
    items: resultItems,
    changedKeys: operationResult.changedKeys || [],
    hasIssues: summary.blocked > 0,
  };
}

function buildNodeAssistantPrompt(node, graph, copy) {
  const nodeCopy = workflowNodeCopy(copy, node);
  const metrics = (node.metrics || [])
    .map(([label, value]) => `${workflowMetricLabel(copy, label)}: ${workflowValue(copy, value)}`)
    .join(copy?.locale === 'en' ? '; ' : '；') || (copy?.assistantGuide?.noMetrics || '暂无进度数据');
  const issues = (node.issues || []).slice(0, 5)
    .map((issue, index) => `${index + 1}. ${workflowTerm(copy, issue.displayTitle)}: ${workflowSentence(copy, issue.displayDetail)}`)
    .join('\n') || (copy?.assistantGuide?.noIssues || '当前步骤没有明确阻塞问题。');
  const checks = (node.control?.checks || []).map((check) => (
    `- ${workflowTerm(copy, check.label)}: ${workflowStatus(copy, check.statusLabel)}. ${workflowSentence(copy, check.detail)}`
  )).join('\n') || (copy?.assistantGuide?.noChecks || '- 暂无过关条件');
  const safeActions = (node.operations || [])
    .filter((operation) => operation.autoRunnable)
    .slice(0, 5)
    .map((operation, index) => `${index + 1}. ${workflowTerm(copy, operation.label)}: ${workflowSentence(copy, operation.detail)}`)
    .join('\n') || (copy?.assistantGuide?.noActions || '暂无可直接处理事项。');
  const contextLine = workflowStatsSummary(copy, graph) || copy?.defaultScope || '当前 VI 工作流画布';

  if (copy?.locale === 'en') {
    return [
      `Analyze the "${nodeCopy.title}" step in the VI canvas flow.`,
      '',
      `Project flow: ${contextLine}`,
      `Step status: ${workflowStatus(copy, node.statusLabel)}`,
      `Progress: ${metrics}`,
      '',
      'Gate checks:',
      checks,
      '',
      'Open issues:',
      issues,
      '',
      'Studio-handled actions:',
      safeActions,
      '',
      'Reply in plain language for a non-technical design user:',
      '1. Where this step is blocked and why it affects delivery.',
      '2. The smallest next actions, ordered by priority.',
      '3. What the studio can handle and what needs human review.',
      '4. If a safe studio action exists, return that action; do not ask the user to copy commands.',
    ].join('\n');
  }

  return [
    `请分析 VI 工作流画布中的「${nodeCopy.title}」这一步。`,
    '',
    `项目流程概况：${contextLine}`,
    `步骤状态：${workflowStatus(copy, node.statusLabel)}`,
    `当前进度：${metrics}`,
    '',
    '过关条件：',
    checks,
    '',
    '待处理问题：',
    issues,
    '',
    '界面可直接处理的事项：',
    safeActions,
    '',
    '请用非技术用户能听懂的话回答：',
    '1. 这一步现在卡在哪里，为什么会影响后续交付。',
    '2. 下一步最小处理事项是什么，按优先级排列。',
    '3. 哪些事项可以由界面直接处理，哪些必须由人确认。',
    '4. 如果有安全的界面处理事项，请返回对应动作；不要让用户复制命令。',
  ].join('\n');
}

function PreviewPanel({ preview, copy }) {
  if (!preview) return null;

  return (
    <section className="py-4 border-b border-gdpro-border/80">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-gdpro-text-muted">{copy.previewTitle}</div>
          <div className="text-[10px] font-semibold text-gdpro-text truncate mt-0.5">{workflowTerm(copy, preview.title)}</div>
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-gdpro-text-muted mt-2">{workflowSentence(copy, preview.summary)}</p>

      {preview.swatches?.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {preview.swatches.slice(0, 6).map((swatch) => (
            <div key={swatch.id || swatch.hex} className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated overflow-hidden">
              <div className="h-8" style={{ background: swatch.hex }} />
              <div className="px-2 py-1.5 min-w-0">
                <div className="text-[10px] font-semibold text-gdpro-text truncate">{swatch.name}</div>
                <div className="text-[9px] text-gdpro-text-muted truncate">{swatch.detail || swatch.hex}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview.thumbnails?.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {preview.thumbnails.slice(0, 4).map((item) => (
            <div key={item.id} className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated overflow-hidden">
              <div className="aspect-[4/3] bg-gdpro-bg-surface flex items-center justify-center">
                {item.svg ? (
                  <img src={svgToDataUrl(item.svg)} alt={copy.previewAlt(item.name)} className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-gdpro-text-muted">
                    <ImageIcon className="w-5 h-5" strokeWidth={1.8} />
                    <span className="text-[9px]">{copy.waiting}</span>
                  </div>
                )}
              </div>
              <div className="px-2 py-1.5">
                <div className="text-[10px] font-semibold text-gdpro-text truncate">{item.name}</div>
                <div className="text-[9px] text-gdpro-text-muted truncate">{workflowStatus(copy, item.status)} · {workflowSentence(copy, item.detail)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview.items?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {preview.items.slice(0, 6).map((item, index) => (
            <div key={`${item.label}-${index}`} className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-gdpro-text truncate">{workflowTerm(copy, item.label)}</span>
                <span className="text-[10px] text-gdpro-text-secondary shrink-0 max-w-[96px] truncate">{workflowValue(copy, item.value)}</span>
              </div>
              {item.detail && <p className="text-[9px] text-gdpro-text-muted mt-0.5 line-clamp-2">{workflowSentence(copy, item.detail)}</p>}
            </div>
          ))}
        </div>
      )}

      {preview.documents?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {preview.documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5 min-w-0">
              <FileText className={`w-3.5 h-3.5 shrink-0 ${doc.ready ? 'text-gdpro-success' : 'text-gdpro-warning'}`} strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold text-gdpro-text truncate">{workflowTerm(copy, doc.label)}</div>
                <div className="text-[9px] text-gdpro-text-muted truncate">{workflowSentence(copy, doc.detail)}</div>
              </div>
              <span className={`px-1.5 py-[2px] rounded-md border text-[9px] shrink-0 ${doc.ready ? 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20' : 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20'}`}>
                {doc.ready ? copy.completed : copy.pending}
              </span>
            </div>
          ))}
        </div>
      )}

      {preview.nextStep && (
        <div className={`mt-3 rounded-lg border px-3 py-2 ${preview.nextStep.tone === 'success' ? 'border-gdpro-success/20 bg-gdpro-success/10' : 'border-gdpro-warning/20 bg-gdpro-warning/10'}`}>
          <div className="flex items-center gap-2">
            <PackageCheck className={`w-3.5 h-3.5 ${preview.nextStep.tone === 'success' ? 'text-gdpro-success' : 'text-gdpro-warning'}`} strokeWidth={2} />
            <div className={`text-[10px] font-semibold ${preview.nextStep.tone === 'success' ? 'text-gdpro-success' : 'text-gdpro-warning'}`}>
              {copy.nextStep}{copy.locale === 'en' ? ' ' : ''}{workflowTerm(copy, preview.nextStep.label)}
            </div>
          </div>
          <p className={`text-[9px] leading-relaxed mt-1 ${preview.nextStep.tone === 'success' ? 'text-gdpro-success/85' : 'text-gdpro-warning/85'}`}>
            {workflowSentence(copy, preview.nextStep.detail)}
          </p>
        </div>
      )}
    </section>
  );
}

function ActivityPanel({ node, graph, copy }) {
  const activity = node?.activity || [];
  const globalActivity = graph?.recentActivity || [];

  return (
    <section className="py-4 border-b border-gdpro-border/80">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScrollText className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
          <div className="text-[11px] font-semibold text-gdpro-text-muted">{copy.historyTitle}</div>
        </div>
        <span className="text-[10px] text-gdpro-text-muted">{activity.length} {copy.countSuffix}</span>
      </div>

      {activity.length ? (
        <div className="space-y-1.5 mt-3">
          {activity.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-gdpro-text truncate">{workflowActivityLabel(copy, item)}</span>
                <span className={`px-1.5 py-[2px] rounded-md border text-[9px] shrink-0 ${activityClass(item.tone)}`}>
                  {workflowActivityStatus(copy, item)}
                </span>
              </div>
              <p className="text-[9px] text-gdpro-text-muted mt-1 line-clamp-2">{workflowSentence(copy, item.detail)}</p>
              <div className="text-[9px] text-gdpro-text-muted/75 mt-1">{formatActivityTime(item.timestamp, copy)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
          <div className="text-[10px] font-semibold text-gdpro-text">{copy.noHistoryTitle}</div>
          <p className="text-[9px] leading-relaxed text-gdpro-text-muted mt-1">
            {copy.noHistoryDetail}
          </p>
        </div>
      )}

      {globalActivity.length > 0 && !activity.length && (
        <div className="mt-2 text-[9px] text-gdpro-text-muted">
          {copy.otherHistory(globalActivity.length)}
        </div>
      )}
    </section>
  );
}

function ControlChecksPanel({ node, copy }) {
  const control = node?.control;
  const checks = control?.checks || [];
  if (!checks.length) return null;

  return (
    <section className="py-4 border-b border-gdpro-border/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
            <div className="text-[11px] font-semibold text-gdpro-text-muted">{copy.checksTitle}</div>
          </div>
          <p className="text-[9px] leading-relaxed text-gdpro-text-muted mt-1">
            {copy.checksDescription}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[12px] font-semibold text-gdpro-text">{control.passed}/{control.total}</div>
          <div className="text-[9px] text-gdpro-text-muted">{copy.passedLabel}</div>
        </div>
      </div>

      <div className="space-y-1.5 mt-3">
        {checks.map((check) => {
          const theme = toneClass(check.tone);
          return (
            <div key={check.id} className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${theme.dot} shrink-0`} />
                    <span className="text-[10px] font-semibold text-gdpro-text truncate">{copy.locale === 'en' ? check.labelEn || workflowTerm(copy, check.label) : check.label}</span>
                    {copy.locale !== 'en' && <span className="text-[9px] text-gdpro-text-muted shrink-0">{check.labelEn}</span>}
                  </div>
                  <p className="text-[9px] leading-relaxed text-gdpro-text-muted mt-1 line-clamp-2">{workflowSentence(copy, check.detail)}</p>
                </div>
                <span className={`px-1.5 py-[2px] rounded-md border text-[9px] shrink-0 ${theme.badge}`}>
                  {workflowStatus(copy, check.statusLabel)}
                </span>
              </div>
              <div className="mt-1.5 rounded-sm bg-gdpro-bg-surface px-2 py-1 text-[9px] leading-relaxed text-gdpro-text-muted line-clamp-2">
                {workflowSentence(copy, check.evidence)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
          <div className="text-[9px] text-gdpro-text-muted">{copy.needsReview}</div>
          <div className="text-[13px] font-semibold text-gdpro-text mt-0.5">{control.attention}</div>
        </div>
        <div className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
          <div className="text-[9px] text-gdpro-text-muted">{copy.canHandle}</div>
          <div className="text-[13px] font-semibold text-gdpro-text mt-0.5">{control.safeActions}</div>
        </div>
      </div>
    </section>
  );
}

function WorkflowStatusStrip({ graph, copy }) {
  const cardCopy = copy.statusCards;
  const items = [
    {
      label: cardCopy.brandKit[0],
      labelEn: cardCopy.brandKit[1],
      value: `${graph.stats.brandKitReadiness}%`,
      detail: cardCopy.brandKit[2](graph.stats),
      tone: graph.stats.brandKitReadiness >= 90 ? 'success' : graph.stats.brandKitReadiness >= 60 ? 'warning' : 'danger',
    },
    {
      label: cardCopy.checks[0],
      labelEn: cardCopy.checks[1],
      value: `${graph.stats.passedChecks}/${graph.stats.totalChecks}`,
      detail: cardCopy.checks[2](graph.stats),
      tone: graph.stats.attentionChecks ? 'warning' : 'success',
    },
    {
      label: cardCopy.review[0],
      labelEn: cardCopy.review[1],
      value: graph.stats.attentionChecks,
      detail: cardCopy.review[2](graph.stats),
      tone: graph.stats.attentionChecks ? 'danger' : 'success',
    },
    {
      label: cardCopy.actions[0],
      labelEn: cardCopy.actions[1],
      value: graph.stats.safeOperations,
      detail: cardCopy.actions[2](graph.stats),
      tone: graph.stats.safeOperations ? 'info' : 'muted',
    },
    {
      label: cardCopy.history[0],
      labelEn: cardCopy.history[1],
      value: graph.stats.recentActivity,
      detail: cardCopy.history[2](graph.stats),
      tone: graph.stats.recentActivity ? 'success' : 'muted',
    },
  ];

  return (
    <div className="hidden md:grid grid-cols-5 gap-2 px-3 py-2 border-b border-gdpro-border bg-gdpro-bg/80">
      {items.map((item) => {
        const theme = toneClass(item.tone);
        return (
          <div key={item.label} className="gdpro-status-card rounded-lg px-3 py-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-gdpro-text-secondary truncate">{item.label}</div>
                <div className="text-[9px] text-gdpro-text-muted truncate">{item.labelEn}</div>
              </div>
              <div className={`text-[15px] font-semibold tabular-nums ${item.tone === 'muted' ? 'text-gdpro-text-muted' : theme.badge.split(' ')[0]}`}>
                {item.value}
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-gdpro-text-muted">
              <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
              <span className="truncate">{item.detail}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WorkflowNode({ node, selected, onSelect, onDragStart, copy }) {
  const theme = toneClass(node.tone);
  const directActions = node.operations.filter((op) => op.autoRunnable).length;
  const lastActivity = node.lastActivity;
  const nodeCopy = workflowNodeCopy(copy, node);
  const statusLabel = workflowStatus(copy, node.statusLabel);

  return (
    <button
      type="button"
      onMouseDown={(event) => onDragStart(event, node)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      className={`absolute text-left rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent gdpro-node-card ${selected ? `gdpro-node-card-selected ${theme.border} ring-1 ring-current/20` : ''}`}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: node.size.width,
        height: node.size.height,
      }}
      aria-label={`${nodeCopy.title}, ${statusLabel}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${theme.rail}`} />
      <div className="px-3 py-2.5 pl-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gdpro-text-muted">{copy.stepLabel(node.phase)}</span>
              <h3 className="text-[12px] font-semibold text-gdpro-text truncate">{nodeCopy.title}</h3>
            </div>
            <p className="text-[10px] text-gdpro-text-muted mt-0.5 line-clamp-2">{nodeCopy.subtitle}</p>
          </div>
          <span className={`px-1.5 py-[2px] rounded-md border text-[9px] font-semibold shrink-0 max-w-[74px] truncate ${theme.badge}`}>
            {shortStatusLabel(statusLabel, copy)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {node.metrics.slice(0, 3).map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-md gdpro-surface-tile px-2 py-1">
              <div className="text-[12px] font-semibold text-gdpro-text leading-none truncate">{value}</div>
              <div className="text-[9px] text-gdpro-text-muted mt-1 truncate">{workflowMetricLabel(copy, label)}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[9px] text-gdpro-text-muted min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full ${lastActivity ? toneClass(lastActivity.tone).dot : theme.dot}`} />
            <span className="truncate">
              {lastActivity
                ? `${workflowActivityStatus(copy, lastActivity)}${copy.statusJoiner}${workflowActivityLabel(copy, lastActivity)}`
                : (copy.locale === 'en' ? nodeCopy.outputLabel : node.control?.summaryLabel || nodeCopy.outputLabel)}
            </span>
          </div>
          <div className="text-[9px] text-gdpro-text-muted shrink-0">
            {directActions ? copy.directActions(directActions) : copy.noDirectActions}
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyInspector({ copy }) {
  return (
    <aside className="hidden xl:flex w-[360px] shrink-0 flex-col border-l border-gdpro-border gdpro-inspector-shell p-4">
      <div className="text-[12px] font-semibold text-gdpro-text">{copy.emptyInspectorTitle}</div>
      <p className="text-[11px] leading-relaxed text-gdpro-text-muted mt-2">
        {copy.emptyInspectorDetail}
      </p>
    </aside>
  );
}

function runtimeAgentLabel(agentEnv, copy) {
  const runtimeCopy = copy.executionRuntime || {};
  return runtimeCopy.agentLabels?.[agentEnv] || runtimeCopy.agentLabels?.unknown || agentEnv || runtimeCopy.agentLabels?.unknown || '';
}

function runtimeConnectionLabel(connectionStatus, copy) {
  const runtimeCopy = copy.executionRuntime || {};
  return runtimeCopy.connectionLabels?.[connectionStatus] || runtimeCopy.connectionLabels?.unknown || connectionStatus || '';
}

function runtimeDeliveryLabel(config, copy) {
  const runtimeCopy = copy.executionRuntime || {};
  if (config?.deliveryRoute?.finalDeliveryAllowed) return runtimeCopy.sourceCandidate;
  if (config?.deliveryRoute?.vectorOutput || config?.deliveryRoute?.editableSource) return runtimeCopy.editableCandidate;
  return runtimeCopy.conceptOnly;
}

function runtimeHandoffTone(status) {
  if (status === 'ready') return 'success';
  if (status === 'local-only') return 'info';
  return 'warning';
}

function runtimeCheckTone(state) {
  if (state === 'ready') return 'success';
  if (state === 'idle') return 'info';
  return 'warning';
}

function runtimeCheckDetail(check, runtimeCopy) {
  return runtimeCopy.checkDetails?.[check.id]?.[check.detailCode]
    || runtimeCopy.checkStates?.[check.state]
    || check.detailCode
    || check.state;
}

function RuntimeHandoffCard({ runtimeInfo, selectedCount, handoffPlan, copy }) {
  const runtimeCopy = copy.executionRuntime;
  if (!runtimeCopy) return null;

  const imageConfig = runtimeInfo?.imageModelConfig || {};
  const plan = handoffPlan || buildRuntimeHandoffPlan(runtimeInfo, []);
  const statusTheme = toneClass(runtimeHandoffTone(plan.status));
  const partner = runtimeAgentLabel(runtimeInfo?.agentEnv, copy);
  const connection = runtimeConnectionLabel(runtimeInfo?.connectionStatus, copy);
  const imageName = imageConfig.displayName || runtimeInfo?.imageModel || runtimeCopy.notSelected;
  const llmName = runtimeInfo?.llm || runtimeCopy.notSelected;
  const routeLabel = runtimeDeliveryLabel(imageConfig, copy);
  const configuredLabel = imageConfig.configured ? runtimeCopy.ready : runtimeCopy.needsKey;
  const statusLabel = runtimeCopy.statusLabels?.[plan.status] || plan.status;
  const statusDescription = runtimeCopy.statusDescriptions?.[plan.status] || runtimeCopy.description(partner, connection);

  return (
    <div className={`mt-3 rounded-lg border px-3 py-2.5 ${statusTheme.panel}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Workflow className="w-3.5 h-3.5 text-gdpro-accent shrink-0" strokeWidth={2.2} />
          <div className="text-[10px] font-semibold text-gdpro-text truncate">{runtimeCopy.title}</div>
        </div>
        <span className={`rounded-md border px-1.5 py-[2px] text-[9px] font-semibold shrink-0 ${statusTheme.badge}`}>
          {statusLabel}
        </span>
      </div>
      <p className="mt-1 text-[9px] leading-relaxed text-gdpro-text-secondary">
        {statusDescription}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {[
          [runtimeCopy.partner, `${partner} · ${connection}`],
          [runtimeCopy.planningModel, llmName],
          [runtimeCopy.imageChannel, `${imageName} · ${configuredLabel}`],
          [runtimeCopy.deliveryRoute, `${routeLabel} · ${runtimeCopy.checkedActions(selectedCount)}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-gdpro-border bg-white/70 px-2 py-1.5 min-w-0">
            <div className="text-[9px] text-gdpro-text-muted truncate">{label}</div>
            <div className="mt-0.5 text-[10px] font-semibold leading-snug text-gdpro-text break-words">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-1">
        {(plan.checks || []).map((item) => {
          const checkTheme = toneClass(runtimeCheckTone(item.state));
          return (
            <div key={item.id} className="flex items-center justify-between gap-2 text-[9px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`h-1.5 w-1.5 rounded-full ${checkTheme.dot}`} />
                <span className="text-gdpro-text-muted truncate">{runtimeCopy.checks?.[item.id] || item.id}</span>
              </div>
              <span className="font-semibold text-gdpro-text-secondary truncate">{runtimeCheckDetail(item, runtimeCopy)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExecutionPreviewModal({ plan, onCancel, onConfirm, copy, runtimeInfo }) {
  const items = plan?.items || [];
  const [selectedKeys, setSelectedKeys] = useState(() => new Set((plan?.items || []).map((item) => operationKey(item))));
  const modal = copy.executionPreview;

  useEffect(() => {
    setSelectedKeys(new Set(items.map((item) => operationKey(item))));
  }, [plan?.id]);

  if (!plan) return null;

  const selectedItems = items.filter((item) => selectedKeys.has(operationKey(item)));
  const selectedNodeTitles = [...new Set(selectedItems.map((item) => item.nodeTitle).filter(Boolean))];
  const handoffPlan = buildRuntimeHandoffPlan(runtimeInfo, selectedItems);
  const allSelected = selectedItems.length === items.length && items.length > 0;
  const toggleItem = (item) => {
    const key = operationKey(item);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleAll = () => {
    setSelectedKeys(allSelected ? new Set() : new Set(items.map((item) => operationKey(item))));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop px-4">
      <section className="w-full max-w-[520px] rounded-lg gdpro-modal-shell overflow-hidden">
        <div className="px-4 py-3 border-b border-gdpro-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-gdpro-accent" strokeWidth={2.2} />
              <h2 className="text-[14px] font-semibold text-gdpro-text">{modal.title}</h2>
            </div>
            <p className="text-[11px] text-gdpro-text-muted mt-1 leading-relaxed">
              {modal.body(items.length)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-md text-gdpro-text-muted hover:text-gdpro-text hover:bg-gdpro-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
            aria-label={modal.close}
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2 min-w-0">
              <div className="text-[10px] text-gdpro-text-muted">{modal.scope}</div>
              <div className="text-[12px] font-semibold text-gdpro-text mt-0.5 truncate">{workflowTerm(copy, plan.scopeLabel || copy.defaultScope)}</div>
            </div>
            <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2 min-w-0">
              <div className="text-[10px] text-gdpro-text-muted">{modal.toRun}</div>
              <div className="text-[12px] font-semibold text-gdpro-text mt-0.5">{modal.count(selectedItems.length, items.length)}</div>
            </div>
          </div>

          <RuntimeHandoffCard runtimeInfo={runtimeInfo} selectedCount={selectedItems.length} handoffPlan={handoffPlan} copy={copy} />

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-gdpro-text-muted">{modal.listTitle}</div>
              <div className="text-[9px] text-gdpro-text-muted truncate">
                {selectedNodeTitles.length ? modal.affects(selectedNodeTitles.map((title) => workflowTerm(copy, title)).join(copy.listJoiner)) : modal.chooseFirst}
              </div>
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="px-2 py-1 rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-[10px] text-gdpro-text-secondary hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
            >
              {allSelected ? modal.clear : modal.selectAll}
            </button>
          </div>

          <div className="mt-3 space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {items.map((item, index) => (
              <button
                type="button"
                key={`${operationKey(item)}-${index}`}
                onClick={() => toggleItem(item)}
                className={`w-full text-left rounded-md border px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent ${
                  selectedKeys.has(operationKey(item))
                    ? 'border-gdpro-accent/45 bg-gdpro-accent/10'
                    : 'border-gdpro-border bg-gdpro-bg-elevated hover:border-gdpro-border-light'
                }`}
                aria-pressed={selectedKeys.has(operationKey(item))}
              >
                <div className="flex items-start gap-2">
                  <div className="shrink-0 mt-0.5">
                    {selectedKeys.has(operationKey(item)) ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2.3} />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-gdpro-text-muted" strokeWidth={2.3} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-gdpro-text truncate">{workflowTerm(copy, item.label)}</span>
                      <span className="px-1.5 py-[2px] rounded-md border text-[9px] text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20 shrink-0">
                        {copy.canHandleDirect}
                      </span>
                    </div>
                    <p className="text-[10px] text-gdpro-text-muted mt-1 line-clamp-2">{workflowSentence(copy, item.detail)}</p>
                    {item.nodeTitle && (
                      <div className="text-[9px] text-gdpro-text-muted/75 mt-1">{modal.fromStep(workflowTerm(copy, item.nodeTitle))}</div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-lg border border-gdpro-info/20 bg-gdpro-info/10 px-3 py-2">
            <div className="text-[10px] font-semibold text-gdpro-info">{modal.afterTitle}</div>
            <p className="text-[9px] leading-relaxed text-gdpro-info/85 mt-1">
              {modal.afterBody}
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gdpro-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-[7px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-[12px] text-gdpro-text-secondary hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
          >
            {modal.cancel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedItems)}
            disabled={!selectedItems.length}
            className="gdpro-button flex items-center gap-1.5 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5" strokeWidth={2.4} />
            {modal.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}

function ExecutionReportModal({ report, onClose, onFocusNode, onRequestPartnerHandoff, handoffState, copy }) {
  if (!report) return null;
  const modal = copy.executionReport;
  const mainTone = report.hasIssues ? 'warning' : 'success';
  const mainTheme = toneClass(mainTone);
  const firstNodeId = report.items.find((item) => item.nodeId)?.nodeId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop px-4">
      <section className="w-full max-w-[560px] rounded-lg gdpro-modal-shell overflow-hidden">
        <div className="px-4 py-3 border-b border-gdpro-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {report.hasIssues ? (
                <AlertTriangle className="w-4 h-4 text-gdpro-warning" strokeWidth={2.2} />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-gdpro-success" strokeWidth={2.2} />
              )}
              <h2 className="text-[14px] font-semibold text-gdpro-text">{modal.title}</h2>
            </div>
            <p className="text-[11px] text-gdpro-text-muted mt-1 leading-relaxed">
              {report.hasIssues ? modal.bodyIssues : modal.bodySuccess}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-gdpro-text-muted hover:text-gdpro-text hover:bg-gdpro-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
            aria-label={modal.close}
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] text-gdpro-text-muted">{modal.scope}</div>
                <div className="text-[12px] font-semibold text-gdpro-text mt-0.5 truncate">{report.scopeLabel}</div>
              </div>
              <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${mainTheme.badge}`}>
                {report.hasIssues ? modal.needsReview : modal.done}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
              <div className="text-[10px] text-gdpro-text-muted">{modal.applied}</div>
              <div className="text-[18px] font-semibold text-gdpro-success mt-0.5 tabular-nums">{report.summary.applied}</div>
            </div>
            <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
              <div className="text-[10px] text-gdpro-text-muted">{modal.skipped}</div>
              <div className="text-[18px] font-semibold text-gdpro-info mt-0.5 tabular-nums">{report.summary.skipped}</div>
            </div>
            <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
              <div className="text-[10px] text-gdpro-text-muted">{modal.blocked}</div>
              <div className="text-[18px] font-semibold text-gdpro-warning mt-0.5 tabular-nums">{report.summary.blocked}</div>
            </div>
          </div>

          <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {report.items.map((item) => {
              const theme = toneClass(item.tone);
              return (
                <div key={item.id} className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-gdpro-text truncate">{item.label}</div>
                      <p className="text-[10px] leading-relaxed text-gdpro-text-muted mt-1 line-clamp-2">{item.detail}</p>
                    </div>
                    <span className={`px-1.5 py-[2px] rounded-md border text-[9px] shrink-0 ${theme.badge}`}>
                      {item.statusLabel}
                    </span>
                  </div>
                  {item.nodeTitle && (
                    <div className="mt-1.5 text-[9px] text-gdpro-text-muted/75 truncate">{modal.step(item.nodeTitle)}</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className={`mt-3 rounded-lg border px-3 py-2 ${report.hasIssues ? 'border-gdpro-warning/20 bg-gdpro-warning/10' : 'border-gdpro-success/20 bg-gdpro-success/10'}`}>
            <div className={`text-[10px] font-semibold ${report.hasIssues ? 'text-gdpro-warning' : 'text-gdpro-success'}`}>{modal.nextTitle}</div>
            <p className={`text-[9px] leading-relaxed mt-1 ${report.hasIssues ? 'text-gdpro-warning/85' : 'text-gdpro-success/85'}`}>
              {report.hasIssues ? modal.nextIssues : modal.nextSuccess}
            </p>
          </div>

          {report.auditFilePath && (
            <div className="mt-3 rounded-lg border border-gdpro-info/20 bg-gdpro-info/10 px-3 py-2">
              <div className="text-[10px] font-semibold text-gdpro-info">{modal.auditTitle}</div>
              <p className="text-[9px] leading-relaxed text-gdpro-info/85 mt-1">
                {typeof modal.auditBody === 'function' ? modal.auditBody(report.auditFilePath) : report.auditFilePath}
              </p>
              <div className="mt-1.5 truncate rounded-md border border-gdpro-info/15 bg-white/70 px-2 py-1 font-mono text-[9px] text-gdpro-info">
                {report.auditFilePath}
              </div>
            </div>
          )}

          {report.partnerTaskPath && (
            <div className="mt-3 rounded-lg border border-gdpro-accent/20 bg-gdpro-accent/10 px-3 py-2">
              <div className="text-[10px] font-semibold text-gdpro-accent">{modal.partnerTaskTitle}</div>
              <p className="text-[9px] leading-relaxed text-gdpro-accent/85 mt-1">
                {typeof modal.partnerTaskBody === 'function' ? modal.partnerTaskBody(report.partnerTaskPath) : report.partnerTaskPath}
              </p>
              <div className="mt-1.5 truncate rounded-md border border-gdpro-accent/15 bg-white/70 px-2 py-1 font-mono text-[9px] text-gdpro-accent">
                {report.partnerTaskPath}
              </div>
              {onRequestPartnerHandoff && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRequestPartnerHandoff(report)}
                    disabled={handoffState?.state === 'checking'}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gdpro-accent/20 bg-white/80 px-2.5 py-1.5 text-[10px] font-semibold text-gdpro-accent hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MessageSquare className="w-3 h-3" strokeWidth={2.2} />
                    {handoffState?.state === 'checking' ? modal.partnerTaskChecking : modal.partnerTaskAction}
                  </button>
                  {handoffState?.message && (
                    <span className="min-w-0 text-[9px] leading-relaxed text-gdpro-accent/85">
                      {handoffState.message}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gdpro-border flex items-center justify-end gap-2">
          {firstNodeId && (
            <button
              type="button"
              onClick={() => onFocusNode(firstNodeId)}
              className="px-3 py-[7px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-[12px] text-gdpro-text-secondary hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
            >
              {modal.focusStep}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="gdpro-button flex items-center gap-1.5 text-[12px]"
          >
            {modal.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}

function MaterialPickerModal({ open, manifestLocked, existingTemplateIds, recommendedTargets = [], onCancel, onChoose, copy }) {
  if (!open) return null;
  const modal = copy.materialPicker;
  const recommendedTemplateIds = new Set((recommendedTargets || []).map((target) => target.templateId).filter(Boolean));
  const recommendedTemplates = MATERIAL_TEMPLATES.filter((template) => recommendedTemplateIds.has(template.id));
  const missingRecommendedCount = recommendedTemplates.filter((template) => !existingTemplateIds.has(template.id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop px-4">
      <section className="w-full max-w-[740px] rounded-lg gdpro-modal-shell overflow-hidden">
        <div className="px-4 py-3 border-b border-gdpro-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-gdpro-accent" strokeWidth={2.2} />
              <h2 className="text-[14px] font-semibold text-gdpro-text">{modal.title}</h2>
            </div>
            <p className="text-[11px] text-gdpro-text-muted mt-1 leading-relaxed">
              {modal.body}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-md text-gdpro-text-muted hover:text-gdpro-text hover:bg-gdpro-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
            aria-label={modal.close}
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-4 py-3">
          {!manifestLocked && (
            <div className="mb-3 rounded-lg border border-gdpro-warning/20 bg-gdpro-warning/10 px-3 py-2">
              <div className="text-[11px] font-semibold text-gdpro-warning">{modal.lockFirstTitle}</div>
              <p className="text-[10px] leading-relaxed text-gdpro-warning/85 mt-1">
                {modal.lockFirstBody}
              </p>
            </div>
          )}

          {recommendedTemplates.length > 0 && (
            <div className="mb-3 rounded-lg border border-gdpro-accent/20 bg-gdpro-accent/10 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-gdpro-accent">{modal.recommendedTitle}</div>
                  <p className="text-[10px] leading-relaxed text-gdpro-accent/85 mt-1">
                    {modal.recommendedBody(recommendedTemplates.length, missingRecommendedCount)}
                  </p>
                </div>
                <span className="shrink-0 rounded-md border border-gdpro-accent/20 bg-gdpro-bg-elevated/80 px-1.5 py-[2px] text-[9px] font-semibold text-gdpro-accent">
                  {modal.recommendedBadge}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recommendedTemplates.map((template) => {
                  const alreadyAdded = existingTemplateIds.has(template.id);
                  return (
                    <button
                      type="button"
                      key={`recommended-${template.id}`}
                      onClick={() => onChoose(template)}
                      disabled={!manifestLocked || alreadyAdded}
                      className="rounded-md border border-gdpro-accent/25 bg-gdpro-bg-elevated px-2 py-1.5 text-[10px] font-semibold text-gdpro-text-secondary hover:text-gdpro-accent hover:border-gdpro-accent/35 disabled:opacity-55 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
                    >
                      {alreadyAdded ? modal.recommendedDone(materialTemplateName(copy, template)) : modal.recommendedAdd(materialTemplateName(copy, template))}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MATERIAL_TEMPLATES.map((template) => {
              const alreadyAdded = existingTemplateIds.has(template.id);
              const isRecommended = recommendedTemplateIds.has(template.id);
              return (
                <button
                  type="button"
                  key={template.id}
                  onClick={() => onChoose(template)}
                  disabled={!manifestLocked || alreadyAdded}
                  className={`text-left rounded-lg border px-3 py-3 min-h-[112px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent disabled:opacity-45 disabled:cursor-not-allowed ${
                    alreadyAdded
                      ? 'border-gdpro-accent/35 bg-gdpro-accent/10'
                      : isRecommended
                        ? 'border-gdpro-accent/28 bg-gdpro-accent/5 hover:border-gdpro-accent/38'
                        : 'border-gdpro-border bg-gdpro-bg-elevated hover:border-gdpro-border-light'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-gdpro-text truncate">{materialTemplateName(copy, template)}</div>
                      <div className="text-[10px] text-gdpro-text-muted mt-1 truncate">{templateDetail(template, copy)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`px-1.5 py-[2px] rounded-md border text-[9px] ${
                        alreadyAdded
                          ? 'text-gdpro-accent bg-gdpro-accent/10 border-gdpro-accent/20'
                          : 'text-gdpro-text-muted bg-gdpro-bg-surface border-gdpro-border'
                      }`}>
                        {alreadyAdded ? modal.added : modal.available}
                      </span>
                      {isRecommended && (
                        <span className="px-1.5 py-[2px] rounded-md border border-gdpro-accent/20 bg-gdpro-accent/10 text-[9px] text-gdpro-accent">
                          {modal.recommendedBadge}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {template.exportTargets.slice(0, 3).map((target) => (
                      <span key={target} className="px-1.5 py-[2px] rounded-md bg-gdpro-bg-surface border border-gdpro-border text-[9px] text-gdpro-text-muted">
                        {exportTargetLabel(target, copy)}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-lg border border-gdpro-info/20 bg-gdpro-info/10 px-3 py-2">
            <div className="text-[10px] font-semibold text-gdpro-info">{modal.afterTitle}</div>
            <p className="text-[9px] leading-relaxed text-gdpro-info/85 mt-1">
              {modal.afterBody}
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gdpro-border flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-[7px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-[12px] text-gdpro-text-secondary hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
          >
            {modal.cancel}
          </button>
        </div>
      </section>
    </div>
  );
}

function ReviewDecisionModal({ open, reviewBoard, onCancel, onChoose, copy }) {
  if (!open) return null;
  const modal = copy.reviewDecision;
  const items = reviewBoard?.items || [];
  const pendingItems = items.filter((item) => item.status === 'pending' || item.status === 'changes-requested');
  const blockedItems = items.filter((item) => item.status === 'blocked');
  const signedItems = items.filter((item) => item.status === 'approved' || item.status === 'system-pass');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center gdpro-modal-backdrop px-4">
      <section className="w-full max-w-[720px] rounded-lg gdpro-modal-shell overflow-hidden">
        <div className="px-4 py-3 border-b border-gdpro-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-gdpro-accent" strokeWidth={2.2} />
              <h2 className="text-[14px] font-semibold text-gdpro-text">{modal.title}</h2>
            </div>
            <p className="text-[11px] text-gdpro-text-muted mt-1 leading-relaxed">
              {modal.body}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-md text-gdpro-text-muted hover:text-gdpro-text hover:bg-gdpro-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
            aria-label={modal.close}
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
              <div className="text-[10px] text-gdpro-text-muted">{modal.signed}</div>
              <div className="text-[18px] font-semibold text-gdpro-success mt-0.5 tabular-nums">{signedItems.length}</div>
            </div>
            <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
              <div className="text-[10px] text-gdpro-text-muted">{modal.pending}</div>
              <div className="text-[18px] font-semibold text-gdpro-info mt-0.5 tabular-nums">{pendingItems.length}</div>
            </div>
            <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
              <div className="text-[10px] text-gdpro-text-muted">{modal.blocked}</div>
              <div className="text-[18px] font-semibold text-gdpro-danger mt-0.5 tabular-nums">{blockedItems.length}</div>
            </div>
          </div>

          <div className="mt-3 space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {items.slice(0, 10).map((item) => {
              const tone = reviewStatusTone(item.status);
              const theme = toneClass(tone);
              const canDecide = item.status === 'pending' || item.status === 'changes-requested';
              return (
                <div key={item.id} className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-gdpro-text truncate">{friendlyReviewLabel(item, copy)}</div>
                      <p className="text-[10px] leading-relaxed text-gdpro-text-muted mt-1 line-clamp-2">{friendlyReviewDetail(item, copy)}</p>
                    </div>
                    <span className={`px-1.5 py-[2px] rounded-md border text-[9px] shrink-0 ${theme.badge}`}>
                      {reviewStatusLabel(item.status, copy)}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[9px] text-gdpro-text-muted/75 truncate">{friendlyReviewEvidence(item, copy)}</div>
                  {canDecide ? (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => onChoose(item, 'approved')}
                        className="rounded-md border border-gdpro-success/25 bg-gdpro-success/10 px-2 py-1.5 text-[10px] font-semibold text-gdpro-success hover:bg-gdpro-success/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
                      >
                        {modal.approve}
                      </button>
                      <button
                        type="button"
                        onClick={() => onChoose(item, 'changes_requested')}
                        className="rounded-md border border-gdpro-warning/25 bg-gdpro-warning/10 px-2 py-1.5 text-[10px] font-semibold text-gdpro-warning hover:bg-gdpro-warning/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
                      >
                        {modal.requestChanges}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-md border border-gdpro-border bg-gdpro-bg-surface px-2 py-1.5 text-[10px] text-gdpro-text-muted">
                      {item.status === 'blocked' ? modal.blockedHint : modal.recordedHint}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-lg border border-gdpro-info/20 bg-gdpro-info/10 px-3 py-2">
            <div className="text-[10px] font-semibold text-gdpro-info">{modal.afterTitle}</div>
            <p className="text-[9px] leading-relaxed text-gdpro-info/85 mt-1">
              {modal.afterBody}
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gdpro-border flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-[7px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-[12px] text-gdpro-text-secondary hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
          >
            {modal.cancel}
          </button>
        </div>
      </section>
    </div>
  );
}

const SOURCE_NODE_IDS = new Set(['material-plan', 'artwork-source', 'preflight-review', 'delivery-package']);

function materialSourceAudit(materialPlan, material) {
  return (materialPlan?.evaluations || []).find((item) => item.materialId === material?.id)?.artworkAudit || null;
}

function sourceTone(material, audit) {
  if (!material?.artwork?.svg) return 'warning';
  if (audit?.passed) return 'success';
  return 'danger';
}

function sourceStatusLabel(material, audit, copy) {
  const sourceCopy = copy.sourceHandoff;
  if (!material?.artwork?.svg) return sourceCopy.sourceMissing;
  if (audit?.passed) return sourceCopy.sourceReady;
  return sourceCopy.sourceNeedsFix;
}

function buildSourceOperationItem(material, audit, node, copy) {
  const sourceCopy = copy.sourceHandoff;
  const nodeCopy = workflowNodeCopy(copy, node);
  const materialName = workflowTerm(copy, material?.name || sourceCopy.materialFallback);
  const hasSource = Boolean(material?.artwork?.svg);
  const canExport = hasSource && audit?.passed;
  const base = {
    nodeId: node.id,
    nodeTitle: nodeCopy.title,
    autoRunnable: true,
  };

  if (!hasSource) {
    return {
      ...base,
      itemId: `source-create-${material.id}`,
      label: sourceCopy.createOne(materialName),
      detail: sourceCopy.createOneDetail,
      operation: {
        id: `gui_source_create_${material.id}_${Date.now()}`,
        type: 'generate_material_artwork',
        params: { materialId: material.id },
        reason: sourceCopy.createOneReason(materialName),
      },
    };
  }

  if (!audit?.passed) {
    return {
      ...base,
      itemId: `source-rebuild-${material.id}`,
      label: sourceCopy.rebuildOne(materialName),
      detail: sourceCopy.rebuildOneDetail,
      operation: {
        id: `gui_source_rebuild_${material.id}_${Date.now()}`,
        type: 'generate_material_artwork',
        params: { materialId: material.id },
        reason: sourceCopy.rebuildOneReason(materialName),
      },
    };
  }

  if (canExport && material.status !== 'exported') {
    return {
      ...base,
      itemId: `source-export-${material.id}`,
      label: sourceCopy.markReady(materialName),
      detail: sourceCopy.markReadyDetail,
      operation: {
        id: `gui_source_export_${material.id}_${Date.now()}`,
        type: 'set_material_status',
        params: { materialId: material.id, status: 'exported' },
        reason: sourceCopy.markReadyReason(materialName),
      },
    };
  }

  return null;
}

function SourceHandoffPanel({ node, graph, onRunOperations, copy }) {
  if (!SOURCE_NODE_IDS.has(node?.id)) return null;

  const sourceCopy = copy.sourceHandoff;
  const materialPlan = graph?.state?.materialPlan || null;
  const materials = materialPlan?.materials || [];
  const stats = materialPlan?.stats || {};
  const total = stats.total || materials.length;
  const sourceCount = stats.sourceArtworks || materials.filter((material) => material.artwork?.svg).length;
  const checkedCount = stats.sourceQaPassed || 0;
  const exportedCount = stats.exported || materials.filter((material) => material.status === 'exported').length;
  const readiness = total ? Math.round(((sourceCount + checkedCount + exportedCount) / (total * 3)) * 100) : 0;
  const nodeCopy = workflowNodeCopy(copy, node);

  const runSourceAction = (material) => {
    const action = buildSourceOperationItem(material, materialSourceAudit(materialPlan, material), node, copy);
    if (!action) return;
    onRunOperations([action], action.label, nodeCopy.title);
  };

  return (
    <section className="py-4 border-b border-gdpro-border/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
            <div className="text-[11px] font-semibold text-gdpro-text-muted">{sourceCopy.title}</div>
          </div>
          <p className="text-[9px] leading-relaxed text-gdpro-text-muted mt-1">
            {sourceCopy.description}
          </p>
        </div>
        <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${readiness >= 90 ? toneClass('success').badge : readiness >= 45 ? toneClass('warning').badge : toneClass('danger').badge}`}>
          {sourceCopy.readiness(readiness)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mt-3">
        {[
          [sourceCopy.total, total],
          [sourceCopy.sources, sourceCount],
          [sourceCopy.checked, checkedCount],
          [sourceCopy.exported, exportedCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md gdpro-surface-tile px-2 py-1.5 min-w-0">
            <div className="text-[13px] font-semibold text-gdpro-text leading-none tabular-nums">{value}</div>
            <div className="text-[9px] text-gdpro-text-muted mt-1 truncate">{label}</div>
          </div>
        ))}
      </div>

      {materials.length ? (
        <div className="mt-3 space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {materials.slice(0, 8).map((material) => {
            const audit = materialSourceAudit(materialPlan, material);
            const tone = sourceTone(material, audit);
            const theme = toneClass(tone);
            const action = buildSourceOperationItem(material, audit, node, copy);
            const statusText = workflowStatus(copy, statusTextFallback(material.status));
            return (
              <div key={material.id} className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated overflow-hidden">
                <div className="flex items-start gap-2 px-3 py-2">
                  <div className="w-12 h-12 rounded-md border border-gdpro-border bg-white shrink-0 flex items-center justify-center overflow-hidden">
                    {material.artwork?.svg ? (
                      <img src={svgToDataUrl(material.artwork.svg)} alt={copy.previewAlt(material.name)} className="w-full h-full object-contain" />
                    ) : (
                      <PenTool className="w-4 h-4 text-gdpro-text-muted" strokeWidth={1.9} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-gdpro-text truncate">{workflowTerm(copy, material.name)}</div>
                        <div className="text-[9px] text-gdpro-text-muted truncate mt-0.5">
                          {material.artwork?.sourcePath || sourceCopy.noSourcePath}
                        </div>
                      </div>
                      <span className={`px-1.5 py-[2px] rounded-md border text-[9px] shrink-0 ${theme.badge}`}>
                        {sourceStatusLabel(material, audit, copy)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="px-1.5 py-[2px] rounded-md border border-gdpro-border bg-gdpro-bg-surface text-[9px] text-gdpro-text-muted">
                        {sourceCopy.format}
                      </span>
                      <span className={`px-1.5 py-[2px] rounded-md border text-[9px] ${audit?.passed ? toneClass('success').badge : toneClass('warning').badge}`}>
                        {sourceCopy.qa(audit?.readiness || 0)}
                      </span>
                      <span className={`px-1.5 py-[2px] rounded-md border text-[9px] ${material.status === 'exported' ? toneClass('success').badge : toneClass('muted').badge}`}>
                        {statusText}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      {action ? (
                        <button
                          type="button"
                          onClick={() => runSourceAction(material)}
                          className="rounded-md border border-gdpro-accent/30 bg-gdpro-accent/10 px-2 py-1.5 text-[10px] font-semibold text-gdpro-accent hover:bg-gdpro-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent flex items-center gap-1.5"
                        >
                          <PenTool className="w-3 h-3" strokeWidth={2.3} />
                          {action.label}
                        </button>
                      ) : (
                        <span className="rounded-md border border-gdpro-success/20 bg-gdpro-success/10 px-2 py-1.5 text-[10px] font-semibold text-gdpro-success">
                          {sourceCopy.readyForPackage}
                        </span>
                      )}
                      {material.artwork?.svg && (
                        <button
                          type="button"
                          onClick={() => downloadSvgMaterial(material)}
                          className="rounded-md border border-gdpro-border bg-gdpro-bg-surface p-1.5 text-gdpro-text-muted hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
                          title={sourceCopy.download}
                          aria-label={sourceCopy.download}
                        >
                          <Download className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-gdpro-warning/20 bg-gdpro-warning/10 px-3 py-2">
          <div className="text-[10px] font-semibold text-gdpro-warning">{sourceCopy.emptyTitle}</div>
          <p className="text-[9px] leading-relaxed text-gdpro-warning/85 mt-1">{sourceCopy.emptyBody}</p>
        </div>
      )}
    </section>
  );
}

function deliveryPackageTone(deliveryPackage) {
  if (deliveryPackage?.ready) return 'success';
  if (deliveryPackage?.stats?.critical) return 'danger';
  if (deliveryPackage?.blockers?.length) return 'warning';
  return 'muted';
}

function deliveryEntryTone(entry) {
  if (entry?.ready) return 'success';
  if (entry?.required) return 'warning';
  return 'muted';
}

function deliveryEntryLabel(copy, label) {
  const parts = String(label || '').split(' / ');
  if (parts.length < 2) return workflowTerm(copy, label);
  return parts.map((part) => workflowTerm(copy, part)).join(' / ');
}

function buildDeliveryPackageOperationItem(node, copy) {
  const packageCopy = copy.deliveryEvidence;
  const nodeCopy = workflowNodeCopy(copy, node);
  return {
    nodeId: node.id,
    nodeTitle: nodeCopy.title,
    itemId: `delivery-package-create-${Date.now()}`,
    label: packageCopy.prepare,
    detail: packageCopy.prepareDetail,
    autoRunnable: true,
    operation: {
      id: `gui_delivery_package_${Date.now()}`,
      type: 'create_delivery_package',
      params: {},
      reason: packageCopy.prepareReason,
    },
  };
}

function DeliveryEvidencePanel({ node, graph, onRunOperations, copy }) {
  if (node?.id !== 'delivery-package') return null;

  const packageCopy = copy.deliveryEvidence;
  const deliveryPackage = graph?.state?.deliveryPackage || null;
  if (!deliveryPackage) return null;

  const stats = deliveryPackage.stats || {};
  const folders = (deliveryPackage.folders || []).filter((folder) => folder.itemCount > 0).slice(0, 5);
  const entries = (deliveryPackage.entries || [])
    .filter((entry) => entry.required || entry.type === 'material-source')
    .slice(0, 7);
  const topBlocker = (deliveryPackage.blockers || [])[0];
  const tone = toneClass(deliveryPackageTone(deliveryPackage));
  const nodeCopy = workflowNodeCopy(copy, node);

  const runPreparePackage = () => {
    const action = buildDeliveryPackageOperationItem(node, copy);
    onRunOperations([action], action.label, nodeCopy.title);
  };

  return (
    <section className="py-4 border-b border-gdpro-border/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
            <div className="text-[11px] font-semibold text-gdpro-text-muted">{packageCopy.title}</div>
          </div>
          <p className="text-[9px] leading-relaxed text-gdpro-text-muted mt-1">
            {packageCopy.description}
          </p>
        </div>
        <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${tone.badge}`}>
          {packageCopy.readiness(deliveryPackage.readiness || 0)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mt-3">
        {[
          [packageCopy.required, `${stats.readyRequired || 0}/${stats.requiredEntries || 0}`],
          [packageCopy.sources, `${stats.readyMaterialExports || 0}/${stats.materialExports || 0}`],
          [packageCopy.files, `${stats.readyEntries || 0}/${stats.entries || 0}`],
          [packageCopy.blockers, deliveryPackage.blockers?.length || 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md gdpro-surface-tile px-2 py-1.5 min-w-0">
            <div className="text-[13px] font-semibold text-gdpro-text leading-none tabular-nums truncate">{value}</div>
            <div className="text-[9px] text-gdpro-text-muted mt-1 truncate">{label}</div>
          </div>
        ))}
      </div>

      {topBlocker ? (
        <div className="mt-3 rounded-lg border border-gdpro-warning/20 bg-gdpro-warning/10 px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-gdpro-warning shrink-0 mt-0.5" strokeWidth={2.2} />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-gdpro-warning truncate">{workflowSentence(copy, topBlocker.title)}</div>
              <p className="text-[9px] leading-relaxed text-gdpro-warning/85 mt-1 line-clamp-2">
                {workflowSentence(copy, topBlocker.fix || topBlocker.detail)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-gdpro-success/20 bg-gdpro-success/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-gdpro-success" strokeWidth={2.3} />
            <div className="text-[10px] font-semibold text-gdpro-success">{packageCopy.noBlockers}</div>
          </div>
        </div>
      )}

      {folders.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-[10px] font-semibold text-gdpro-text-muted">{packageCopy.folders}</div>
          {folders.map((folder) => (
            <div key={folder.id} className="flex items-center gap-2 rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5 min-w-0">
              <StatusIcon tone={folder.ready ? 'success' : 'warning'} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold text-gdpro-text truncate">{workflowTerm(copy, folder.label)}</div>
                <div className="text-[9px] text-gdpro-text-muted truncate">{folder.path} · {packageCopy.folderReady(folder.readyCount || 0, folder.itemCount || 0)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-[10px] font-semibold text-gdpro-text-muted">{packageCopy.clientReceives}</div>
          <div className="max-h-48 overflow-y-auto pr-1 space-y-1.5">
            {entries.map((entry) => {
              const entryTheme = toneClass(deliveryEntryTone(entry));
              return (
                <div key={entry.id} className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-gdpro-text truncate">{deliveryEntryLabel(copy, entry.label)}</div>
                      <div className="text-[9px] text-gdpro-text-muted truncate mt-0.5">{entry.path}</div>
                    </div>
                    <span className={`px-1.5 py-[2px] rounded-md border text-[9px] shrink-0 ${entryTheme.badge}`}>
                      {entry.ready ? packageCopy.ready : entry.required ? packageCopy.missing : packageCopy.optional}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={runPreparePackage}
        className="mt-3 w-full rounded-md border border-gdpro-accent/30 bg-gdpro-accent/10 px-3 py-2 text-[11px] font-semibold text-gdpro-accent hover:bg-gdpro-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent flex items-center justify-center gap-1.5"
      >
        <FileText className="w-3.5 h-3.5" strokeWidth={2.3} />
        {deliveryPackage.ready ? packageCopy.refresh : packageCopy.prepare}
      </button>
    </section>
  );
}

function statusTextFallback(value) {
  if (value === 'exported') return '已导出';
  if (value === 'approved') return '已确认';
  if (value === 'designing') return '制作中';
  if (value === 'planned') return '已计划';
  return value || '未开始';
}

function brandKitItemDetail(copy, kit, item) {
  const details = copy.brandPassport?.details || {};
  const stats = kit?.stats || {};
  const materials = stats.materials || 0;
  const detailFactory = details[item.id];
  if (typeof detailFactory === 'function') {
    return detailFactory({
      ...stats,
      passed: item.passed,
      detail: item.detail,
      materials,
    });
  }
  return copy.locale === 'en' ? workflowSentence(copy, item.detail) : item.detail;
}

function brandKitOperationItem(node, graph, copy) {
  const passport = copy.brandPassport;
  const manifest = graph?.state?.manifest;
  const kit = graph?.state?.brandConsistencyKit;
  const nodeCopy = workflowNodeCopy(copy, node);
  if (!manifest || manifest.locked || !manifest.productionReady) return null;

  return {
    itemId: `brand-kit-lock-${manifest.sourceRevision || 'current'}`,
    label: manifest.stale ? passport.relock : passport.lock,
    detail: passport.lockDetail,
    autoRunnable: true,
    nodeId: node.id,
    nodeTitle: nodeCopy.title,
    operation: {
      id: `gui_brand_kit_lock_${Date.now()}`,
      type: 'lock_asset_manifest',
      params: {},
      reason: passport.lockReason(kit?.brandName || manifest.brandName || ''),
    },
  };
}

function BrandPassportPanel({ node, graph, onRunOperations, copy }) {
  const kit = graph?.state?.brandConsistencyKit;
  if (!kit) return null;

  const passport = copy.brandPassport;
  const topItems = (kit.contract || []).slice(0, 9);
  const issue = (kit.issues || [])[0];
  const action = brandKitOperationItem(node, graph, copy);
  const statusToneName = kit.readyForDelivery ? 'success' : kit.locked ? 'info' : 'warning';
  const statusTheme = toneClass(statusToneName);
  const nodeCopy = workflowNodeCopy(copy, node);

  return (
    <section className="py-4 border-b border-gdpro-border/80">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated overflow-hidden">
        <div className="px-3 py-2.5 border-b border-gdpro-border bg-gdpro-bg-surface/55">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2.1} />
                <div className="text-[11px] font-semibold text-gdpro-text">{passport.title}</div>
              </div>
              <p className="text-[9px] leading-relaxed text-gdpro-text-muted mt-1">
                {passport.description}
              </p>
            </div>
            <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${statusTheme.badge}`}>
              {passport.readiness(kit.readiness || 0)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-gdpro-text truncate">{kit.brandName || passport.unnamed}</div>
              <div className="text-[9px] text-gdpro-text-muted truncate">{workflowStatus(copy, kit.statusLabel)}</div>
            </div>
            {action ? (
              <button
                type="button"
                onClick={() => onRunOperations([action], action.label, nodeCopy.title)}
                className="rounded-md border border-gdpro-accent/30 bg-gdpro-accent/10 px-2 py-1.5 text-[10px] font-semibold text-gdpro-accent hover:bg-gdpro-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
              >
                {action.label}
              </button>
            ) : (
              <span className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5 text-[10px] text-gdpro-text-muted">
                {kit.readyForDelivery ? passport.ready : passport.watch}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-px bg-gdpro-border/70">
          {topItems.map((item) => {
            const itemTheme = toneClass(item.passed ? 'success' : 'warning');
            return (
              <div key={item.id} className="bg-gdpro-bg-elevated px-2 py-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${itemTheme.dot} shrink-0`} />
                  <span className="text-[9px] font-semibold text-gdpro-text truncate">
                    {copy.locale === 'en' ? item.labelEn || workflowTerm(copy, item.label) : item.label}
                  </span>
                </div>
                <div className="text-[8.5px] leading-snug text-gdpro-text-muted mt-1 line-clamp-2">
                  {brandKitItemDetail(copy, kit, item)}
                </div>
              </div>
            );
          })}
        </div>

        {issue && (
          <div className="px-3 py-2 border-t border-gdpro-border">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-gdpro-warning shrink-0 mt-0.5" strokeWidth={2} />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-gdpro-warning truncate">{workflowTerm(copy, issue.title)}</div>
                <p className="text-[9px] leading-relaxed text-gdpro-warning/85 mt-0.5 line-clamp-2">{workflowSentence(copy, issue.fix || issue.detail)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Inspector({ node, graph, onRunOperations, onOpenMaterialPicker, onOpenReviewDecision, onAskAssistant, copy }) {
  if (!node) return <EmptyInspector copy={copy} />;

  const theme = toneClass(node.tone);
  const nodeCopy = workflowNodeCopy(copy, node);
  const statusLabel = workflowStatus(copy, node.statusLabel);
  const upstream = graph.edges.filter((edge) => edge.to === node.id).map((edge) => graph.nodes.find((entry) => entry.id === edge.from)).filter(Boolean);
  const downstream = graph.edges.filter((edge) => edge.from === node.id).map((edge) => graph.nodes.find((entry) => entry.id === edge.to)).filter(Boolean);
  const directOps = scopedOperations(node, node.operations.filter((op) => op.autoRunnable));
  const askAssistant = () => {
    onAskAssistant?.({
      prompt: buildNodeAssistantPrompt(node, graph, copy),
      action: 'inspect_workflow_node',
    });
  };

  return (
    <aside className="hidden xl:flex w-[360px] shrink-0 flex-col border-l border-gdpro-border gdpro-inspector-shell">
      <div className="px-4 py-3 border-b border-gdpro-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusIcon tone={node.tone} />
              <h2 className="text-[13px] font-semibold text-gdpro-text truncate">{nodeCopy.title}</h2>
            </div>
            <p className="text-[10px] text-gdpro-text-muted mt-1 leading-relaxed">{nodeCopy.subtitle}</p>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 max-w-[118px] truncate ${theme.badge}`}>
            {statusLabel}
          </span>
        </div>
        {onAskAssistant && (
          <button
            type="button"
            onClick={askAssistant}
            className="mt-3 w-full rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2 text-[11px] font-semibold text-gdpro-text-secondary hover:text-gdpro-text hover:border-gdpro-border-light focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent flex items-center justify-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2.2} />
            {copy.askStudio}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        <PreviewPanel preview={node.preview} copy={copy} />
        <BrandPassportPanel node={node} graph={graph} onRunOperations={onRunOperations} copy={copy} />
        <SourceHandoffPanel node={node} graph={graph} onRunOperations={onRunOperations} copy={copy} />
        <DeliveryEvidencePanel node={node} graph={graph} onRunOperations={onRunOperations} copy={copy} />
        <ActivityPanel node={node} graph={graph} copy={copy} />
        <ControlChecksPanel node={node} copy={copy} />

        <section className="py-4 border-b border-gdpro-border/80">
          <div className="text-[11px] font-semibold text-gdpro-text-muted">{copy.currentProgress}</div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {node.metrics.slice(0, 3).map(([label, value]) => (
              <div key={label} className="rounded-lg gdpro-surface-tile px-3 py-2 min-w-0">
                <div className="text-[18px] font-semibold text-gdpro-text leading-none truncate">{value}</div>
                <div className="text-[10px] text-gdpro-text-muted mt-1 truncate">{workflowMetricLabel(copy, label)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-4 border-b border-gdpro-border/80">
          <div className="text-[11px] font-semibold text-gdpro-text-muted">{copy.dependencies}</div>
          <div className="space-y-2 mt-3">
            <div className="rounded-lg gdpro-surface-tile p-3">
              <div className="text-[10px] text-gdpro-text-muted mb-1">{copy.needsBefore}</div>
              <div className="flex flex-wrap gap-1.5">
                {(upstream.length ? upstream : [{ id: 'none', title: copy.noPrerequisite, tone: 'muted' }]).map((item) => (
                  <span key={item.id} className={`px-1.5 py-[2px] rounded-md border text-[9px] font-semibold ${toneClass(item.tone).badge}`}>
                    {item.id === 'none' ? item.title : workflowNodeCopy(copy, item).title}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg gdpro-surface-tile p-3">
              <div className="text-[10px] text-gdpro-text-muted mb-1">{copy.affectsAfter}</div>
              <div className="flex flex-wrap gap-1.5">
                {(downstream.length ? downstream : [{ id: 'none', title: copy.finalDelivery, tone: 'muted' }]).map((item) => (
                  <span key={item.id} className={`px-1.5 py-[2px] rounded-md border text-[9px] font-semibold ${toneClass(item.tone).badge}`}>
                    {item.id === 'none' ? item.title : workflowNodeCopy(copy, item).title}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-4 border-b border-gdpro-border/80">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-gdpro-text-muted">{copy.workbenchActions}</div>
            <span className="text-[10px] text-gdpro-text-muted">{copy.actionsCount(directOps.length)}</span>
          </div>
          {node.id === 'material-plan' && (
            <button
              type="button"
              onClick={onOpenMaterialPicker}
              className="mt-3 w-full rounded-md border border-gdpro-accent/30 bg-gdpro-accent/10 px-3 py-2 text-[11px] font-semibold text-gdpro-accent hover:bg-gdpro-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
              {copy.addDeliverable}
            </button>
          )}
          {node.id === 'review-board' && (
            <button
              type="button"
              onClick={onOpenReviewDecision}
              className="mt-3 w-full rounded-md border border-gdpro-accent/30 bg-gdpro-accent/10 px-3 py-2 text-[11px] font-semibold text-gdpro-accent hover:bg-gdpro-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.4} />
              {copy.openReviewDecision}
            </button>
          )}
          <div className="space-y-1.5 mt-3">
            {node.operations.length ? node.operations.slice(0, 5).map((op) => (
              <div key={`${op.itemId}-${operationKey(op)}`} className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-gdpro-text truncate">{workflowTerm(copy, op.label)}</span>
                  <span className={`px-1.5 py-[2px] rounded-md text-[9px] border ${op.autoRunnable ? 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20' : 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20'}`}>
                    {op.autoRunnable ? copy.canHandleDirect : copy.needsConfirmation}
                  </span>
                </div>
                <p className="text-[9px] text-gdpro-text-muted mt-1 line-clamp-2">{workflowSentence(copy, op.detail)}</p>
              </div>
            )) : (
              <div className="rounded-md border border-gdpro-success/20 bg-gdpro-success/10 px-2 py-1.5 text-[10px] text-gdpro-success">
                {copy.noActions}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRunOperations(directOps, copy.runNodeDone(nodeCopy.title), nodeCopy.title)}
            disabled={!directOps.length}
            className="mt-3 w-full gdpro-button flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5" strokeWidth={2.4} />
            {copy.runStep}
          </button>
        </section>

        <section className="py-4">
          <div className="text-[11px] font-semibold text-gdpro-text-muted">{copy.issuesTitle}</div>
          <div className="space-y-1.5 mt-3">
            {node.issues.length ? node.issues.slice(0, 6).map((issue, index) => (
              <div key={issue.id || `${node.id}-issue-${index}`} className="rounded-md border border-gdpro-danger/20 bg-gdpro-danger/10 px-2 py-1.5">
                <div className="text-[10px] font-semibold text-gdpro-danger truncate">{workflowTerm(copy, issue.displayTitle)}</div>
                <p className="text-[9px] leading-relaxed text-gdpro-danger/85 mt-0.5 line-clamp-2">{workflowSentence(copy, issue.displayDetail)}</p>
              </div>
            )) : (
              <div className="rounded-md border border-gdpro-success/20 bg-gdpro-success/10 px-2 py-1.5 text-[10px] text-gdpro-success">
                {copy.noIssues}
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

function MobileSelectedBar({ node, onRunOperations, copy }) {
  if (!node) return null;
  const directOps = scopedOperations(node, node.operations.filter((op) => op.autoRunnable));
  const nodeCopy = workflowNodeCopy(copy, node);
  const statusLabel = workflowStatus(copy, node.statusLabel);
  const fallbackSummary = copy.locale === 'en'
    ? node.preview?.nextStep?.label || nodeCopy.outputLabel || copy.directActions(directOps.length)
    : node.control?.summaryLabel || node.preview?.nextStep?.label || `${directOps.length} 项可直接处理`;
  return (
    <div className="xl:hidden fixed left-3 bottom-3 z-30 w-[calc(100vw-24px)] max-w-[360px] rounded-lg gdpro-floating-hud px-3 py-2">
      <div className="relative min-h-[38px] pr-20">
        <div className="min-w-0 pt-0.5">
          <div className="text-[12px] font-semibold text-gdpro-text truncate">{nodeCopy.title}</div>
          <div className="text-[10px] text-gdpro-text-muted truncate">
            {node.lastActivity
              ? `${workflowActivityStatus(copy, node.lastActivity)}${copy.statusJoiner}${workflowActivityLabel(copy, node.lastActivity)}`
              : `${statusLabel} · ${workflowTerm(copy, fallbackSummary)}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRunOperations(directOps, copy.runNodeDone(nodeCopy.title), nodeCopy.title)}
          disabled={!directOps.length}
          className="gdpro-button absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center gap-1.5 text-[11px] py-1.5 px-2.5 min-w-[64px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="w-3 h-3" strokeWidth={2.4} />
          {copy.runStep}
        </button>
      </div>
    </div>
  );
}

export default function WorkflowCanvas({
  project,
  onProjectUpdate,
  onAskAssistant,
  llm,
  imageModel,
  imageModelConfig,
  agentEnv,
  connectionStatus,
  uiLanguage,
}) {
  const graph = useMemo(() => buildWorkflowGraph(project), [project]);
  const copy = uiText('workflow', uiLanguage);
  const [positions, setPositions] = useState(() => Object.fromEntries(graph.nodes.map((node) => [node.id, node.position])));
  const [selectedNodeId, setSelectedNodeId] = useState(graph.nodes[0]?.id || null);
  const [pan, setPan] = useState({ x: 24, y: 18 });
  const [zoom, setZoom] = useState(0.88);
  const [executionPreview, setExecutionPreview] = useState(null);
  const [executionReport, setExecutionReport] = useState(null);
  const [dismissedReportId, setDismissedReportId] = useState(null);
  const [partnerHandoffState, setPartnerHandoffState] = useState(null);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [reviewDecisionOpen, setReviewDecisionOpen] = useState(false);
  const dragRef = useRef(null);
  const previousProjectIdRef = useRef(project?.id);

  useEffect(() => {
    const projectChanged = previousProjectIdRef.current !== project?.id;
    previousProjectIdRef.current = project?.id;
    setPositions(Object.fromEntries(graph.nodes.map((node) => [node.id, node.position])));
    setSelectedNodeId((prev) => {
      if (!projectChanged && prev && graph.nodes.some((node) => node.id === prev)) return prev;
      return graph.nodes[0]?.id || null;
    });
  }, [project?.id, graph.nodes]);

  const positionedNodes = graph.nodes.map((node) => ({
    ...node,
    position: positions[node.id] || node.position,
  }));
  const nodeMap = new Map(positionedNodes.map((node) => [node.id, node]));
  const selectedNode = nodeMap.get(selectedNodeId) || positionedNodes[0] || null;
  const allDirectOps = dedupeRunnable(positionedNodes.flatMap((node) => (
    scopedOperations(node, node.operations.filter((op) => op.autoRunnable))
  )));
  const existingTemplateIds = useMemo(() => new Set(
    (graph.state.materialPlan?.materials || []).map((material) => material.templateId).filter(Boolean),
  ), [graph.state.materialPlan?.materials]);
  const materialNode = positionedNodes.find((node) => node.id === 'material-plan');
  const reviewNode = positionedNodes.find((node) => node.id === 'review-board');
  const manifestLocked = Boolean(graph.state.manifest?.locked);
  const storedExecutionReport = project?.control?.workflowRunReport;
  const activeExecutionReport = executionReport || (
    storedExecutionReport &&
    storedExecutionReport.id !== dismissedReportId &&
    Date.now() - (storedExecutionReport.createdAt || 0) < 30_000
      ? storedExecutionReport
      : null
  );
  const runtimeInfo = {
    llm,
    imageModel,
    imageModelConfig,
    agentEnv,
    connectionStatus,
  };

  const persistWorkflowCanvas = useCallback((nodes, edges = graph.edges) => {
    if (!project?.id || !onProjectUpdate) return;
    const canvas = {
      schemaVersion: WORKFLOW_CANVAS_SCHEMA_VERSION,
      nodes: nodes.map(serializeWorkflowNode),
      edges: edges.map(serializeWorkflowEdge),
      updatedAt: Date.now(),
    };
    onProjectUpdate(project.id, (prev) => ({
      ...prev,
      workflowCanvas: canvas,
      updatedAt: Date.now(),
    }));
  }, [graph.edges, onProjectUpdate, project?.id]);

  const persistWorkflowPositions = useCallback((nextPositions) => {
    const nextNodes = positionedNodes.map((node) => ({
      ...node,
      position: nextPositions[node.id] || node.position,
    }));
    persistWorkflowCanvas(nextNodes, graph.edges);
  }, [graph.edges, persistWorkflowCanvas, positionedNodes]);

  const addCustomNode = () => {
    if (!project?.id) return;
    const title = window.prompt(copy.customNodePromptTitle, copy.customNodeDefaultTitle);
    if (!title?.trim()) return;
    const previous = selectedNode || positionedNodes[positionedNodes.length - 1];
    const id = `custom-step-${Date.now()}`;
    const nextX = previous ? previous.position.x + 300 : 120;
    const shouldWrap = previous && nextX > WORLD.width - 360;
    const node = {
      id,
      title: title.trim(),
      subtitle: copy.customNodeDefaultSubtitle,
      phase: Math.min(6, Math.max(1, previous?.phase || 1)),
      artifact: 'custom-workflow-step',
      position: previous
        ? {
            x: shouldWrap ? 80 : nextX,
            y: shouldWrap ? Math.min(WORLD.height - 190, previous.position.y + 220) : previous.position.y,
          }
        : { x: 120, y: 120 },
      inputs: [copy.customNodeInput],
      outputs: [copy.customNodeOutput],
      outputLabel: copy.customNodeOutputLabel,
      templateId: null,
      custom: true,
      size: previous?.size || { width: 238, height: 150 },
    };
    const nextEdges = previous
      ? [...graph.edges, { id: `edge-${previous.id}-${id}`, from: previous.id, to: id }]
      : graph.edges;
    persistWorkflowCanvas([...positionedNodes, node], nextEdges);
    setPositions((prev) => ({ ...prev, [id]: node.position }));
    setSelectedNodeId(id);
  };

  const editSelectedNode = () => {
    if (!selectedNode) return;
    const title = window.prompt(copy.editNodePromptTitle, selectedNode.title || '');
    if (!title?.trim()) return;
    const subtitle = window.prompt(copy.editNodePromptSubtitle, selectedNode.subtitle || '') ?? selectedNode.subtitle;
    const nextNodes = positionedNodes.map((node) => (
      node.id === selectedNode.id
        ? { ...node, title: title.trim(), subtitle: String(subtitle || '').trim() || node.subtitle }
        : node
    ));
    persistWorkflowCanvas(nextNodes, graph.edges);
  };

  const deleteSelectedNode = () => {
    if (!selectedNode || positionedNodes.length <= 1) return;
    if (!window.confirm(copy.deleteNodeConfirm(workflowNodeCopy(copy, selectedNode).title))) return;
    const nextNodes = positionedNodes.filter((node) => node.id !== selectedNode.id);
    const nextEdges = graph.edges.filter((edge) => edge.from !== selectedNode.id && edge.to !== selectedNode.id);
    persistWorkflowCanvas(nextNodes, nextEdges);
    setSelectedNodeId(nextNodes[0]?.id || null);
  };

  const restoreDefaultCanvas = () => {
    if (!project?.id || !onProjectUpdate) return;
    if (!window.confirm(copy.restoreTemplateConfirm)) return;
    const canvas = createDefaultWorkflowCanvas();
    onProjectUpdate(project.id, (prev) => ({
      ...prev,
      workflowCanvas: canvas,
      updatedAt: Date.now(),
    }));
    setPositions(Object.fromEntries(canvas.nodes.map((node) => [node.id, node.position])));
    setSelectedNodeId(canvas.nodes[0]?.id || null);
  };

  useEffect(() => {
    setPartnerHandoffState(null);
  }, [activeExecutionReport?.id]);

  const runOperations = (items, label) => {
    const runnableItems = dedupeRunnable(items).filter((item) => item.operation);
    if (!project?.id || !onProjectUpdate || !runnableItems.length) return;
    const operations = runnableItems.map((item) => item.operation).filter(Boolean);
    const operationResult = applyAgentOperations(project, operations, { action: 'workflow_canvas' });
    const report = buildExecutionReport({ label, scopeLabel: executionPreview?.scopeLabel }, runnableItems, operationResult, copy);
    const next = operationResult.project;
    const nextGraph = buildWorkflowGraph(next);
    const runtimeHandoffPlan = buildRuntimeHandoffPlan(runtimeInfo, runnableItems);
    const auditRecord = buildWorkflowRunAudit({
      project: next,
      graph: nextGraph,
      plan: { label, scopeLabel: executionPreview?.scopeLabel },
      runtimeInfo: {
        ...runtimeInfo,
        handoffPlan: runtimeHandoffPlan,
      },
      runnableItems,
      operations,
      operationResult,
      report,
    });
    const partnerTask = buildPartnerHandoffTask({
      project: next,
      graph: nextGraph,
      runtimeInfo,
      handoffPlan: runtimeHandoffPlan,
      runnableItems,
      operations,
      report,
      auditRecord,
    });
    const auditFiles = workflowRunAuditFiles(auditRecord);
    const handoffFiles = partnerHandoffFiles(partnerTask);
    const syncFiles = {
      ...auditFiles,
      ...handoffFiles,
    };
    const auditFilePaths = Object.keys(auditFiles);
    const handoffFilePaths = Object.keys(handoffFiles);
    const previousHandoffQueue = Array.isArray(next.control?.workflowRunPartnerTaskQueue)
      ? next.control.workflowRunPartnerTaskQueue
      : [];
    const handoffQueue = [
      partnerTask,
      ...previousHandoffQueue.filter((item) => item?.id !== partnerTask.id),
    ].slice(0, 8);
    const reportWithAudit = {
      ...report,
      auditFilePath: auditRecord.primaryPath,
      auditSyncStatus: 'queued',
      handoffStatus: runtimeHandoffPlan.status,
      partnerTaskPath: partnerTask.primaryPath,
      partnerTaskStatus: partnerTask.queueStatus,
    };
    const runEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      source: 'workflow-canvas',
      type: 'workflow-run',
      label,
    };
    const nextProject = {
      ...next,
      control: {
        ...(next.control || {}),
        lastAction: 'workflow_canvas_run_operations',
        lastUpdatedAt: Date.now(),
        workflowRunReport: reportWithAudit,
        workflowRunAudit: auditRecord,
        workflowRunAuditFiles: auditFilePaths,
        workflowRunHandoffPlan: runtimeHandoffPlan,
        workflowRunPartnerTask: partnerTask,
        workflowRunPartnerTaskQueue: handoffQueue,
        workflowRunPartnerTaskFiles: handoffFilePaths,
        events: [
          runEvent,
          ...operationResult.events,
          ...((next.control || {}).events || []),
        ].slice(0, 40),
        risks: [
          ...operationResult.risks,
          ...((next.control || {}).risks || []),
        ].slice(0, 40),
        operationResults: [
          ...operationResult.results,
          ...((next.control || {}).operationResults || []),
        ].slice(0, 30),
      },
      updatedAt: Date.now(),
    };
    onProjectUpdate(project.id, nextProject);
    setDismissedReportId(null);
    setExecutionReport(reportWithAudit);
    openclaw.savePartnerHandoffTask(partnerTask).catch((err) => {
      console.warn('[Workflow Handoff] Failed to save local handoff task:', err);
    });
    syncWorkspaceFiles(syncFiles, { requeueOnFailure: true }).catch((err) => {
      console.warn('[Workflow Handoff] Failed to sync run records:', err);
    });
  };

  const requestPartnerHandoff = async (report) => {
    if (!report?.partnerTaskPath) return;
    setPartnerHandoffState({
      reportId: report.id,
      state: 'checking',
      message: copy.executionReport.partnerTaskChecking,
    });
    try {
      const result = await openclaw.claimPartnerHandoffTask({
        projectId: project?.id,
        path: report.partnerTaskPath,
      });
      setPartnerHandoffState({
        reportId: report.id,
        state: result?.exists ? 'ready' : 'saved',
        message: result?.exists
          ? copy.executionReport.partnerTaskReady
          : copy.executionReport.partnerTaskSaved,
      });
    } catch (err) {
      console.warn('[Workflow Handoff] Local partner handoff request failed:', err);
      setPartnerHandoffState({
        reportId: report.id,
        state: 'saved',
        message: copy.executionReport.partnerTaskSaved,
      });
    }
  };

  const requestRunOperations = (items, label, scopeLabel = copy.defaultScope) => {
    const runnableItems = dedupeRunnable(items).filter((item) => item.operation);
    if (!runnableItems.length) return;
    setExecutionPreview({
      id: `run_${Date.now()}`,
      items: runnableItems,
      label,
      scopeLabel,
    });
  };

  const confirmExecution = (selectedItems = null) => {
    if (!executionPreview) return;
    const plan = executionPreview;
    const itemsToRun = selectedItems || plan.items;
    setExecutionPreview(null);
    runOperations(itemsToRun, copy.runSelectionLabel(plan.label, itemsToRun.length));
  };

  const chooseMaterialTemplate = (template) => {
    if (!template || !manifestLocked) return;
    setMaterialPickerOpen(false);
    const templateName = materialTemplateName(copy, template);
    const materialNodeTitle = workflowNodeCopy(copy, materialNode || { id: 'material-plan' }).title || copy.nodes?.['material-plan']?.title || '交付物清单 Materials';
    requestRunOperations([
      {
        itemId: `material-template-${template.id}`,
        label: copy.addMaterialOperationLabel(templateName),
        detail: copy.addMaterialOperationDetail(templateDetail(template, copy)),
        autoRunnable: true,
        nodeId: 'material-plan',
        nodeTitle: materialNodeTitle,
        operation: {
          id: `gui_add_material_${template.id}_${Date.now()}`,
          type: 'add_material',
          params: { templateId: template.id },
          reason: copy.addMaterialReason(templateName),
        },
      },
    ], copy.addedMaterialRunLabel(templateName), materialNodeTitle);
  };

  const chooseReviewDecision = (item, decision) => {
    if (!item?.targetId || !decision) return;
    setReviewDecisionOpen(false);
    const decisionLabel = reviewDecisionLabel(decision, copy);
    const itemLabel = friendlyReviewLabel(item, copy);
    const reviewNodeTitle = workflowNodeCopy(copy, reviewNode || { id: 'review-board' }).title || copy.nodes?.['review-board']?.title || '签收看板 Review';
    requestRunOperations([
      {
        itemId: `review-${item.id}-${decision}`,
        label: copy.reviewOperationLabel(decisionLabel, itemLabel),
        detail: decision === 'approved'
          ? copy.reviewOperationApproveDetail
          : copy.reviewOperationChangesDetail,
        autoRunnable: true,
        nodeId: 'review-board',
        nodeTitle: reviewNodeTitle,
        operation: {
          id: `gui_review_${item.id}_${decision}_${Date.now()}`,
          type: 'record_review_decision',
          params: {
            targetId: item.targetId,
            decision,
            reviewer: 'gui',
            reviewerRole: 'design-director',
            note: decision === 'approved'
              ? copy.reviewNoteApproved(itemLabel)
              : copy.reviewNoteChanges(itemLabel),
          },
          reason: copy.reviewReason(itemLabel),
        },
      },
    ], copy.reviewRunLabel(decisionLabel, itemLabel), reviewNodeTitle);
  };

  useEffect(() => {
    const handleMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.type === 'pan') {
        setPan({
          x: drag.startPan.x + event.clientX - drag.start.x,
          y: drag.startPan.y + event.clientY - drag.start.y,
        });
      }
      if (drag.type === 'node') {
        setPositions((prev) => ({
          ...prev,
          [drag.nodeId]: {
            x: Math.max(12, drag.startNode.x + (event.clientX - drag.start.x) / zoom),
            y: Math.max(12, drag.startNode.y + (event.clientY - drag.start.y) / zoom),
          },
        }));
      }
    };
    const handleUp = (event) => {
      const drag = dragRef.current;
      if (drag?.type === 'node') {
        const nextPosition = {
          x: Math.max(12, drag.startNode.x + (event.clientX - drag.start.x) / zoom),
          y: Math.max(12, drag.startNode.y + (event.clientY - drag.start.y) / zoom),
        };
        setPositions((prev) => {
          const next = { ...prev, [drag.nodeId]: nextPosition };
          persistWorkflowPositions(next);
          return next;
        });
      }
      dragRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [persistWorkflowPositions, zoom]);

  const resetView = () => {
    setPan({ x: 24, y: 18 });
    setZoom(0.88);
    setPositions(Object.fromEntries(graph.nodes.map((node) => [node.id, node.position])));
  };

  return (
    <div className="h-full flex min-w-0 bg-gdpro-bg">
      <section className="min-w-0 flex-1 flex flex-col">
        <div className="min-h-[56px] shrink-0 px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b gdpro-chrome-panel">
          <div className="flex items-center gap-2 min-w-0">
            <Workflow className="w-4 h-4 text-gdpro-accent shrink-0" strokeWidth={2.2} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-gdpro-text leading-tight truncate">{copy.title} / {copy.titleSub}</div>
              <div className="text-[10px] text-gdpro-text-muted truncate">
                {project?.name || copy.noProject} · {workflowStatsSummary(copy, graph)}{graph.stats.recentActivity ? ` · ${graph.stats.recentActivity} ${copy.activitySuffix}` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => requestRunOperations(allDirectOps, copy.runAllDone, copy.runAllScope)}
              disabled={!allDirectOps.length}
              className="gdpro-button flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed text-[12px] px-3"
            >
              <Play className="w-3.5 h-3.5" strokeWidth={2.4} />
              {copy.runSafeItems}
            </button>
            <button
              type="button"
              onClick={addCustomNode}
              disabled={!project}
              className="px-2 py-[6px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-gdpro-text-muted hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent disabled:opacity-40"
              title={copy.addCustomNode}
              aria-label={copy.addCustomNode}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={editSelectedNode}
              disabled={!selectedNode}
              className="hidden sm:inline-flex px-2.5 py-[6px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-[11px] text-gdpro-text-muted hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent disabled:opacity-40"
            >
              {copy.editNode}
            </button>
            <button
              type="button"
              onClick={deleteSelectedNode}
              disabled={!selectedNode || positionedNodes.length <= 1}
              className="px-2 py-[6px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-gdpro-text-muted hover:text-gdpro-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent disabled:opacity-40"
              title={copy.deleteNode}
              aria-label={copy.deleteNode}
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))}
              className="px-2 py-[6px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-gdpro-text-muted hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
              title={copy.zoomOut}
              aria-label={copy.zoomOut}
            >
              <ZoomOut className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
            <span className="w-12 text-center text-[11px] text-gdpro-text-muted">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(1.35, value + 0.1))}
              className="px-2 py-[6px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-gdpro-text-muted hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
              title={copy.zoomIn}
              aria-label={copy.zoomIn}
            >
              <ZoomIn className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="px-2 py-[6px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-gdpro-text-muted hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
              title={copy.resetView}
              aria-label={copy.resetView}
            >
              <Maximize2 className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={restoreDefaultCanvas}
              disabled={!project}
              className="hidden sm:inline-flex px-2.5 py-[6px] rounded-md border border-gdpro-border bg-gdpro-bg-elevated text-[11px] text-gdpro-text-muted hover:text-gdpro-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent disabled:opacity-40"
            >
              {copy.restoreTemplate}
            </button>
          </div>
        </div>
        <WorkflowStatusStrip graph={graph} copy={copy} />

        <div
          className="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing gdpro-canvas-surface"
          style={{
            backgroundSize: `100% 100%, 100% 4px, ${24 * zoom}px ${24 * zoom}px, ${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `0 0, 0 0, ${pan.x}px ${pan.y}px, ${pan.x}px ${pan.y}px`,
          }}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            dragRef.current = {
              type: 'pan',
              start: { x: event.clientX, y: event.clientY },
              startPan: pan,
            };
          }}
          onWheel={(event) => {
            event.preventDefault();
            setZoom((value) => Math.max(0.55, Math.min(1.35, value + (event.deltaY > 0 ? -0.06 : 0.06))));
          }}
        >
          <div
            className="absolute origin-top-left"
            style={{
              width: WORLD.width,
              height: WORLD.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <svg className="absolute inset-0 pointer-events-none" width={WORLD.width} height={WORLD.height}>
              <defs>
                <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {graph.edges.map((edge) => {
                const from = nodeMap.get(edge.from);
                const to = nodeMap.get(edge.to);
                if (!from || !to) return null;
                const selected = selectedNodeId === edge.from || selectedNodeId === edge.to;
                return (
                  <path
                    key={edge.id}
                    d={edgePath(from, to)}
                    fill="none"
                    stroke={toneClass(edge.tone).edge}
                    strokeWidth={selected ? 2.4 : 1.4}
                    filter={selected ? 'url(#edge-glow)' : undefined}
                  />
                );
              })}
            </svg>

            {positionedNodes.map((node) => (
              <WorkflowNode
                key={node.id}
                node={node}
                selected={selectedNodeId === node.id}
                onSelect={setSelectedNodeId}
                onDragStart={(event, draggedNode) => {
                  event.stopPropagation();
                  setSelectedNodeId(draggedNode.id);
                  dragRef.current = {
                    type: 'node',
                    nodeId: draggedNode.id,
                    start: { x: event.clientX, y: event.clientY },
                    startNode: draggedNode.position,
                  };
                }}
                copy={copy}
              />
            ))}
          </div>

          <div className="absolute left-4 bottom-4 hidden md:flex rounded-lg gdpro-floating-hud px-3 py-2">
            <div className="flex items-center gap-2 text-[10px] text-gdpro-text-muted">
              <MousePointer2 className="w-3.5 h-3.5" strokeWidth={2} />
              {copy.helper}
            </div>
          </div>

          <div className="absolute right-4 bottom-4 hidden lg:block rounded-lg gdpro-floating-hud p-2">
            <div className="flex items-center gap-1.5 text-[10px] text-gdpro-text-muted mb-1.5">
              <Layers3 className="w-3 h-3" strokeWidth={2} />
              {copy.miniMap}
            </div>
            <div className="relative w-40 h-24 rounded-md gdpro-surface-tile overflow-hidden">
              {positionedNodes.map((node) => (
                <button
                  type="button"
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`absolute rounded-[2px] ${selectedNodeId === node.id ? 'bg-gdpro-accent' : toneClass(node.tone).rail}`}
                  style={{
                    left: `${(node.position.x / WORLD.width) * 160}px`,
                    top: `${(node.position.y / WORLD.height) * 96}px`,
                    width: `${Math.max(12, (node.size.width / WORLD.width) * 160)}px`,
                    height: `${Math.max(8, (node.size.height / WORLD.height) * 96)}px`,
                  }}
                  title={workflowNodeCopy(copy, node).title}
                  aria-label={copy.inspectNode(workflowNodeCopy(copy, node).title)}
                />
              ))}
            </div>
          </div>

          <MobileSelectedBar node={selectedNode} onRunOperations={requestRunOperations} copy={copy} />
        </div>
      </section>

      <Inspector
        node={selectedNode}
        graph={{ ...graph, nodes: positionedNodes }}
        onRunOperations={requestRunOperations}
        onOpenMaterialPicker={() => setMaterialPickerOpen(true)}
        onOpenReviewDecision={() => setReviewDecisionOpen(true)}
        onAskAssistant={onAskAssistant}
        copy={copy}
      />
      <ExecutionPreviewModal
        plan={executionPreview}
        onCancel={() => setExecutionPreview(null)}
        onConfirm={confirmExecution}
        copy={copy}
        runtimeInfo={runtimeInfo}
      />
      <ExecutionReportModal
        report={activeExecutionReport}
        onClose={() => {
          setDismissedReportId(activeExecutionReport?.id || null);
          setExecutionReport(null);
        }}
        onFocusNode={(nodeId) => {
          setSelectedNodeId(nodeId);
          setDismissedReportId(activeExecutionReport?.id || null);
          setExecutionReport(null);
        }}
        onRequestPartnerHandoff={requestPartnerHandoff}
        handoffState={partnerHandoffState?.reportId === activeExecutionReport?.id ? partnerHandoffState : null}
        copy={copy}
      />
      <MaterialPickerModal
        open={materialPickerOpen}
        manifestLocked={manifestLocked}
        existingTemplateIds={existingTemplateIds}
        recommendedTargets={graph.state.designBriefContract?.targets || []}
        onCancel={() => setMaterialPickerOpen(false)}
        onChoose={chooseMaterialTemplate}
        copy={copy}
      />
      <ReviewDecisionModal
        open={reviewDecisionOpen}
        reviewBoard={graph.state.reviewBoard}
        onCancel={() => setReviewDecisionOpen(false)}
        onChoose={chooseReviewDecision}
        copy={copy}
      />
    </div>
  );
}
