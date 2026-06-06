// Phase gate rules for the studio workflow.
// Enforces the 6-Phase workflow: users cannot skip phases or perform out-of-phase operations.

export const PHASE_NAMES = ['需求追问', '竞品分析', '样稿方向', '物料扩展', '合规审查', '落地交付'];

export const PHASE_CONFIG = {
  1: {
    name: '需求追问',
    description: '明确设计需求、品牌信息、目标受众',
    allowedAssetCategories: ['reference'],
    canGenerateImage: false,
    canAdoptAsset: false,
    canProceed: true,
    gateLabel: '确认需求后进入竞品分析',
    quickActions: ['帮我梳理品牌需求', '分析目标受众画像', '推荐设计风格方向'],
  },
  2: {
    name: '竞品分析',
    description: '竞品视觉分析 + 设计哲学创建',
    allowedAssetCategories: ['reference', 'draft'],
    canGenerateImage: false,
    canAdoptAsset: false,
    canProceed: true,
    gateLabel: '确认设计哲学后进入样稿方向',
    quickActions: ['分析竞品视觉策略', '创建设计哲学', '整理 Moodboard'],
  },
  3: {
    name: '样稿方向',
    description: 'Logo + 样稿 + 辅助图形创建',
    allowedAssetCategories: ['logo', 'draft', 'reference'],
    canGenerateImage: true,
    canAdoptAsset: true,
    canProceed: true,
    gateLabel: '确认样稿后进入物料扩展',
    quickActions: ['起草 Logo 方向', '创建品牌样稿', '审阅当前样稿'],
  },
  4: {
    name: '物料扩展',
    description: '全套 VI 物料扩展',
    allowedAssetCategories: ['logo', 'product', 'scene', 'draft', 'deliverable'],
    canGenerateImage: true,
    canAdoptAsset: true,
    canProceed: true,
    gateLabel: '确认物料清单后进入合规审查',
    quickActions: ['扩展 VI 物料', '设计名片/海报', '品牌应用展示'],
  },
  5: {
    name: '合规审查',
    description: '合规审查 + 审美自检',
    allowedAssetCategories: ['report', 'deliverable'],
    canGenerateImage: false,
    canAdoptAsset: true,
    canProceed: true,
    gateLabel: '审查通过后进入落地交付',
    quickActions: ['开始合规审查', '审美自检清单', '检查字体版权'],
  },
  6: {
    name: '落地交付',
    description: '印刷前检查 + 数字检查 + VI 规范手册',
    allowedAssetCategories: ['deliverable', 'report'],
    canGenerateImage: false,
    canAdoptAsset: true,
    canProceed: false,
    gateLabel: '项目已完成',
    quickActions: ['制作 VI 规范手册', '导出印刷文件', '项目归档'],
  },
};

/**
 * Check if an asset category is allowed in the given phase.
 */
export function canUploadAssetCategory(phase, category) {
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG[1];
  return cfg.allowedAssetCategories.includes(category);
}

/**
 * Check if image generation is allowed in the given phase.
 */
export function canGenerateImage(phase) {
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG[1];
  return cfg.canGenerateImage;
}

/**
 * Check if asset adoption is allowed in the given phase.
 */
export function canAdoptAsset(phase) {
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG[1];
  return cfg.canAdoptAsset;
}

/**
 * Check if user can proceed to next phase.
 */
export function canProceedToNext(phase) {
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG[1];
  return cfg.canProceed && phase < 6;
}

/**
 * Get phase description for UI display.
 */
export function getPhaseDescription(phase) {
  return PHASE_CONFIG[phase]?.description || '';
}

/**
 * Get quick action suggestions for the current phase.
 */
export function getQuickActions(phase) {
  return PHASE_CONFIG[phase]?.quickActions || [];
}

/**
 * Get the gate label (confirmation text before proceeding).
 */
export function getGateLabel(phase) {
  return PHASE_CONFIG[phase]?.gateLabel || '';
}

/**
 * Build a phase restriction notice for system prompt injection.
 */
export function buildPhaseGuardPrompt(phase) {
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG[1];
  const lines = [
    `## 🚦 Phase 阶段守卫（当前：第 ${phase} 阶段 · ${cfg.name}）`,
    ``,
    `**本阶段允许的操作**：`,
    `- 可上传资产类别：${cfg.allowedAssetCategories.join('、')}`,
    `- ${cfg.canGenerateImage ? '✅' : '❌'} 概念图创建`,
    `- ${cfg.canAdoptAsset ? '✅' : '❌'} 采纳资产`,
    ``,
    `**阶段说明**：${cfg.description}`,
  ];
  if (phase < 6) {
    const nextCfg = PHASE_CONFIG[phase + 1];
    lines.push(`**下一阶段**：第 ${phase + 1} 阶段 · ${nextCfg.name} — ${nextCfg.description}`);
    lines.push(`**推进条件**：用户明确确认当前阶段产出后，方可进入下一阶段（R8）`);
  }
  return lines.join('\n');
}
