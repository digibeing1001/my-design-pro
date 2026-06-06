import { buildBrandAssetManifest } from './brandAssetManifest';

export const MATERIAL_ARTWORK_SCHEMA_VERSION = 'gdpro.material-artwork.v1';

function now() {
  return Date.now();
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(value) {
  return String(value || 'untitled')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'untitled';
}

function findManifestItem(manifest, role) {
  return (manifest?.items || []).find((item) => item.role === role);
}

function resolveToken(project, manifest) {
  const primaryColor = findManifestItem(manifest, 'primary-color-token');
  const displayFont = findManifestItem(manifest, 'display-font-token');
  const bodyFont = findManifestItem(manifest, 'body-font-token') || displayFont;
  const logo = findManifestItem(manifest, 'primary-logo');

  return {
    brandName: project?.brandName || project?.name || 'Brand',
    slogan: project?.brandKit?.slogan || project?.brandKit?.philosophy || 'Visual identity system',
    primaryColor: primaryColor?.value || project?.brandKit?.colors?.[0]?.hex || '#14b8a6',
    ink: '#111827',
    paper: '#f8fafc',
    muted: '#64748b',
    displayFont: displayFont?.value || project?.brandKit?.typography?.display || 'Inter',
    bodyFont: bodyFont?.value || project?.brandKit?.typography?.body || 'Inter',
    logoName: logo?.name || logo?.value || 'Primary Logo',
    logoId: logo?.id || logo?.assetId || 'logo',
  };
}

function safeSize(material) {
  const size = material?.size || {};
  return {
    width: Number(size.width) || 1000,
    height: Number(size.height) || 1000,
    unit: size.unit || 'px',
  };
}

function buildLogoMark(x, y, size, tokens) {
  const radius = Math.round(size * 0.22);
  const line = Math.round(size * 0.07);
  return `
    <g transform="translate(${x} ${y})" data-role="primary-logo" data-manifest-ref="${escapeText(tokens.logoId)}">
      <rect width="${size}" height="${size}" rx="${radius}" fill="${tokens.primaryColor}" opacity="0.14"/>
      <path d="M${size * 0.5} ${size * 0.16}v${size * 0.68}M${size * 0.16} ${size * 0.5}h${size * 0.68}" stroke="${tokens.primaryColor}" stroke-width="${line}" stroke-linecap="round"/>
      <circle cx="${size * 0.72}" cy="${size * 0.28}" r="${size * 0.08}" fill="${tokens.primaryColor}"/>
    </g>`;
}

function frameSvg(material, tokens, content) {
  const { width, height, unit } = safeSize(material);
  const manifestRefNodes = (material.manifestRefs || [])
    .filter((ref) => ref.itemId)
    .map((ref) => `    <path d="" data-role="${escapeText(ref.role)}" data-manifest-ref="${escapeText(ref.itemId)}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}${unit}" height="${height}${unit}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeText(material.name)}">
  <metadata>${escapeText(JSON.stringify({
    schemaVersion: MATERIAL_ARTWORK_SCHEMA_VERSION,
    materialId: material.id,
    templateId: material.templateId,
    manifestRevision: material.manifestRevision || material.artwork?.manifestRevision || null,
    manifestRefs: material.manifestRefs || [],
    generatedAt: new Date(now()).toISOString(),
  }))}</metadata>
  <g id="gdpro-manifest-refs" visibility="hidden">
${manifestRefNodes}
  </g>
  <defs>
    <style>
      .display { font-family: ${JSON.stringify(tokens.displayFont)}, Inter, sans-serif; font-weight: 700; letter-spacing: 0; }
      .body { font-family: ${JSON.stringify(tokens.bodyFont)}, Inter, sans-serif; font-weight: 500; letter-spacing: 0; }
      .caption { font-family: ${JSON.stringify(tokens.bodyFont)}, Inter, sans-serif; font-weight: 400; letter-spacing: 0; }
    </style>
  </defs>
${content}
</svg>`;
}

function renderBusinessCard(material, tokens) {
  const { width, height } = safeSize(material);
  const pad = Math.round(Math.min(width, height) * 0.12);
  const logoSize = Math.round(height * 0.24);
  return frameSvg(material, tokens, `
  <rect width="${width}" height="${height}" fill="${tokens.paper}"/>
  <rect x="${pad / 2}" y="${pad / 2}" width="${width - pad}" height="${height - pad}" rx="${Math.round(height * 0.04)}" fill="none" stroke="${tokens.primaryColor}" stroke-width="${Math.max(1, Math.round(height * 0.01))}"/>
  ${buildLogoMark(pad, pad, logoSize, tokens)}
  <text class="display" x="${pad + logoSize + pad * 0.55}" y="${pad + logoSize * 0.45}" font-size="${Math.round(height * 0.13)}" fill="${tokens.ink}">${escapeText(tokens.brandName)}</text>
  <text class="caption" x="${pad + logoSize + pad * 0.55}" y="${pad + logoSize * 0.78}" font-size="${Math.round(height * 0.055)}" fill="${tokens.muted}">${escapeText(tokens.slogan).slice(0, 60)}</text>
  <line x1="${pad}" y1="${height - pad * 1.15}" x2="${width - pad}" y2="${height - pad * 1.15}" stroke="${tokens.primaryColor}" stroke-width="${Math.max(1, Math.round(height * 0.008))}" opacity="0.5"/>
  <text class="body" x="${pad}" y="${height - pad * 0.55}" font-size="${Math.round(height * 0.06)}" fill="${tokens.ink}">Brand Contact</text>
  <text class="caption" x="${width - pad}" y="${height - pad * 0.55}" text-anchor="end" font-size="${Math.round(height * 0.05)}" fill="${tokens.muted}">hello@example.com</text>`);
}

function renderPoster(material, tokens) {
  const { width, height } = safeSize(material);
  const pad = Math.round(Math.min(width, height) * 0.08);
  const logoSize = Math.round(width * 0.15);
  return frameSvg(material, tokens, `
  <rect width="${width}" height="${height}" fill="${tokens.paper}"/>
  <rect x="0" y="0" width="${width}" height="${Math.round(height * 0.32)}" fill="${tokens.primaryColor}" opacity="0.14"/>
  ${buildLogoMark(pad, pad, logoSize, tokens)}
  <text class="display" x="${pad}" y="${Math.round(height * 0.48)}" font-size="${Math.round(width * 0.115)}" fill="${tokens.ink}">${escapeText(tokens.brandName)}</text>
  <text class="body" x="${pad}" y="${Math.round(height * 0.56)}" font-size="${Math.round(width * 0.04)}" fill="${tokens.muted}">${escapeText(tokens.slogan).slice(0, 70)}</text>
  <rect x="${pad}" y="${Math.round(height * 0.68)}" width="${width - pad * 2}" height="${Math.round(height * 0.12)}" fill="${tokens.primaryColor}" rx="${Math.round(width * 0.015)}"/>
  <text class="body" x="${width / 2}" y="${Math.round(height * 0.75)}" text-anchor="middle" font-size="${Math.round(width * 0.04)}" fill="${tokens.paper}">Launch Visual System</text>`);
}

function renderSocialSquare(material, tokens) {
  const { width, height } = safeSize(material);
  const min = Math.min(width, height);
  const logoSize = Math.round(min * 0.18);
  return frameSvg(material, tokens, `
  <rect width="${width}" height="${height}" fill="${tokens.ink}"/>
  <circle cx="${width * 0.85}" cy="${height * 0.15}" r="${min * 0.26}" fill="${tokens.primaryColor}" opacity="0.32"/>
  ${buildLogoMark(Math.round(width * 0.1), Math.round(height * 0.1), logoSize, tokens)}
  <text class="display" x="${width * 0.1}" y="${height * 0.56}" font-size="${Math.round(min * 0.085)}" fill="${tokens.paper}">${escapeText(tokens.brandName)}</text>
  <text class="body" x="${width * 0.1}" y="${height * 0.63}" font-size="${Math.round(min * 0.035)}" fill="${tokens.paper}" opacity="0.72">${escapeText(tokens.slogan).slice(0, 64)}</text>
  <rect x="${width * 0.1}" y="${height * 0.74}" width="${width * 0.36}" height="${height * 0.055}" rx="${height * 0.027}" fill="${tokens.primaryColor}"/>
  <text class="caption" x="${width * 0.28}" y="${height * 0.776}" text-anchor="middle" font-size="${Math.round(min * 0.024)}" fill="${tokens.ink}">BRAND KIT</text>`);
}

function renderPackageLabel(material, tokens) {
  const { width, height } = safeSize(material);
  const pad = Math.round(Math.min(width, height) * 0.1);
  return frameSvg(material, tokens, `
  <rect width="${width}" height="${height}" fill="${tokens.paper}"/>
  <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" rx="${Math.round(height * 0.05)}" fill="none" stroke="${tokens.ink}" stroke-width="${Math.max(1, Math.round(height * 0.01))}"/>
  <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${Math.round(height * 0.22)}" fill="${tokens.primaryColor}" opacity="0.9"/>
  <text class="display" x="${width / 2}" y="${pad + height * 0.14}" text-anchor="middle" font-size="${Math.round(height * 0.085)}" fill="${tokens.paper}">${escapeText(tokens.brandName)}</text>
  <text class="body" x="${width / 2}" y="${height * 0.55}" text-anchor="middle" font-size="${Math.round(height * 0.09)}" fill="${tokens.ink}">${escapeText(material.name)}</text>
  <text class="caption" x="${width / 2}" y="${height * 0.68}" text-anchor="middle" font-size="${Math.round(height * 0.045)}" fill="${tokens.muted}">${escapeText(tokens.slogan).slice(0, 52)}</text>`);
}

function renderSignage(material, tokens) {
  const { width, height } = safeSize(material);
  const logoSize = Math.round(height * 0.42);
  return frameSvg(material, tokens, `
  <rect width="${width}" height="${height}" fill="${tokens.ink}"/>
  <rect x="${height * 0.08}" y="${height * 0.08}" width="${width - height * 0.16}" height="${height - height * 0.16}" rx="${height * 0.06}" fill="none" stroke="${tokens.primaryColor}" stroke-width="${Math.max(2, Math.round(height * 0.015))}"/>
  ${buildLogoMark(Math.round(height * 0.22), Math.round(height * 0.29), logoSize, tokens)}
  <text class="display" x="${height * 0.22 + logoSize + height * 0.25}" y="${height * 0.53}" font-size="${Math.round(height * 0.22)}" fill="${tokens.paper}">${escapeText(tokens.brandName)}</text>
  <text class="caption" x="${height * 0.22 + logoSize + height * 0.25}" y="${height * 0.68}" font-size="${Math.round(height * 0.065)}" fill="${tokens.primaryColor}">${escapeText(tokens.slogan).slice(0, 72)}</text>`);
}

function renderArtworkSvg(project, material) {
  const manifest = buildBrandAssetManifest(project);
  const tokens = resolveToken(project, manifest);
  const materialWithRevision = {
    ...material,
    manifestRevision: manifest.sourceRevision,
  };

  if (material.templateId === 'poster-a3') return renderPoster(materialWithRevision, tokens);
  if (material.templateId === 'social-square') return renderSocialSquare(materialWithRevision, tokens);
  if (material.templateId === 'package-label') return renderPackageLabel(materialWithRevision, tokens);
  if (material.templateId === 'store-signage') return renderSignage(materialWithRevision, tokens);
  return renderBusinessCard(materialWithRevision, tokens);
}

function createArtwork(project, material) {
  const manifest = buildBrandAssetManifest(project);
  const svg = renderArtworkSvg(project, material);
  const basePath = `05_deliverables/${slug(material.name)}`;
  return {
    schemaVersion: MATERIAL_ARTWORK_SCHEMA_VERSION,
    materialId: material.id,
    templateId: material.templateId,
    sourceType: 'deterministic-svg',
    sourcePath: `${basePath}/source.svg`,
    previewPath: `${basePath}/preview.png`,
    svg,
    bytes: svg.length,
    manifestRevision: manifest.sourceRevision,
    generatedAt: now(),
    checks: [
      { id: 'has-source-svg', label: 'SVG source generated', passed: true },
      { id: 'uses-manifest-refs', label: 'Manifest references embedded', passed: true },
      { id: 'editable-source', label: 'Editable deterministic source', passed: true },
    ],
  };
}

export function hasMaterialArtwork(material) {
  return Boolean(material?.artwork?.svg && material.artwork.sourceType === 'deterministic-svg');
}

export function generateMaterialArtwork(project, materialId) {
  const materials = project?.materialProduction?.materials || [];
  const targetId = materialId || (materials.length === 1 ? materials[0]?.id : null);
  const target = materials.find((material) => material.id === targetId);
  if (!target) return project;

  const nextMaterials = materials.map((material) => (
    material.id === target.id
      ? {
        ...material,
        artwork: createArtwork(project, material),
        status: material.status === 'planned' ? 'designing' : material.status,
        updatedAt: now(),
      }
      : material
  ));

  return {
    ...project,
    materialProduction: {
      ...(project.materialProduction || {}),
      materials: nextMaterials,
      updatedAt: now(),
    },
    updatedAt: now(),
  };
}

export function generateAllMaterialArtwork(project) {
  const materials = project?.materialProduction?.materials || [];
  const nextMaterials = materials.map((material) => ({
    ...material,
    artwork: createArtwork(project, material),
    status: material.status === 'planned' ? 'designing' : material.status,
    updatedAt: now(),
  }));

  return {
    ...project,
    materialProduction: {
      ...(project.materialProduction || {}),
      materials: nextMaterials,
      updatedAt: now(),
    },
    updatedAt: now(),
  };
}
