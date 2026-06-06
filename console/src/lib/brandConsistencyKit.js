import { buildBrandAssetManifest } from './brandAssetManifest';
import { buildMaterialProductionPlan } from './materialProduction';
import { hasMaterialArtwork } from './materialArtwork';

export const BRAND_CONSISTENCY_KIT_SCHEMA_VERSION = 'gdpro.brand-consistency-kit.v1';

const VECTOR_TARGET_PATTERN = /(svg|vector|outline|ai|eps|editable)/i;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getProjectAssets(project) {
  return Object.values(project?.assets || {}).flat();
}

function isVectorAsset(asset = {}) {
  const value = `${asset.type || ''} ${asset.name || ''} ${asset.path || ''} ${asset.url || ''}`;
  return /\.(svg|ai|eps|pdf)$/i.test(value) || /\b(svg|ai|eps|vector)\b/i.test(value);
}

export function hasVectorExportTarget(material = {}) {
  return asArray(material.exportTargets).some((target) => VECTOR_TARGET_PATTERN.test(String(target || '')));
}

function contractItem({ id, label, labelEn, passed, detail, evidence, weight = 1 }) {
  return {
    id,
    label,
    labelEn,
    passed: Boolean(passed),
    detail,
    evidence,
    weight,
  };
}

function issue({ id, severity, title, detail, fix, evidence, scope = 'brand-kit' }) {
  return {
    id,
    severity,
    title,
    detail,
    fix,
    evidence,
    scope,
  };
}

function statusLabel(status) {
  if (status === 'locked') return '品牌套件可用于交付';
  if (status === 'needs-vector') return '需要补齐矢量源稿';
  if (status === 'needs-kit') return '需要补齐品牌套件';
  if (status === 'stale') return '品牌套件有变更待同步';
  return '品牌套件待整理';
}

export function buildBrandConsistencyKit(project, options = {}) {
  const manifest = options.manifest || buildBrandAssetManifest(project);
  const materialPlan = options.materialPlan || buildMaterialProductionPlan(project);
  const assets = getProjectAssets(project);
  const adoptedLogos = assets.filter((asset) => asset.category === 'logo' && asset.status === 'adopted');
  const vectorLogos = adoptedLogos.filter(isVectorAsset);
  const materials = materialPlan.materials || [];
  const sourceSvgReady = materials.filter((material) => hasMaterialArtwork(material));
  const vectorTargetReady = materials.filter((material) => hasVectorExportTarget(material));
  const manifestRefReady = (materialPlan.evaluations || []).filter((evaluation) => !evaluation.missingRoles?.length);
  const exportedWithSource = materials.filter((material) => material.status === 'exported' && hasMaterialArtwork(material));
  const hasGuidance = Boolean(project?.brandKit?.philosophy || project?.documents?.philosophy?.content || project?.documents?.philosophy?.title);

  const contract = [
    contractItem({
      id: 'brand-name',
      label: '品牌名称',
      labelEn: 'Name',
      passed: Boolean(project?.brandName),
      detail: project?.brandName || '先确认品牌名称',
      evidence: 'project.brandName',
    }),
    contractItem({
      id: 'vector-logo',
      label: '矢量 Logo',
      labelEn: 'Logo',
      passed: vectorLogos.length > 0,
      detail: vectorLogos.length ? `${vectorLogos.length} 个可复用矢量标识` : '最终 VI 需要 SVG/AI/EPS 等可编辑标识源文件',
      evidence: vectorLogos.map((asset) => asset.name || asset.id).join('、') || 'assets.logo',
      weight: 1.3,
    }),
    contractItem({
      id: 'color-tokens',
      label: '品牌颜色',
      labelEn: 'Color',
      passed: manifest.groups.colors.length > 0,
      detail: manifest.groups.colors.length ? `${manifest.groups.colors.length} 个品牌色` : '先锁定主色、辅助色和使用比例',
      evidence: 'brandKit.colors',
    }),
    contractItem({
      id: 'type-tokens',
      label: '品牌字体',
      labelEn: 'Type',
      passed: manifest.groups.typography.length > 0,
      detail: manifest.groups.typography.length ? `${manifest.groups.typography.length} 个品牌字体` : '先锁定标题字体和正文字体',
      evidence: 'brandKit.typography',
    }),
    contractItem({
      id: 'design-guidance',
      label: '设计指导',
      labelEn: 'Guide',
      passed: hasGuidance,
      detail: hasGuidance ? '已记录风格方向、禁忌和视觉语言' : '需要一份能约束后续创作的设计指导',
      evidence: 'brandKit.philosophy / documents.philosophy',
    }),
    contractItem({
      id: 'manifest-lock',
      label: '套件锁定',
      labelEn: 'Lock',
      passed: manifest.locked,
      detail: manifest.locked ? '后续物料会引用同一份品牌资产清单' : '开始批量物料前需要锁定品牌资产清单',
      evidence: 'assetManifest.lockedAt',
      weight: 1.4,
    }),
    contractItem({
      id: 'material-refs',
      label: '物料引用',
      labelEn: 'Refs',
      passed: materials.length > 0 && manifestRefReady.length === materials.length,
      detail: materials.length
        ? `${manifestRefReady.length}/${materials.length} 个物料已绑定品牌套件`
        : '先创建客户会收到的交付物',
      evidence: 'materialProduction.materials.*.manifestRefs',
      weight: 1.2,
    }),
    contractItem({
      id: 'source-svg',
      label: '矢量源稿',
      labelEn: 'Vector',
      passed: materials.length > 0 && sourceSvgReady.length === materials.length,
      detail: materials.length
        ? `${sourceSvgReady.length}/${materials.length} 个物料已有可编辑矢量源稿`
        : '最终交付物需要可编辑矢量源稿',
      evidence: 'materialProduction.materials.*.artwork.svg',
      weight: 1.5,
    }),
    contractItem({
      id: 'vector-exports',
      label: '矢量交付',
      labelEn: 'Deliver',
      passed: materials.length > 0 && vectorTargetReady.length === materials.length,
      detail: materials.length
        ? `${vectorTargetReady.length}/${materials.length} 个物料包含矢量/可编辑导出目标`
        : '交付格式需要包含 SVG 或其他可编辑源文件',
      evidence: 'materialProduction.materials.*.exportTargets',
      weight: 1.3,
    }),
  ];

  const totalWeight = contract.reduce((sum, item) => sum + item.weight, 0) || 1;
  const earnedWeight = contract.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
  const readiness = Math.round((earnedWeight / totalWeight) * 100);
  const issues = [];

  if (!vectorLogos.length) {
    issues.push(issue({
      id: 'vector-logo-missing',
      severity: 'critical',
      title: '缺少可编辑 Logo 源文件',
      detail: '品牌套件不能只存预览图，最终 VI 必须有 SVG/AI/EPS 等可复用标识源文件。',
      fix: '上传或制作矢量 Logo 后再锁定品牌套件。',
      evidence: 'assets.logo',
    }));
  }

  if (!manifest.locked) {
    issues.push(issue({
      id: manifest.stale ? 'manifest-stale' : 'manifest-unlocked',
      severity: 'critical',
      title: manifest.stale ? '品牌套件有变更待同步' : '品牌套件尚未锁定',
      detail: manifest.stale ? 'Logo、颜色、字体或设计指导发生变化，后续物料需要重新绑定。' : '批量制作前需要把 Logo、颜色、字体和设计指导锁成同一份品牌资产清单。',
      fix: '在品牌资产节点锁定或重新锁定品牌资产清单。',
      evidence: 'assetManifest',
    }));
  }

  if (materials.length && manifestRefReady.length !== materials.length) {
    issues.push(issue({
      id: 'material-refs-incomplete',
      severity: 'high',
      title: '有物料没有绑定品牌套件',
      detail: `${materials.length - manifestRefReady.length} 个物料缺少 Logo、颜色或字体引用，后续容易出现风格漂移。`,
      fix: '同步物料的品牌资产引用。',
      evidence: 'materialProduction.materials.*.manifestRefs',
      scope: 'material',
    }));
  }

  if (materials.length && sourceSvgReady.length !== materials.length) {
    issues.push(issue({
      id: 'source-svg-incomplete',
      severity: 'critical',
      title: '有物料缺少矢量源稿',
      detail: `${materials.length - sourceSvgReady.length} 个物料还不能作为可交付源文件，只能视为待制作状态。`,
      fix: '制作可编辑矢量源稿，并通过源稿检查。',
      evidence: 'materialProduction.materials.*.artwork.svg',
      scope: 'delivery',
    }));
  }

  if (materials.length && vectorTargetReady.length !== materials.length) {
    issues.push(issue({
      id: 'vector-targets-incomplete',
      severity: 'high',
      title: '交付格式缺少矢量目标',
      detail: `${materials.length - vectorTargetReady.length} 个物料没有标注 SVG、AI、EPS 或可编辑源文件目标。`,
      fix: '为每个物料补齐可编辑矢量交付目标。',
      evidence: 'materialProduction.materials.*.exportTargets',
      scope: 'delivery',
    }));
  }

  const basicKitReady = contract
    .filter((item) => ['brand-name', 'vector-logo', 'color-tokens', 'type-tokens', 'design-guidance', 'manifest-lock'].includes(item.id))
    .every((item) => item.passed);
  const vectorReady = !materials.length || (sourceSvgReady.length === materials.length && vectorTargetReady.length === materials.length);
  const status = manifest.stale
    ? 'stale'
    : basicKitReady && vectorReady
      ? 'locked'
      : !basicKitReady
        ? 'needs-kit'
        : 'needs-vector';

  return {
    schemaVersion: BRAND_CONSISTENCY_KIT_SCHEMA_VERSION,
    projectId: project?.id || null,
    brandName: project?.brandName || '',
    status,
    statusLabel: statusLabel(status),
    readiness,
    locked: basicKitReady,
    readyForDelivery: basicKitReady && materials.length > 0 && vectorReady && manifestRefReady.length === materials.length,
    contract,
    issues,
    stats: {
      contractItems: contract.length,
      passedItems: contract.filter((item) => item.passed).length,
      materials: materials.length,
      boundMaterials: manifestRefReady.length,
      sourceSvgReady: sourceSvgReady.length,
      vectorTargets: vectorTargetReady.length,
      exportedWithSource: exportedWithSource.length,
      vectorLogos: vectorLogos.length,
      colors: manifest.groups.colors.length,
      typography: manifest.groups.typography.length,
    },
    rules: [
      '每个项目只能有一份当前生效的品牌套件，所有物料必须引用它。',
      'Logo、颜色、字体、设计指导发生变化后，下游物料必须重新同步。',
      '最终交付必须包含可编辑矢量源稿；位图只能作为预览或补充格式。',
      '概念图不能替代生产源文件，交付前必须通过源稿检查和交付前检查。',
    ],
  };
}
