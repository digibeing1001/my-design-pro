import { loadFromLocal, saveToLocalAndSync } from './storage';

export const BRAND_KIT_LIBRARY_STORAGE_KEY = 'brand_kit_library';
export const BRAND_KIT_LIBRARY_PATH = '.gdpro/brand-kits/brand-kit-library.json';

function now() {
  return Date.now();
}

function clean(value, max = 180) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function kitId() {
  return `kit_${now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function uniqueStrings(items = []) {
  const seen = new Set();
  return items
    .map((item) => clean(item, 220))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeColor(hex, index) {
  return {
    name: `色彩 ${index + 1}`,
    hex,
    usage: index === 0 ? '主色候选' : '辅助色候选',
  };
}

function inferSections(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => clean(line, 220))
    .filter(Boolean);

  const rules = [];
  const prohibitions = [];
  const keywords = [];
  lines.forEach((line) => {
    if (/(禁止|不要|避免|不得|不能|禁用|少用)/.test(line)) {
      prohibitions.push(line);
    } else if (/(必须|保持|统一|使用|规范|规则|一致|需要)/.test(line)) {
      rules.push(line);
    }
    if (/(调性|关键词|风格|情绪|品牌性格)/.test(line)) {
      keywords.push(line);
    }
  });

  return {
    rules: uniqueStrings(rules).slice(0, 10),
    prohibitions: uniqueStrings(prohibitions).slice(0, 10),
    keywords: uniqueStrings(keywords).slice(0, 8),
    summary: lines.slice(0, 6).join(' / '),
  };
}

function inferTypography(text) {
  const displayMatch = String(text || '').match(/(?:标题字体|Display|display|Heading|heading)[：:\s]+([^\n,，；;]+)/);
  const bodyMatch = String(text || '').match(/(?:正文字体|Body|body|Text|text)[：:\s]+([^\n,，；;]+)/);
  return {
    display: clean(displayMatch?.[1] || ''),
    body: clean(bodyMatch?.[1] || ''),
  };
}

function inferBrandName(text, fallback) {
  const heading = String(text || '').match(/^#\s+(.+)$/m)?.[1];
  const explicit = String(text || '').match(/(?:品牌名|品牌名称|Brand|brand)[：:\s]+([^\n]+)/)?.[1];
  return clean(explicit || heading || fallback || '未命名品牌套件', 80);
}

function buildGuidanceFromParsedFiles(files = []) {
  const text = files
    .map((file) => [file.name, file.parsed?.text, file.parsed?.content, file.parsed?.excerpt].filter(Boolean).join('\n'))
    .join('\n\n');
  const hexes = [...new Set((text.match(/#[0-9a-fA-F]{6}\b/g) || []).map((hex) => hex.toUpperCase()))];
  const sections = inferSections(text);
  return {
    brandName: inferBrandName(text, files[0]?.name?.replace(/\.[^.]+$/, '')),
    colors: hexes.slice(0, 8).map(normalizeColor),
    typography: inferTypography(text),
    philosophy: sections.keywords[0] || sections.summary || '',
    rules: sections.rules,
    prohibitions: sections.prohibitions,
    keywords: sections.keywords,
    summary: sections.summary,
  };
}

export function normalizeBrandKit(kit = {}) {
  const guidance = kit.guidance || {};
  return {
    id: kit.id || kitId(),
    name: clean(kit.name || guidance.brandName || '未命名品牌套件', 80),
    description: clean(kit.description || guidance.summary || '可分配给项目的一致性知识库。', 180),
    files: Array.isArray(kit.files) ? kit.files : [],
    guidance: {
      brandName: clean(guidance.brandName || kit.name || ''),
      colors: Array.isArray(guidance.colors) ? guidance.colors : [],
      typography: guidance.typography || {},
      philosophy: clean(guidance.philosophy || ''),
      rules: uniqueStrings(guidance.rules || []),
      prohibitions: uniqueStrings(guidance.prohibitions || []),
      keywords: uniqueStrings(guidance.keywords || []),
      summary: clean(guidance.summary || kit.description || '', 360),
    },
    assignedProjectIds: Array.isArray(kit.assignedProjectIds) ? kit.assignedProjectIds : [],
    createdAt: kit.createdAt || now(),
    updatedAt: kit.updatedAt || now(),
  };
}

export function loadBrandKitLibrary() {
  const stored = loadFromLocal(BRAND_KIT_LIBRARY_STORAGE_KEY, []);
  return Array.isArray(stored) ? stored.map(normalizeBrandKit) : [];
}

export function saveBrandKitLibrary(kits) {
  const normalized = (Array.isArray(kits) ? kits : []).map(normalizeBrandKit);
  saveToLocalAndSync(BRAND_KIT_LIBRARY_STORAGE_KEY, normalized, BRAND_KIT_LIBRARY_PATH);
  return normalized;
}

export function createBrandKitFromParsedFiles({ name, description, files }) {
  const normalizedFiles = (files || []).map((file) => ({
    id: file.id || `kit_file_${now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: file.name || '未命名文件',
    size: file.size || 0,
    type: file.type || 'file',
    createdAt: file.createdAt || now(),
    parsed: file.parsed || null,
  }));
  const guidance = buildGuidanceFromParsedFiles(normalizedFiles);
  return normalizeBrandKit({
    name: name || guidance.brandName,
    description: description || guidance.summary,
    files: normalizedFiles,
    guidance,
  });
}

export function upsertBrandKit(kit) {
  const current = loadBrandKitLibrary();
  const normalized = normalizeBrandKit(kit);
  const next = [
    normalized,
    ...current.filter((item) => item.id !== normalized.id),
  ];
  return saveBrandKitLibrary(next);
}

export function removeBrandKit(kitIdValue) {
  return saveBrandKitLibrary(loadBrandKitLibrary().filter((kit) => kit.id !== kitIdValue));
}

export function assignBrandKitToProject(project, kit) {
  if (!project || !kit) return project;
  const normalized = normalizeBrandKit(kit);
  const typography = normalized.guidance.typography || {};
  const rules = [
    ...(normalized.guidance.rules || []),
    ...(normalized.guidance.prohibitions || []).map((item) => `禁忌：${item}`),
  ];
  const philosophy = [
    normalized.guidance.philosophy,
    normalized.guidance.summary,
    rules.length ? `一致性规则：${rules.join('；')}` : '',
  ].filter(Boolean).join('\n');

  const nextProject = {
    ...project,
    assignedBrandKitId: normalized.id,
    brandName: project.brandName || normalized.guidance.brandName || '',
    brandKit: {
      ...(project.brandKit || {}),
      colors: normalized.guidance.colors?.length
        ? normalized.guidance.colors
        : (project.brandKit?.colors || []),
      typography: {
        ...((project.brandKit || {}).typography || {}),
        ...(typography.display ? { display: typography.display } : {}),
        ...(typography.body ? { body: typography.body } : {}),
      },
      philosophy: philosophy || project.brandKit?.philosophy || '',
      slogan: project.brandKit?.slogan || '',
    },
    brandKitSnapshot: normalized,
    documents: {
      ...(project.documents || {}),
      brandKitKnowledge: {
        title: `${normalized.name} 品牌套件知识`,
        content: [
          `# ${normalized.name} 品牌套件知识`,
          '',
          normalized.description,
          '',
          '## 一致性规则',
          ...(normalized.guidance.rules?.length ? normalized.guidance.rules.map((item) => `- ${item}`) : ['- 暂未解析到明确规则。']),
          '',
          '## 禁止事项',
          ...(normalized.guidance.prohibitions?.length ? normalized.guidance.prohibitions.map((item) => `- ${item}`) : ['- 暂未解析到明确禁止项。']),
        ].join('\n'),
        phase: project.currentPhase || 1,
        adoptedAt: now(),
        source: 'global-brand-kit-library',
      },
    },
    updatedAt: now(),
  };

  const library = loadBrandKitLibrary();
  const nextLibrary = library.map((item) => (
    item.id === normalized.id
      ? normalizeBrandKit({
        ...item,
        assignedProjectIds: [...new Set([...(item.assignedProjectIds || []), project.id])],
        updatedAt: now(),
      })
      : item
  ));
  saveBrandKitLibrary(nextLibrary.length ? nextLibrary : [normalized]);
  return nextProject;
}
