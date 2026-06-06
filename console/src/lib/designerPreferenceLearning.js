import { loadFromLocal, saveToLocal, saveToLocalAndSync } from './storage';

export const PROFILE_CANDIDATE_STORAGE_KEY = 'designer_profile_candidates';

const DIMENSION_HINTS = [
  { key: 'composition', label: '构图', patterns: ['构图', '布局', '版式', '网格', '对称', '留白'] },
  { key: 'color', label: '色彩', patterns: ['颜色', '色彩', '配色', '饱和', '冷暖', '主色'] },
  { key: 'typography', label: '字体', patterns: ['字体', '字号', '字重', '标题', '正文', '排版'] },
  { key: 'texture', label: '质感', patterns: ['质感', '材质', '纹理', '毛玻璃', '噪点', '扁平'] },
  { key: 'spacing', label: '留白', patterns: ['间距', '留白', '呼吸感', '密度', '紧凑'] },
  { key: 'detail', label: '细节', patterns: ['细节', '装饰', '克制', '复杂', '精致'] },
  { key: 'mood', label: '情绪', patterns: ['情绪', '感觉', '调性', '氛围', '高级', '温暖', '科技'] },
];

function now() {
  return Date.now();
}

function candidateId() {
  return `pref_${now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function clean(value, max = 140) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function uniqueByValue(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.field || ''}:${clean(item.value).toLowerCase()}`;
    if (!item.value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCandidate(item = {}) {
  const type = item.type || (item.field ? 'dimension' : 'preference');
  return {
    id: item.id || candidateId(),
    type,
    field: item.field || '',
    value: clean(item.value, 180),
    reason: clean(item.reason || item.detail || '由使用过程提取，等待你确认。', 160),
    source: item.source || 'manual',
    projectId: item.projectId || null,
    projectName: item.projectName || '',
    status: item.status || 'pending',
    createdAt: item.createdAt || now(),
    decidedAt: item.decidedAt || null,
  };
}

export function loadPreferenceCandidates() {
  const stored = loadFromLocal(PROFILE_CANDIDATE_STORAGE_KEY, []);
  return Array.isArray(stored) ? stored.map(normalizeCandidate) : [];
}

export function savePreferenceCandidates(items) {
  const normalized = (Array.isArray(items) ? items : []).map(normalizeCandidate);
  saveToLocal(PROFILE_CANDIDATE_STORAGE_KEY, normalized);
  return normalized;
}

export function queuePreferenceCandidates(items = []) {
  const nextItems = uniqueByValue(items.map(normalizeCandidate));
  if (!nextItems.length) return loadPreferenceCandidates();

  const current = loadPreferenceCandidates();
  const existingPending = new Set(
    current
      .filter((item) => item.status === 'pending')
      .map((item) => `${item.type}:${item.field || ''}:${clean(item.value).toLowerCase()}`),
  );
  const merged = [
    ...nextItems.filter((item) => !existingPending.has(`${item.type}:${item.field || ''}:${clean(item.value).toLowerCase()}`)),
    ...current,
  ].slice(0, 120);
  return savePreferenceCandidates(merged);
}

export function decidePreferenceCandidate(id, status) {
  const next = loadPreferenceCandidates().map((item) => (
    item.id === id
      ? { ...item, status, decidedAt: now() }
      : item
  ));
  return savePreferenceCandidates(next);
}

function inferDimension(text) {
  const lower = text.toLowerCase();
  return DIMENSION_HINTS.find((entry) => entry.patterns.some((pattern) => lower.includes(pattern.toLowerCase()))) || null;
}

function splitPreferenceSentences(text) {
  return String(text || '')
    .split(/[。！？!?；;\n]+/)
    .map((item) => clean(item, 160))
    .filter((item) => item.length >= 4);
}

export function extractPreferenceCandidatesFromText(text, { project } = {}) {
  const sentences = splitPreferenceSentences(text);
  const candidates = [];

  sentences.forEach((sentence) => {
    const hasPreferenceVerb = /(喜欢|偏好|倾向|希望|想要|更喜欢|保留|可以多用|适合我)/.test(sentence);
    const hasProhibitionVerb = /(不喜欢|不要|避免|禁用|别用|不要再|不能|排斥|少用)/.test(sentence);
    if (!hasPreferenceVerb && !hasProhibitionVerb) return;

    if (hasProhibitionVerb) {
      candidates.push(normalizeCandidate({
        type: 'prohibition',
        value: sentence,
        reason: '用户在项目对话中表达了明确的不要或避免。',
        source: 'project-dialogue',
        projectId: project?.id,
        projectName: project?.name,
      }));
      return;
    }

    const dimension = inferDimension(sentence);
    if (dimension) {
      candidates.push(normalizeCandidate({
        type: 'dimension',
        field: dimension.key,
        value: sentence,
        reason: `用户描述与${dimension.label}偏好相关。`,
        source: 'project-dialogue',
        projectId: project?.id,
        projectName: project?.name,
      }));
    } else {
      candidates.push(normalizeCandidate({
        type: 'preference',
        value: sentence,
        reason: '用户在项目对话中表达了偏好。',
        source: 'project-dialogue',
        projectId: project?.id,
        projectName: project?.name,
      }));
    }
  });

  return uniqueByValue(candidates);
}

export function candidateFromAssetDecision(asset, decision, { project } = {}) {
  if (!asset) return null;
  const prompt = asset.prompt ? `，提示词：${clean(asset.prompt, 90)}` : '';
  const name = clean(asset.name || asset.id || '设计稿');
  if (decision === 'adopt') {
    return normalizeCandidate({
      type: 'preference',
      value: `倾向采用类似「${name}」的方向${prompt}`,
      reason: '用户采纳了该设计方向，可作为候选偏好。',
      source: 'asset-adopted',
      projectId: project?.id,
      projectName: project?.name,
    });
  }
  if (decision === 'reject') {
    return normalizeCandidate({
      type: 'prohibition',
      value: `避免类似「${name}」的方向${prompt}`,
      reason: '用户拒绝了该设计方向，可作为候选禁用项。',
      source: 'asset-rejected',
      projectId: project?.id,
      projectName: project?.name,
    });
  }
  return null;
}

function appendUnique(list = [], value) {
  const cleaned = clean(value, 180);
  if (!cleaned) return list;
  if (list.some((item) => clean(item).toLowerCase() === cleaned.toLowerCase())) return list;
  return [...list, cleaned];
}

export function applyPreferenceCandidate(profile, candidate) {
  const next = {
    ...profile,
    aesthetic: {
      ...(profile?.aesthetic || {}),
      dimensions: {
        ...((profile?.aesthetic || {}).dimensions || {}),
      },
    },
  };
  const aesthetic = next.aesthetic;

  if (candidate.type === 'dimension' && candidate.field && aesthetic.dimensions?.[candidate.field]) {
    const current = clean(aesthetic.dimensions[candidate.field].value, 600);
    const incoming = clean(candidate.value, 180);
    aesthetic.dimensions[candidate.field] = {
      ...aesthetic.dimensions[candidate.field],
      value: current ? `${current}；${incoming}` : incoming,
    };
  } else if (candidate.type === 'prohibition') {
    aesthetic.prohibitions = appendUnique(aesthetic.prohibitions || [], candidate.value);
  } else if (candidate.type === 'styleTag') {
    aesthetic.styleTags = appendUnique(aesthetic.styleTags || [], candidate.value);
  } else if (candidate.type === 'tool') {
    aesthetic.tools = appendUnique(aesthetic.tools || [], candidate.value);
  } else {
    aesthetic.preferences = appendUnique(aesthetic.preferences || [], candidate.value);
  }

  next.updatedAt = now();
  return next;
}

function extractJsonArray(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.candidates)) return parsed.candidates;
  } catch {
    // Continue with substring recovery.
  }
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

export async function generateProfileCandidatesWithAi(openclaw, text, { model, profile } = {}) {
  const prompt = [
    '你是一个设计师档案整理助手。',
    '请从用户描述中提取个人审美偏好候选，不要直接改档案。',
    '只返回 JSON 数组，每项字段为 type, field, value, reason。',
    'type 只能是 dimension, preference, prohibition, styleTag, tool。',
    '当 type=dimension 时，field 只能是 composition, color, typography, texture, spacing, detail, mood。',
    '',
    '当前档案摘要：',
    JSON.stringify(profile || {}, null, 2).slice(0, 5000),
    '',
    '用户描述：',
    text,
  ].join('\n');

  try {
    const result = await openclaw.codexExec(prompt, { model, timeoutSeconds: 180 });
    const parsed = extractJsonArray(result?.text || result?.stdout || '');
    if (parsed?.length) {
      return uniqueByValue(parsed.map((item) => normalizeCandidate({
        ...item,
        source: 'profile-ai-dialogue',
      })));
    }
  } catch {
    // Fallback below keeps the feature usable without a live AI call.
  }

  return extractPreferenceCandidatesFromText(text).map((item) => ({
    ...item,
    source: 'profile-dialogue',
  }));
}

export function persistDesignerProfile(profile) {
  saveToLocalAndSync('designer_profile', profile, '.gdpro/designer-profile.json');
  return profile;
}
