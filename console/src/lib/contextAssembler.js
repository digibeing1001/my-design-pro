import { loadFromLocal } from './storage';
import { buildPhaseGuardPrompt } from './phaseGuard';
import { buildDesignControlPrompt, buildDesignControlState } from './designControl';

/**
 * Mapping from Console dimension keys to Skill aesthetic archive dimension names.
 * Console 的 7 维度表单 ↔ Skill brand-profile.md 审美档案的 6 个偏好分类
 */
const DIMENSION_MAP = {
  color:       { skillDim: '色彩偏好',   desc: '明度/饱和度/色相倾向、冷暖偏好、特定颜色偏好/禁止' },
  typography:  { skillDim: '字体偏好',   desc: '衬线/无衬线、字重、中文/英文匹配' },
  composition: { skillDim: '构图偏好',   desc: '对称/不对称、中心/偏移、层次数量' },
  spacing:     { skillDim: '排版偏好',   desc: '留白量、对齐方式、信息密度' },
  texture:     { skillDim: '风格偏好',   desc: '质感方向：扁平/拟物/毛玻璃/噪点/手作感' },
  detail:      { skillDim: '风格偏好',   desc: '细节程度：极简/丰富/装饰性/克制' },
  mood:        { skillDim: '氛围偏好',   desc: '高级/亲民、活力/沉静、温暖/冷静' },
};

function getNextAPNumber(preferences = []) {
  const nums = preferences
    .map((p) => p.id?.match(/AP-(\d+)/)?.[1])
    .filter(Boolean)
    .map(Number);
  const max = nums.length ? Math.max(...nums) : 0;
  return `AP-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Convert Console designer-profile dimensions into Skill-style AP-numbered preferences.
 */
function buildAPPreferences(profile) {
  const prefs = [];
  const dims = profile.aesthetic?.dimensions || {};

  Object.entries(dims).forEach(([key, dim]) => {
    if (!dim?.value?.trim()) return;
    const mapping = DIMENSION_MAP[key];
    if (!mapping) return;
    prefs.push({
      id: getNextAPNumber(prefs),
      dimension: mapping.skillDim,
      preference: dim.value.trim(),
      parameter: mapping.desc,
      source: 'Console-设计师档案',
    });
  });

  return prefs;
}

function buildAPProhibitions(profile) {
  const prohibs = profile.aesthetic?.prohibitions || [];
  let counter = 1;
  return prohibs
    .filter((p) => p?.trim())
    .map((p) => ({
      id: `AP-P${String(counter++).padStart(3, '0')}`,
      item: p.trim(),
      reason: '设计师明确禁止',
      source: 'Console-设计师档案',
    }));
}

/**
 * Build a system prompt from designer profile + knowledge base + project assets.
 * Output format is aligned with Skill's brand-profile.md aesthetic archive structure.
 */
function buildBrandProfileSection(project) {
  // Try to read brand-profile from project's documents or localStorage
  const projectId = project?.id;
  if (!projectId) return '';

  // 1. Check project.documents.brief (adopted during Phase 1)
  const brief = project?.documents?.brief;
  if (brief?.content) {
    const lines = ['## 📋 品牌档案（brand-profile.md · 锁定项）'];
    lines.push('> 以下内容为 Skill 创建的品牌档案，所有产出必须逐字引用，不得擅自修改。');
    lines.push('');
    // Include first 800 chars as context
    const snippet = brief.content.slice(0, 800).replace(/\n/g, ' ');
    lines.push(snippet);
    if (brief.content.length > 800) lines.push('...（内容已截断）');
    return lines.join('\n');
  }

  // 2. Check localStorage for parsed brand profile
  const stored = loadFromLocal(`brand_profile_${projectId}`, null);
  if (stored?.content) {
    const lines = ['## 📋 品牌档案（brand-profile.md · 锁定项）'];
    const snippet = stored.content.slice(0, 800).replace(/\n/g, ' ');
    lines.push(snippet);
    return lines.join('\n');
  }

  return '';
}

function localizedRouteText(value, language = 'zh') {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[language] || value.zh || value.en || '';
}

function buildImageModelRouteSection(imageModelConfig) {
  if (!imageModelConfig) return '';
  const capabilities = imageModelConfig.capabilities || {};
  const route = imageModelConfig.deliveryRoute || {};
  const outputs = (capabilities.outputs || [])
    .map((item) => localizedRouteText(item, 'zh'))
    .filter(Boolean)
    .join('、') || '未声明';
  const strengths = (capabilities.strengths || [])
    .map((item) => localizedRouteText(item, 'zh'))
    .filter(Boolean)
    .join('、') || '未声明';
  const handoffRule = localizedRouteText(route.finalAssetRule || capabilities.handoffRule, 'zh');
  const deliveryMode = route.finalDeliveryAllowed ? '可进入源稿候选' : '只可作为概念或预览';
  const lines = ['## 图像服务生产边界'];
  lines.push(`- 当前图像服务：${imageModelConfig.displayName || imageModelConfig.id || '未选择'} / ${imageModelConfig.provider || '未知服务商'}`);
  lines.push(`- 主要用途：${strengths}`);
  lines.push(`- 输出格式：${outputs}`);
  lines.push(`- 交付路由：${deliveryMode}`);
  if (handoffRule) lines.push(`- 交付规则：${handoffRule}`);
  if (!route.finalDeliveryAllowed) {
    lines.push('- 严格要求：不得把一次性位图结果当作最终 Logo、VI 手册、印刷稿或可编辑源文件交付。采纳后必须重建为 SVG/AI/PSD/版式源稿，并通过品牌套件、源稿质量和交付包检查。');
  } else {
    lines.push('- 严格要求：即使服务可输出矢量，也只能先作为源稿候选。交付前仍要检查路径、色值、字体、版权和品牌套件一致性。');
  }
  return lines.join('\n');
}

export function buildSystemPrompt({ profile, references, assets, project, assetMentions, imageModelConfig } = {}) {
  const p = profile || loadFromLocal('designer_profile', {});
  const apPrefs = buildAPPreferences(p);
  const apProhibs = buildAPProhibitions(p);
  const hasProfile = p.name || p.bio || apPrefs.length > 0 || apProhibs.length > 0;

  const parts = [];

  // ── 1. Designer Profile (global aesthetic DNA) ──
  if (hasProfile) {
    const lines = ['## 🎨 设计师档案（全局审美 DNA · 与 Skill 审美档案对齐）'];
    if (p.name) lines.push(`**设计师**：${p.name}`);
    if (p.bio) lines.push(`**简介**：${p.bio}`);

    const tags = p.aesthetic?.styleTags || [];
    if (tags.length) lines.push(`**风格标签**：${tags.join('、')}`);

    const tools = p.aesthetic?.tools || [];
    if (tools.length) lines.push(`**常用工具**：${tools.join('、')}`);

    if (apPrefs.length) {
      lines.push('');
      lines.push('### 审美偏好（AP 编号）');
      lines.push('| AP编号 | 维度 | 偏好 | 参数 | 来源 |');
      lines.push('|--------|------|------|------|------|');
      apPrefs.forEach((pref) => {
        lines.push(`| ${pref.id} | ${pref.dimension} | ${pref.preference} | ${pref.parameter} | ${pref.source} |`);
      });
    }

    if (apProhibs.length) {
      lines.push('');
      lines.push('### 禁止偏好');
      lines.push('| AP编号 | 禁止项 | 原因 | 来源 |');
      lines.push('|--------|--------|------|------|');
      apProhibs.forEach((prohib) => {
        lines.push(`| ${prohib.id} | ${prohib.item} | ${prohib.reason} | ${prohib.source} |`);
      });
    }

    parts.push(lines.join('\n'));
  }

  // ── 2. Knowledge Base (references) ──
  const refs = references || [];
  const parsedRefs = refs.filter((r) => r.parsed?.status === 'parsed' && r.parsed?.text);
  if (parsedRefs.length) {
    const lines = ['## 📚 知识库参考资料'];
    parsedRefs.slice(0, 8).forEach((r) => {
      const snippet = r.parsed.text.slice(0, 400).replace(/\s+/g, ' ');
      lines.push(`[${r.category || '参考'}] ${r.name}：${snippet}`);
    });
    parts.push(lines.join('\n'));
  }

  // ── 2.5 Asset Mentions (user explicitly referenced in current message) ──
  const mentions = assetMentions || [];
  if (mentions.length) {
    const lines = ['## 🔗 用户引用的资产（当前消息）'];
    mentions.forEach((a) => {
      lines.push(`- **[${a.category || '资产'}] ${a.name}**${a.description ? ` — ${a.description}` : ''}${a.status === 'adopted' ? ' （已采纳）' : ''}`);
    });
    lines.push('> 请基于以上引用资产进行设计回应。');
    parts.push(lines.join('\n'));
  }

  // ── 3. Project Assets (adopted history) ──
  const assetMap = assets || {};
  const allAssets = Object.values(assetMap).flat();
  const adopted = allAssets.filter((a) => a.status === 'adopted');
  if (adopted.length) {
    const lines = ['## 📦 本项目已采纳资产'];
    adopted.slice(0, 10).forEach((a) => {
      lines.push(`- [${a.category || '资产'}] ${a.name}${a.description ? `：${a.description}` : ''}`);
    });
    parts.push(lines.join('\n'));
  }

  // ── 3.5 Brand Profile (R6 locked items) ──
  const brandProfileSection = buildBrandProfileSection(project);
  if (brandProfileSection) {
    parts.push(brandProfileSection);
  }

  // ── 3.6 Phase Guard Context ──
  if (project) {
    parts.push(buildPhaseGuardPrompt(project.currentPhase || 1));
    const controlState = buildDesignControlState(project);
    parts.push(buildDesignControlPrompt(project, controlState));
  }

  const imageModelRouteSection = buildImageModelRouteSection(imageModelConfig);
  if (imageModelRouteSection) {
    parts.push(imageModelRouteSection);
  }

  // ── 4. Project Phase Context ──
  if (project) {
    const phaseNames = ['需求追问', '竞品分析', '样稿方向', '物料扩展', '合规审查', '落地交付'];
    const phase = project.currentPhase || 1;
    parts.push(`## 📍 项目状态\n- 项目名称：${project.name}\n- 当前阶段：${phaseNames[phase - 1] || '未知'}（第 ${phase} 阶段）`);
  }

  // ── 5. Instruction footer ──
  parts.push(
    '## ⚡ 执行指令\n' +
    '1. Design Control Protocol 与 Phase 阶段守卫是当前工作流控制层；如与普通创意建议冲突，优先遵守控制层。\n' +
    '2. 以上「🎨 设计师档案」是你的审美执行参照，所有输出必须符合档案中的审美偏好和禁止项。\n' +
    '3. 审美偏好按 AP 编号追溯，新增偏好不得与已有 AP 冲突。\n' +
    '4. 主动引用知识库中与用户需求相关的参考资料。\n' +
    '5. 保持与已采纳资产的风格一致性；缺少锁定项时先补齐，不要用想象替代。\n' +
    '6. 每次回复末尾提供可操作的按钮：采纳(✓)、拒绝(✕)、修改(✎)。'
  );

  return parts.join('\n\n---\n\n');
}

/**
 * Build a human-readable summary of what context was loaded.
 */
export function buildContextSummary({ profile, references, assets, project, assetMentions, imageModelConfig } = {}) {
  const p = profile || loadFromLocal('designer_profile', {});
  const apPrefs = buildAPPreferences(p);
  const apProhibs = buildAPProhibitions(p);
  const hasProfile = p.name || p.bio || apPrefs.length > 0 || apProhibs.length > 0;

  const refs = references || [];
  const parsedCount = refs.filter((r) => r.parsed?.status === 'parsed').length;

  const assetMap = assets || {};
  const adoptedCount = Object.values(assetMap)
    .flat()
    .filter((a) => a.status === 'adopted').length;

  const lines = [];
  if (hasProfile) {
    const tags = (p.aesthetic?.styleTags || []).slice(0, 3);
    const tagStr = tags.length ? `（${tags.join('、')}）` : '';
    lines.push(`• 设计师档案${tagStr} — ${apPrefs.length} 条审美偏好 · ${apProhibs.length} 条禁止项`);
  } else {
    lines.push('• 设计师档案 — 尚未配置，建议前往「设计师档案」完善风格偏好');
  }

  lines.push(`• 知识库 — ${parsedCount} 份已解析参考资料可用`);
  lines.push(`• 项目资产 — ${adoptedCount} 个已采纳设计资产`);
  if (imageModelConfig) {
    const route = imageModelConfig.deliveryRoute || {};
    const mode = route.finalDeliveryAllowed ? '源稿候选' : '概念预览';
    lines.push(`• 图像服务 — ${imageModelConfig.displayName || imageModelConfig.id || '未选择'} · ${mode}`);
  }

  const mentions = assetMentions || [];
  if (mentions.length) {
    lines.push(`• 当前引用 — ${mentions.length} 个资产（${mentions.map((a) => a.name).join('、')}）`);
  }

  if (project) {
    const phaseNames = ['需求追问', '竞品分析', '样稿方向', '物料扩展', '合规审查', '落地交付'];
    lines.push(`• 当前阶段 — ${project.name} / ${phaseNames[project.currentPhase - 1] || '未知'}`);
    const controlState = buildDesignControlState(project);
    lines.push(`• 控制面 — 生产就绪度 ${controlState.readiness}% · ${controlState.outputPath.label} · ${controlState.riskLevel}`);
    if (controlState.manifest) {
      lines.push(`• 品牌资产清单 — ${controlState.manifest.status} · ${controlState.manifest.readyItemCount}/${controlState.manifest.requiredItemCount} 必需项 · ${controlState.manifest.items.length} 可引用项`);
    }
    if (controlState.materialPlan) {
      lines.push(`• 物料生产 — ${controlState.materialPlan.status} · ${controlState.materialPlan.stats.total} 个物料 · ${controlState.materialPlan.stats.sourceArtworks || 0} 个源稿 · ${controlState.materialPlan.stats.sourceQaPassed || 0} 个源稿检查通过 · ${controlState.materialPlan.readiness}%`);
    }
    if (controlState.preflightReview) {
      lines.push(`• 交付前检查 — ${controlState.preflightReview.status} · ${controlState.preflightReview.readiness}% · ${controlState.preflightReview.issues.length} 个问题`);
    }
    if (controlState.deliveryPackage) {
      lines.push(`• 交付包 — ${controlState.deliveryPackage.status} · ${controlState.deliveryPackage.readiness}% · ${controlState.deliveryPackage.stats.readyEntries}/${controlState.deliveryPackage.stats.entries} 项就绪`);
    }
    if (controlState.repairQueue) {
      lines.push(`• 修复队列 — ${controlState.repairQueue.status} · ${controlState.repairQueue.stats.open} 个待处理 · ${controlState.repairQueue.stats.safe} 个安全操作`);
    }
    if (controlState.designBriefContract) {
      lines.push(`• 需求约定书 — ${controlState.designBriefContract.status} · ${controlState.designBriefContract.readiness}% · ${controlState.designBriefContract.targets.length} 个目标物料`);
    }
    if (controlState.brandConsistencyKit) {
      lines.push(`• 品牌套件一致性 — ${controlState.brandConsistencyKit.statusLabel} · ${controlState.brandConsistencyKit.readiness}% · 矢量源稿 ${controlState.brandConsistencyKit.stats.sourceSvgReady}/${controlState.brandConsistencyKit.stats.materials}`);
    }
    if (controlState.designScorecard) {
      lines.push(`• 设计总监评分 — ${controlState.designScorecard.status} · ${controlState.designScorecard.score}/${controlState.designScorecard.threshold} · ${controlState.designScorecard.grade}`);
    }
    if (controlState.productionImpact) {
      lines.push(`• 生产影响范围 — ${controlState.productionImpact.status} · ${controlState.productionImpact.stats.total} 个影响 · ${controlState.productionImpact.stats.safe} 个安全操作`);
    }
    if (controlState.reviewBoard) {
      lines.push(`• 签收看板 — ${controlState.reviewBoard.status} · ${controlState.reviewBoard.stats.approved}/${controlState.reviewBoard.stats.total} 已签核 · ${controlState.reviewBoard.stats.blocked} 阻断`);
    }
    if (controlState.operationResults?.length) {
      const latest = controlState.operationResults[0];
      lines.push(`• 最近工作台操作 — ${latest.label || latest.operationType} / ${latest.status}`);
    }
  }

  return lines.join('\n');
}

/**
 * Export designer profile in Skill-aligned format (for .gdpro/designer-profile.json).
 */
export function buildSkillAlignedProfile(profile) {
  const p = profile || loadFromLocal('designer_profile', {});
  return {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    name: p.name || '',
    bio: p.bio || '',
    aesthetic: {
      // AP-numbered preferences aligned with Skill's brand-profile.md structure
      preferences: buildAPPreferences(p),
      prohibitions: buildAPProhibitions(p),
      styleTags: p.aesthetic?.styleTags || [],
      tools: p.aesthetic?.tools || [],
      // Raw dimensions preserved for Console UI compatibility
      dimensions: p.aesthetic?.dimensions || {},
    },
  };
}
