import { loadFromLocal } from './storage';
import { buildSkillAlignedProfile } from './contextAssembler';
import { buildBrandAssetManifest, createLockedBrandAssetManifest } from './brandAssetManifest';
import { buildDeliveryPackage, createDeliveryPackage } from './deliveryPackage';
import { buildArtworkQualityReport } from './artworkQuality';
import { buildProductionRepairQueue } from './productionRepairQueue';
import { buildDesignScorecard, createDesignScorecardDocument } from './designScorecard';
import { buildDesignBriefContract, createDesignBriefContractDocument } from './designBriefContract';
import { buildProductionImpactMatrix, createProductionImpactDocument } from './productionImpact';
import { buildReviewBoard, createReviewBoardDocument } from './reviewBoard';
import { buildMaterialProductionPlan, createMaterialSpecDocument } from './materialProduction';
import { generateAllMaterialArtwork } from './materialArtwork';
import { runPreflightReview } from './preflightReview';

function slug(value) {
  return String(value || 'export')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'export';
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  bytes.forEach((byte) => {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  });
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dateToDos(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function textBytes(value) {
  return new TextEncoder().encode(String(value ?? ''));
}

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function headerBytes(values) {
  const bytes = [];
  values.forEach(([size, value]) => {
    for (let i = 0; i < size; i += 1) {
      bytes.push((value >>> (i * 8)) & 0xFF);
    }
  });
  return new Uint8Array(bytes);
}

function normalizeZipPath(value) {
  return String(value || 'file.txt').replace(/\\/g, '/').replace(/^\/+/, '');
}

function normalizeWorkspacePath(value) {
  return normalizeZipPath(value)
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[<>:"\\|?*]/g, '-'))
    .join('/');
}

export function buildZipArchive(files, generatedAt = new Date()) {
  const localParts = [];
  const centralParts = [];
  const { dosTime, dosDate } = dateToDos(generatedAt);
  let offset = 0;

  files.forEach((file) => {
    const filename = textBytes(normalizeZipPath(file.path));
    const content = typeof file.content === 'string' ? textBytes(file.content) : new Uint8Array(file.content || []);
    const checksum = crc32(content);
    const localHeader = headerBytes([
      [4, 0x04034B50],
      [2, 20],
      [2, 0x0800],
      [2, 0],
      [2, dosTime],
      [2, dosDate],
      [4, checksum],
      [4, content.length],
      [4, content.length],
      [2, filename.length],
      [2, 0],
    ]);
    localParts.push(localHeader, filename, content);

    const centralHeader = headerBytes([
      [4, 0x02014B50],
      [2, 20],
      [2, 20],
      [2, 0x0800],
      [2, 0],
      [2, dosTime],
      [2, dosDate],
      [4, checksum],
      [4, content.length],
      [4, content.length],
      [2, filename.length],
      [2, 0],
      [2, 0],
      [2, 0],
      [2, 0],
      [4, 0],
      [4, offset],
    ]);
    centralParts.push(centralHeader, filename);
    offset += localHeader.length + filename.length + content.length;
  });

  const localData = concatBytes(localParts);
  const centralData = concatBytes(centralParts);
  const end = headerBytes([
    [4, 0x06054B50],
    [2, 0],
    [2, 0],
    [2, files.length],
    [2, files.length],
    [4, centralData.length],
    [4, localData.length],
    [2, 0],
  ]);

  return concatBytes([localData, centralData, end]);
}

function collectDocumentFiles(project) {
  const docs = project?.documents || {};
  return Object.entries(docs)
    .filter(([, doc]) => doc?.content)
    .map(([key, doc]) => ({
      path: `documents/${slug(key)}.md`,
      type: 'document',
      mime: 'text/markdown',
      title: doc.title || key,
      content: doc.content,
      bytes: doc.content.length,
    }));
}

function collectMaterialArtworkFiles(project) {
  const materials = project?.materialProduction?.materials || [];
  return materials
    .filter((material) => material?.artwork?.svg)
    .map((material) => ({
      path: material.artwork.sourcePath || `05_deliverables/${slug(material.name)}/source.svg`,
      type: 'material-source',
      mime: 'image/svg+xml',
      materialId: material.id,
      materialName: material.name,
      content: material.artwork.svg,
      bytes: material.artwork.svg.length,
    }));
}

function collectMaterialHandoffFiles(project) {
  const materials = project?.materialProduction?.materials || [];
  return materials.map((material) => {
    const sourcePath = material.artwork?.sourcePath || `05_deliverables/${slug(material.name)}/source.svg`;
    const lines = [
      `# ${material.name}`,
      '',
      `- Material ID: ${material.id}`,
      `- Channel: ${material.channel || 'not specified'}`,
      `- Size: ${material.size?.width || '?'} x ${material.size?.height || '?'} ${material.size?.unit || ''}`,
      `- Color mode: ${material.colorMode || 'not specified'}`,
      `- Editable source: ${sourcePath}`,
      `- Status: ${material.status || 'planned'}`,
      '',
      '## Export Targets',
      ...(material.exportTargets || []).map((target) => `- ${target}`),
      '',
      '## Production Notes',
      '- SVG source is the editable production file. Bitmap exports are previews or delivery supplements.',
      '- If this material is not marked exported, review the blockers in 00_project/delivery-bundle.json before client handoff.',
      '- The file index lists the actual files included in this bundle. PDF/PNG targets remain production requirements unless a concrete exported file is listed.',
    ];
    const content = lines.join('\n');
    return {
      path: `05_deliverables/${slug(material.name)}/README.md`,
      type: 'material-handoff-note',
      mime: 'text/markdown',
      materialId: material.id,
      materialName: material.name,
      content,
      bytes: content.length,
    };
  });
}

function createBundleReadme(bundle) {
  const sourceCount = bundle.stats.materialSources;
  const blockerCount = bundle.deliveryPackage?.blockers?.length || 0;
  const blockerLines = blockerCount
    ? bundle.deliveryPackage.blockers
      .slice(0, 12)
      .map((item) => `- [${item.level}] ${item.title}: ${item.fix || item.detail}`)
    : ['- No Critical/High blocker is currently recorded.'];

  return [
    '# Graphic Design Pro Delivery Bundle',
    '',
    `Project: ${bundle.projectName || 'Untitled Project'}`,
    `Brand: ${bundle.brandName || bundle.projectName || 'Untitled Brand'}`,
    `Exported: ${bundle.exportedAt}`,
    `Status: ${bundle.deliveryPackage?.status || 'draft'}`,
    `Readiness: ${bundle.deliveryPackage?.readiness || 0}%`,
    '',
    '## What is inside',
    '- 00_project: project data, delivery manifest, and bundle metadata.',
    '- 01_strategy: locked brand assets, brief contract, and brand consistency inputs.',
    '- 02_production: VI material production specification.',
    '- 03_review: source QA, design scorecard, impact matrix, and sign-off records.',
    '- 04_guidelines: VI manual and client handoff guide.',
    '- 05_deliverables: editable SVG source files and material handoff notes.',
    '',
    '## Editable Vector Sources',
    sourceCount
      ? `This bundle includes ${sourceCount} editable SVG source file(s).`
      : 'No editable SVG source file is included yet. Create material artwork before final delivery.',
    '',
    '## Handoff Blockers',
    ...blockerLines,
    '',
    '## Important',
    'Bitmap exports are previews or supplements. The production source of truth is the editable SVG/source artwork plus the brand asset manifest.',
    '',
  ].join('\n');
}

function createFileIndexCsv(files) {
  const rows = [
    ['path', 'type', 'mime', 'bytes', 'title', 'material'].join(','),
    ...files.map((file) => [
      file.path,
      file.type || '',
      file.mime || '',
      file.bytes || 0,
      file.title || '',
      file.materialName || '',
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')),
  ];
  return rows.join('\n');
}

function deliveryBundleManifest(bundle) {
  return {
    ...bundle,
    project: undefined,
    files: bundle.files.map((file) => ({
      path: file.path,
      type: file.type,
      mime: file.mime,
      title: file.title,
      materialId: file.materialId,
      materialName: file.materialName,
      bytes: file.bytes,
    })),
  };
}

export function prepareDeliveryExportProject(project) {
  if (!project) return null;
  let prepared = {
    ...project,
    documents: {
      ...(project.documents || {}),
    },
  };

  const manifest = buildBrandAssetManifest(prepared);
  if (!manifest.locked && manifest.productionReady) {
    prepared = {
      ...prepared,
      assetManifest: createLockedBrandAssetManifest(prepared, { lockedBy: 'delivery-export' }),
      updatedAt: Date.now(),
    };
  }

  const plan = buildMaterialProductionPlan(prepared);
  if (plan.materials.length) {
    prepared = generateAllMaterialArtwork(prepared);
    prepared = {
      ...prepared,
      documents: {
        ...(prepared.documents || {}),
        materialSpec: createMaterialSpecDocument(prepared),
      },
      updatedAt: Date.now(),
    };
  }

  prepared = runPreflightReview(prepared);
  prepared = createDeliveryPackage(prepared);

  return prepared;
}

/**
 * Export the current project + designer profile + knowledge base as a .gdpro.json file.
 * Designer profile is exported in Skill-aligned format (AP-numbered preferences).
 * This file can be imported by the Skill to maintain context continuity.
 */
export function exportGdproProject(project) {
  const profile = loadFromLocal('designer_profile', {});
  const allProjects = loadFromLocal('projects', []);

  // Collect all references from all projects into a global knowledge base
  const allReferences = [];
  allProjects.forEach((p) => {
    (p.references || []).forEach((r) => {
      allReferences.push({
        id: r.id,
        name: r.name,
        category: r.category,
        type: r.type,
        parsed: r.parsed || { status: 'pending' },
        projectId: p.id,
        projectName: p.name,
      });
    });
  });

  const payload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    // Designer profile in Skill-aligned format with AP-numbered preferences
    designerProfile: buildSkillAlignedProfile(profile),
    knowledgeBase: {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      references: allReferences,
    },
    project: project
      ? {
          version: '1.0',
          id: project.id,
          name: project.name,
          brandName: project.brandName || project.name,
          currentPhase: project.currentPhase || 1,
          status: project.status || 'active',
          createdAt: project.createdAt,
          updatedAt: Date.now(),
          documents: project.documents || {},
          brandKit: project.brandKit || {},
          workflow: project.workflow || {},
          control: project.control || {},
          assetManifest: project.assetManifest || buildBrandAssetManifest(project),
          materialProduction: project.materialProduction || {},
          preflightReview: project.preflightReview || {},
          deliveryPackage: project.deliveryPackage || buildDeliveryPackage(project),
          productionRepairQueue: buildProductionRepairQueue(project),
          designBriefContract: buildDesignBriefContract(project),
          designScorecard: buildDesignScorecard(project),
          productionImpact: buildProductionImpactMatrix(project),
          reviewBoard: buildReviewBoard(project),
          assets: project.assets || {},
          references: (project.references || []).map((r) => r.id),
        }
      : null,
  };

  downloadJson(payload, `gdpro-${slug(project?.name)}-${Date.now()}.json`);
}

export function buildDeliveryBundle(project, options = {}) {
  const resolvedProject = options.prepare ? prepareDeliveryExportProject(project) : project;
  const manifest = resolvedProject ? (resolvedProject.assetManifest || buildBrandAssetManifest(resolvedProject)) : null;
  const deliveryPackage = resolvedProject ? (resolvedProject.deliveryPackage || buildDeliveryPackage(resolvedProject)) : null;
  const artworkQuality = resolvedProject ? buildArtworkQualityReport(resolvedProject) : null;
  const productionRepairQueue = resolvedProject ? buildProductionRepairQueue(resolvedProject) : null;
  const designBriefContract = resolvedProject ? buildDesignBriefContract(resolvedProject) : null;
  const designScorecard = resolvedProject ? buildDesignScorecard(resolvedProject, { deliveryPackage, artworkQuality, designBriefContract }) : null;
  const productionImpact = resolvedProject ? buildProductionImpactMatrix(resolvedProject, { deliveryPackage, artworkQuality, designBriefContract, designScorecard }) : null;
  const reviewBoard = resolvedProject ? buildReviewBoard(resolvedProject, { deliveryPackage, designScorecard }) : null;
  const designBriefContractDocument = resolvedProject ? createDesignBriefContractDocument(resolvedProject, { contract: designBriefContract }) : null;
  const designScorecardDocument = resolvedProject ? createDesignScorecardDocument(resolvedProject, { scorecard: designScorecard }) : null;
  const productionImpactDocument = resolvedProject ? createProductionImpactDocument(resolvedProject, { matrix: productionImpact }) : null;
  const reviewBoardDocument = resolvedProject ? createReviewBoardDocument(resolvedProject, { deliveryPackage, designScorecard }) : null;
  const files = [
    {
      path: '00_project/project.json',
      type: 'project-data',
      mime: 'application/json',
      content: JSON.stringify(resolvedProject || {}, null, 2),
      bytes: JSON.stringify(resolvedProject || {}).length,
    },
    {
      path: '01_strategy/brand-asset-manifest.json',
      type: 'asset-manifest',
      mime: 'application/json',
      content: JSON.stringify(manifest || {}, null, 2),
      bytes: JSON.stringify(manifest || {}).length,
    },
    {
      path: '01_strategy/design-brief-contract.json',
      type: 'design-brief-contract',
      mime: 'application/json',
      content: JSON.stringify(designBriefContract || {}, null, 2),
      bytes: JSON.stringify(designBriefContract || {}).length,
    },
    {
      path: '01_strategy/design-brief-contract.md',
      type: 'document',
      mime: 'text/markdown',
      title: designBriefContractDocument?.title || 'Design Brief Contract',
      content: designBriefContractDocument?.content || '',
      bytes: designBriefContractDocument?.content?.length || 0,
    },
    {
      path: '00_project/delivery-package.json',
      type: 'delivery-package',
      mime: 'application/json',
      content: JSON.stringify(deliveryPackage || {}, null, 2),
      bytes: JSON.stringify(deliveryPackage || {}).length,
    },
    {
      path: '03_review/artwork-quality-report.json',
      type: 'artwork-quality-report',
      mime: 'application/json',
      content: JSON.stringify(artworkQuality || {}, null, 2),
      bytes: JSON.stringify(artworkQuality || {}).length,
    },
    {
      path: '03_review/production-repair-queue.json',
      type: 'production-repair-queue',
      mime: 'application/json',
      content: JSON.stringify(productionRepairQueue || {}, null, 2),
      bytes: JSON.stringify(productionRepairQueue || {}).length,
    },
    {
      path: '03_review/production-impact-matrix.json',
      type: 'production-impact-matrix',
      mime: 'application/json',
      content: JSON.stringify(productionImpact || {}, null, 2),
      bytes: JSON.stringify(productionImpact || {}).length,
    },
    {
      path: '03_review/production-impact-matrix.md',
      type: 'document',
      mime: 'text/markdown',
      title: productionImpactDocument?.title || 'Production Impact Matrix',
      content: productionImpactDocument?.content || '',
      bytes: productionImpactDocument?.content?.length || 0,
    },
    {
      path: '03_review/design-director-scorecard.json',
      type: 'design-director-scorecard',
      mime: 'application/json',
      content: JSON.stringify(designScorecard || {}, null, 2),
      bytes: JSON.stringify(designScorecard || {}).length,
    },
    {
      path: '03_review/design-director-scorecard.md',
      type: 'document',
      mime: 'text/markdown',
      title: designScorecardDocument?.title || 'Design Director Scorecard',
      content: designScorecardDocument?.content || '',
      bytes: designScorecardDocument?.content?.length || 0,
    },
    {
      path: '03_review/review-board.json',
      type: 'review-board',
      mime: 'application/json',
      content: JSON.stringify(reviewBoard || {}, null, 2),
      bytes: JSON.stringify(reviewBoard || {}).length,
    },
    {
      path: '03_review/review-board.md',
      type: 'document',
      mime: 'text/markdown',
      title: reviewBoardDocument?.title || 'Review Board Signoff',
      content: reviewBoardDocument?.content || '',
      bytes: reviewBoardDocument?.content?.length || 0,
    },
    ...collectDocumentFiles(resolvedProject),
    ...collectMaterialArtworkFiles(resolvedProject),
    ...collectMaterialHandoffFiles(resolvedProject),
  ];

  return {
    version: '1.0',
    schemaVersion: 'gdpro.delivery-bundle.v1',
    exportedAt: new Date().toISOString(),
    projectId: resolvedProject?.id || null,
    projectName: resolvedProject?.name || '',
    brandName: resolvedProject?.brandName || resolvedProject?.name || '',
    project: resolvedProject,
    deliveryPackage,
    artworkQuality,
    productionRepairQueue,
    designBriefContract,
    designScorecard,
    productionImpact,
    reviewBoard,
    files,
    stats: {
      files: files.length,
      materialSources: files.filter((file) => file.type === 'material-source').length,
      bytes: files.reduce((sum, file) => sum + (file.bytes || 0), 0),
    },
  };
}

function zipFilesForBundle(bundle) {
  const readme = createBundleReadme(bundle);
  const fileIndex = createFileIndexCsv(bundle.files);
  const manifest = deliveryBundleManifest(bundle);

  return [
    {
      path: 'README.md',
      content: readme,
    },
    {
      path: '00_project/file-index.csv',
      content: fileIndex,
    },
    {
      path: '00_project/delivery-bundle.json',
      content: JSON.stringify(manifest, null, 2),
    },
    ...bundle.files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
  ];
}

export function getDeliveryBundleWorkspaceFiles(bundle) {
  if (!bundle) return {};
  const projectKey = slug(bundle.projectId || bundle.projectName || 'project');
  const root = `.gdpro/delivery/${projectKey}`;
  const readme = createBundleReadme(bundle);
  const fileIndex = createFileIndexCsv(bundle.files);
  const manifest = deliveryBundleManifest(bundle);
  const files = {
    [`${root}/README.md`]: readme,
    [`${root}/00_project/file-index.csv`]: fileIndex,
    [`${root}/00_project/delivery-bundle.json`]: JSON.stringify(manifest, null, 2),
    [`${root}/00_project/prepared-project.json`]: JSON.stringify(bundle.project || {}, null, 2),
    '.gdpro/delivery/latest.json': JSON.stringify({
      projectId: bundle.projectId,
      projectName: bundle.projectName,
      brandName: bundle.brandName,
      root,
      exportedAt: bundle.exportedAt,
      status: bundle.deliveryPackage?.status || 'draft',
      readiness: bundle.deliveryPackage?.readiness || 0,
      materialSources: bundle.stats.materialSources,
      fileCount: bundle.stats.files,
    }, null, 2),
  };

  bundle.files.forEach((file) => {
    files[`${root}/${normalizeWorkspacePath(file.path)}`] = String(file.content ?? '');
  });

  return files;
}

export function buildDeliveryBundleZipArchive(project, options = {}) {
  const bundle = buildDeliveryBundle(project, { prepare: options.prepare ?? true });
  return {
    bundle,
    files: zipFilesForBundle(bundle),
    archive: buildZipArchive(zipFilesForBundle(bundle), new Date(bundle.exportedAt)),
  };
}

export function downloadDeliveryBundleArchive(project, archive) {
  if (!project || !archive) return;
  downloadBlob(new Blob([archive], { type: 'application/zip' }), `gdpro-delivery-${slug(project.name)}-${Date.now()}.zip`);
}

export function exportDeliveryBundle(project) {
  if (!project) return;
  const { archive } = buildDeliveryBundleZipArchive(project, { prepare: true });
  downloadDeliveryBundleArchive(project, archive);
}
