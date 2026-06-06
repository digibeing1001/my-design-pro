import { buildBrandAssetManifest } from './brandAssetManifest';
import { hasMaterialArtwork } from './materialArtwork';

export const ARTWORK_QUALITY_SCHEMA_VERSION = 'gdpro.material-artwork-qa.v1';

const BLOCKING_SEVERITIES = ['critical', 'high'];

function check({ id, label, passed, severity = 'high', detail = '', fix = '', evidence = '' }) {
  return {
    id,
    label,
    passed: Boolean(passed),
    severity,
    detail,
    fix,
    evidence,
  };
}

function parseDimension(value = '') {
  const match = String(value).trim().match(/^([0-9.]+)\s*([a-z%]*)$/i);
  if (!match) return null;
  return {
    value: Number(match[1]),
    unit: match[2] || '',
  };
}

function getSvgAttr(svg, attr) {
  const match = String(svg || '').match(new RegExp(`<svg[^>]*\\s${attr}=["']([^"']+)["']`, 'i'));
  return match?.[1] || '';
}

function getViewBox(svg) {
  const value = getSvgAttr(svg, 'viewBox');
  const parts = value.split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function almostEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.01;
}

function dimensionMatches(material, svg) {
  const width = parseDimension(getSvgAttr(svg, 'width'));
  const height = parseDimension(getSvgAttr(svg, 'height'));
  const size = material?.size || {};
  if (!width || !height || !size.width || !size.height) return false;
  const unit = size.unit || '';
  return (
    almostEqual(width.value, size.width) &&
    almostEqual(height.value, size.height) &&
    String(width.unit || '').toLowerCase() === String(unit).toLowerCase() &&
    String(height.unit || '').toLowerCase() === String(unit).toLowerCase()
  );
}

function viewBoxMatches(material, svg) {
  const box = getViewBox(svg);
  const size = material?.size || {};
  if (!box || !size.width || !size.height) return false;
  return almostEqual(box.x, 0) &&
    almostEqual(box.y, 0) &&
    almostEqual(box.width, size.width) &&
    almostEqual(box.height, size.height);
}

function getManifestRefIds(material) {
  return (material?.manifestRefs || [])
    .map((ref) => ref.itemId)
    .filter(Boolean);
}

function hasAllManifestRefs(material, svg) {
  const ids = getManifestRefIds(material);
  if (!ids.length) return false;
  return ids.every((id) => String(svg || '').includes(`data-manifest-ref="${id}"`));
}

function manifestRefsAreCurrent(material, manifest) {
  const currentIds = new Set((manifest?.items || []).map((item) => item.id));
  const refIds = getManifestRefIds(material);
  return refIds.length > 0 && refIds.every((id) => currentIds.has(id));
}

function hasUnsafeScript(svg) {
  return /<script[\s>]/i.test(svg) || /\son[a-z]+\s*=/i.test(svg);
}

function hasExternalRefs(svg) {
  return /\s(?:href|xlink:href|src)=["']https?:\/\//i.test(svg) ||
    /url\(["']?https?:\/\//i.test(svg);
}

function svgContainsRevision(svg, revision) {
  return Boolean(revision && String(svg || '').includes(String(revision)));
}

function materialPath(value) {
  return `materialProduction.materials.${value || 'unknown'}.artwork`;
}

export function auditMaterialArtwork(project, material) {
  const manifest = buildBrandAssetManifest(project);
  const svg = material?.artwork?.svg || '';
  const sourcePresent = hasMaterialArtwork(material);
  const manifestRevision = manifest.sourceRevision;
  const checks = [
    check({
      id: 'source-present',
      label: '可编辑矢量源稿已制作',
      passed: sourcePresent,
      severity: 'critical',
      detail: '商用交付需要可编辑的矢量源稿，不能只有物料状态记录。',
      fix: '从物料生产清单重新制作源稿。',
      evidence: materialPath(material?.id),
    }),
    check({
      id: 'svg-root',
      label: '矢量文件结构完整',
      passed: /<svg[\s>]/i.test(svg) && /<\/svg>/i.test(svg),
      severity: 'critical',
      detail: '当前源文件不是完整的 SVG 文档。',
      fix: '重新制作矢量源稿。',
      evidence: materialPath(material?.id),
    }),
    check({
      id: 'schema-metadata',
      label: '源稿记录了追溯信息',
      passed: svg.includes('gdpro.material-artwork.v1'),
      severity: 'high',
      detail: '源稿缺少可追溯的物料信息，后续无法可靠审查。',
      fix: '通过物料源稿工具重新制作。',
      evidence: '<metadata>',
    }),
    check({
      id: 'size-match',
      label: '源稿尺寸匹配物料规格',
      passed: dimensionMatches(material, svg),
      severity: 'high',
      detail: 'SVG 宽高与物料生产尺寸不一致。',
      fix: '按当前物料尺寸重新制作。',
      evidence: 'svg width/height',
    }),
    check({
      id: 'viewbox-match',
      label: '画布比例匹配物料规格',
      passed: viewBoxMatches(material, svg),
      severity: 'high',
      detail: 'SVG 画布比例与物料尺寸不一致，可能导致缩放或裁切偏移。',
      fix: '重新制作或修正画布比例。',
      evidence: 'svg viewBox',
    }),
    check({
      id: 'manifest-refs-current',
      label: '引用的是当前品牌资产',
      passed: manifestRefsAreCurrent(material, manifest),
      severity: 'high',
      detail: '一个或多个物料引用已缺失，或不再属于当前品牌资产清单。',
      fix: '锁定当前品牌资产后刷新物料引用。',
      evidence: 'material.manifestRefs',
    }),
    check({
      id: 'manifest-refs-embedded',
      label: '源稿嵌入了品牌资产引用',
      passed: hasAllManifestRefs(material, svg),
      severity: 'high',
      detail: 'SVG 没有记录全部必需品牌资产引用，无法审查复用一致性。',
      fix: '重新制作源稿，让品牌资产引用写入源文件。',
      evidence: 'data-manifest-ref',
    }),
    check({
      id: 'artwork-manifest-revision',
      label: '源稿版本匹配品牌资产清单',
      passed: Boolean(material?.artwork?.manifestRevision && material.artwork.manifestRevision === manifestRevision),
      severity: 'high',
      detail: '源稿版本过期，或缺少品牌资产清单版本记录。',
      fix: '锁定最新品牌资产后重新制作。',
      evidence: 'artwork.manifestRevision',
    }),
    check({
      id: 'svg-manifest-revision',
      label: 'SVG 写入了品牌资产版本',
      passed: svgContainsRevision(svg, manifestRevision),
      severity: 'high',
      detail: 'SVG 元数据没有写入当前品牌资产版本。',
      fix: '重新制作带版本记录的源稿。',
      evidence: '<metadata>.manifestRevision',
    }),
    check({
      id: 'no-script',
      label: '源稿不含脚本内容',
      passed: sourcePresent && !hasUnsafeScript(svg),
      severity: 'critical',
      detail: 'SVG 中的脚本或事件处理不适合客户交付包。',
      fix: '移除脚本内容，或重新制作安全源稿。',
      evidence: 'svg security scan',
    }),
    check({
      id: 'no-external-refs',
      label: '源稿不依赖外部资源',
      passed: sourcePresent && !hasExternalRefs(svg),
      severity: 'high',
      detail: '远程图片或字体会让源稿不可独立交付。',
      fix: '交付前嵌入或替换外部依赖。',
      evidence: 'href/src/url scan',
    }),
    check({
      id: 'source-size',
      label: '源稿大小合理',
      passed: svg.length >= 500 && svg.length <= 500000,
      severity: 'medium',
      detail: 'SVG 源稿过小或过大，可能不完整或过度膨胀。',
      fix: '检查源稿，必要时重新制作。',
      evidence: `${svg.length} bytes`,
    }),
  ];

  const issues = checks.filter((item) => !item.passed);
  const blockingIssues = issues.filter((item) => BLOCKING_SEVERITIES.includes(item.severity));
  const passedChecks = checks.filter((item) => item.passed).length;
  const readiness = checks.length ? Math.round((passedChecks / checks.length) * 100) : 0;

  return {
    schemaVersion: ARTWORK_QUALITY_SCHEMA_VERSION,
    materialId: material?.id || null,
    materialName: material?.name || '',
    status: blockingIssues.length ? 'blocked' : issues.length ? 'needs-review' : 'pass',
    passed: blockingIssues.length === 0,
    readiness,
    manifestRevision,
    artworkRevision: material?.artwork?.manifestRevision || null,
    checks,
    issues,
    summary: {
      total: checks.length,
      passed: passedChecks,
      critical: issues.filter((item) => item.severity === 'critical').length,
      high: issues.filter((item) => item.severity === 'high').length,
      medium: issues.filter((item) => item.severity === 'medium').length,
    },
  };
}

export function buildArtworkQualityReport(project) {
  const materials = project?.materialProduction?.materials || [];
  const audits = materials.map((material) => auditMaterialArtwork(project, material));
  const passed = audits.filter((audit) => audit.passed).length;
  const high = audits.reduce((sum, audit) => sum + audit.summary.high, 0);
  const critical = audits.reduce((sum, audit) => sum + audit.summary.critical, 0);
  const medium = audits.reduce((sum, audit) => sum + audit.summary.medium, 0);

  return {
    schemaVersion: ARTWORK_QUALITY_SCHEMA_VERSION,
    projectId: project?.id || null,
    status: critical ? 'blocked' : high ? 'needs-fix' : medium ? 'needs-review' : 'pass',
    passed: audits.length > 0 && passed === audits.length,
    audits,
    stats: {
      total: audits.length,
      passed,
      critical,
      high,
      medium,
      readiness: audits.length
        ? Math.round(audits.reduce((sum, audit) => sum + audit.readiness, 0) / audits.length)
        : 0,
    },
  };
}
