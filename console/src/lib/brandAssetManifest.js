export const BRAND_ASSET_MANIFEST_SCHEMA_VERSION = 'gdpro.brand-asset-manifest.v1';

function getProjectAssets(project) {
  return Object.values(project?.assets || {}).flat();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAsset(asset) {
  return {
    id: asset.id || asset.name,
    name: asset.name || '未命名资产',
    category: asset.category || 'asset',
    type: asset.type || 'unknown',
    status: asset.status || 'pending',
    source: asset.source || 'project-assets',
    phase: asset.phase,
    url: asset.url,
    previewUrl: asset.previewUrl,
    adoptedAt: asset.adoptedAt,
  };
}

function tokenItem({ id, role, name, value, source, usage }) {
  return {
    id,
    role,
    name,
    value,
    usage: usage || '',
    source,
    status: value ? 'locked' : 'missing',
  };
}

function buildSourceRevision(project, items) {
  const assetIds = items
    .filter((item) => item.assetId)
    .map((item) => `${item.assetId}:${item.status || 'unknown'}`)
    .sort();
  const tokenIds = items
    .filter((item) => item.role?.includes('token'))
    .map((item) => `${item.id}:${item.value || ''}`)
    .sort();
  return [...assetIds, ...tokenIds].join('|');
}

export function buildBrandAssetManifest(project) {
  const assets = getProjectAssets(project);
  const adopted = assets.filter((asset) => asset.status === 'adopted');
  const brandKit = project?.brandKit || {};
  const colors = asArray(brandKit.colors);
  const typography = brandKit.typography || {};
  const snapshot = project?.assetManifest || null;

  const logoItems = adopted
    .filter((asset) => asset.category === 'logo')
    .map((asset, index) => ({
      ...normalizeAsset(asset),
      id: `asset-logo-${asset.id || index}`,
      assetId: asset.id,
      role: index === 0 ? 'primary-logo' : 'logo-variant',
      reusable: true,
      locked: true,
    }));

  const reusableItems = adopted
    .filter((asset) => ['draft', 'product', 'scene', 'deliverable'].includes(asset.category))
    .map((asset) => ({
      ...normalizeAsset(asset),
      id: `asset-${asset.category}-${asset.id || asset.name}`,
      assetId: asset.id,
      role: asset.category === 'draft' ? 'visual-system' : asset.category,
      reusable: true,
      locked: true,
    }));

  const colorItems = colors.map((color, index) => tokenItem({
    id: `color-${index + 1}`,
    role: index === 0 ? 'primary-color-token' : 'color-token',
    name: color.name || color.label || color.hex || `Color ${index + 1}`,
    value: color.hex || color.color || color.value || '',
    usage: color.usage || color.role || '',
    source: 'brandKit.colors',
  }));

  const typeItems = [
    tokenItem({
      id: 'font-display',
      role: 'display-font-token',
      name: '标题字体',
      value: typography.display || '',
      source: 'brandKit.typography.display',
    }),
    tokenItem({
      id: 'font-body',
      role: 'body-font-token',
      name: '正文字体',
      value: typography.body || '',
      source: 'brandKit.typography.body',
    }),
  ].filter((item) => item.value);

  const philosophyItem = tokenItem({
    id: 'design-philosophy',
    role: 'strategy-token',
    name: '设计哲学',
    value: brandKit.philosophy || project?.documents?.philosophy?.title || '',
    source: brandKit.philosophy ? 'brandKit.philosophy' : 'documents.philosophy',
  });

  const items = [
    ...logoItems,
    ...colorItems,
    ...typeItems,
    ...(philosophyItem.value ? [philosophyItem] : []),
    ...reusableItems,
  ];

  const requiredSlots = [
    {
      id: 'primary-logo',
      label: '主 Logo',
      source: 'assets.logo',
      filled: logoItems.length > 0,
      itemId: logoItems[0]?.id,
    },
    {
      id: 'brand-colors',
      label: '品牌色',
      source: 'brandKit.colors',
      filled: colorItems.length > 0,
      itemId: colorItems[0]?.id,
    },
    {
      id: 'typography',
      label: '品牌字体',
      source: 'brandKit.typography',
      filled: typeItems.length > 0,
      itemId: typeItems[0]?.id,
    },
    {
      id: 'strategy',
      label: '设计哲学',
      source: 'brandKit.philosophy',
      filled: Boolean(philosophyItem.value),
      itemId: philosophyItem.value ? philosophyItem.id : null,
    },
  ];

  const missing = requiredSlots.filter((slot) => !slot.filled);
  const readyItemCount = requiredSlots.length - missing.length;
  const productionReady = missing.length === 0;
  const sourceRevision = buildSourceRevision(project, items);
  const locked = Boolean(snapshot?.lockedAt && snapshot?.sourceRevision === sourceRevision);
  const stale = Boolean(snapshot?.lockedAt && snapshot?.sourceRevision !== sourceRevision);

  return {
    schemaVersion: BRAND_ASSET_MANIFEST_SCHEMA_VERSION,
    projectId: project?.id || null,
    brandName: project?.brandName || '',
    status: locked ? 'locked' : stale ? 'stale' : productionReady ? 'ready-to-lock' : 'draft',
    locked,
    stale,
    lockedAt: snapshot?.lockedAt || null,
    lockedBy: snapshot?.lockedBy || null,
    sourceRevision,
    readyItemCount,
    requiredItemCount: requiredSlots.length,
    readiness: Math.round((readyItemCount / requiredSlots.length) * 100),
    productionReady,
    missing: missing.map((slot) => ({
      id: slot.id,
      label: slot.label,
      source: slot.source,
    })),
    requiredSlots,
    items,
    groups: {
      logos: logoItems,
      colors: colorItems,
      typography: typeItems,
      strategy: philosophyItem.value ? [philosophyItem] : [],
      reusable: reusableItems,
    },
    rules: [
      '跨物料重复元素必须引用同一份品牌资产，不得让模型重新绘制。',
      'Logo、品牌色和品牌字体一旦锁定，后续阶段只能通过明确操作更新。',
      '概念图只能作为方向探索或样机表达，不得替代品牌资产中的核心源文件。',
      '物料制作以后必须记录引用的品牌资产与导出路径。',
    ],
  };
}

export function createLockedBrandAssetManifest(project, { lockedBy = 'gui' } = {}) {
  const manifest = buildBrandAssetManifest(project);
  return {
    ...manifest,
    status: manifest.productionReady ? 'locked' : manifest.status,
    locked: manifest.productionReady,
    lockedAt: manifest.productionReady ? Date.now() : null,
    lockedBy: manifest.productionReady ? lockedBy : null,
  };
}
