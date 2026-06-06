import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Gauge,
  Loader2,
  LockKeyhole,
  PackageCheck,
  Palette,
  Plus,
  Route,
  Save,
  ShieldCheck,
  PenTool,
  Trash2,
  Type,
  Upload,
  Workflow,
  XCircle,
} from 'lucide-react';
import { buildDesignControlState } from '../lib/designControl';
import { createLockedBrandAssetManifest } from '../lib/brandAssetManifest';
import {
  addMaterialToProduction,
  createMaterialSpecDocument,
  MATERIAL_STATUSES,
  MATERIAL_TEMPLATES,
  updateMaterialStatus,
} from '../lib/materialProduction';
import { runPreflightReview } from '../lib/preflightReview';
import { createDeliveryPackage } from '../lib/deliveryPackage';
import { generateAllMaterialArtwork } from '../lib/materialArtwork';
import { auditMaterialArtwork } from '../lib/artworkQuality';
import { applyAgentOperations } from '../lib/agentOperations';
import { uiText } from '../lib/uiLanguage';
import { openclaw } from '../lib/api';
import { parseFile } from '../lib/parser';
import {
  assignBrandKitToProject,
  createBrandKitFromParsedFiles,
  loadBrandKitLibrary,
  removeBrandKit,
  upsertBrandKit,
} from '../lib/brandKitLibrary';

const RISK_STYLE = {
  critical: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
  high: 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  medium: 'text-gdpro-info bg-gdpro-info/10 border-gdpro-info/20',
  info: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  stable: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
};

const MATERIAL_STATUS_STYLE = {
  planned: 'text-gdpro-text-muted bg-gdpro-bg-surface border-gdpro-border',
  designing: 'text-gdpro-info bg-gdpro-info/10 border-gdpro-info/20',
  approved: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  exported: 'text-gdpro-accent bg-gdpro-accent/10 border-gdpro-accent/20',
};

const PREFLIGHT_STATUS_STYLE = {
  pass: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  'needs-fix': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  blocked: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
};

const DELIVERY_STATUS_STYLE = {
  ready: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  'needs-export': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  blocked: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
};

const SOURCE_QA_STATUS_STYLE = {
  pass: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  'needs-review': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  blocked: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
};

const OPERATION_STATUS_STYLE = {
  applied: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  skipped: 'text-gdpro-info bg-gdpro-info/10 border-gdpro-info/20',
  blocked: 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  rejected: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
  failed: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
};

const REPAIR_QUEUE_STATUS_STYLE = {
  clear: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  actionable: 'text-gdpro-info bg-gdpro-info/10 border-gdpro-info/20',
  'needs-review': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  blocked: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
};

const PARTNER_HANDOFF_STATUS_STYLE = {
  'ready-for-partner': 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  'waiting-for-partner': 'text-gdpro-info bg-gdpro-info/10 border-gdpro-info/20',
  'waiting-for-visual-key': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  'preview-only-review': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  'saved-for-review': 'text-gdpro-text-muted bg-gdpro-bg-surface border-gdpro-border',
};

const RISK_LABELS = {
  critical: '高风险',
  high: '需注意',
  medium: '可控',
  low: '稳定',
  info: '稳定',
};

const STATUS_LABELS = {
  ready: '已就绪',
  blocked: '需处理',
  stale: '需更新',
  draft: '草稿',
  pending: '待确认',
  approved: '已通过',
  signed: '已签收',
  partial: '部分完成',
  complete: '已完成',
  pass: '已通过',
  locked: '已锁定',
  clean: '正常',
  clear: '已清空',
  actionable: '可处理',
  'needs-fix': '需修复',
  'needs-export': '待导出',
  'needs-review': '需复核',
  'needs-run': '可处理',
  'needs-vector': '缺少矢量源稿',
  'needs-kit': '套件不完整',
  'ready-to-compile': '可锁定',
  'ready-to-lock': '可锁定',
  applied: '已处理',
  skipped: '已略过',
  rejected: '未通过',
  failed: '未完成',
  exported: '已导出',
  designing: '制作中',
  planned: '待制作',
  'pending-signoff': '待签收',
  'changes-requested': '需修改',
  'system-pass': '检查通过',
  changes_requested: '需修改',
  accepted_risk: '接受风险',
};

const CONTROL_TEXT_EN = {
  '品牌套件可用于交付': 'Brand kit ready for delivery',
  '需要补齐矢量源稿': 'Vector sources needed',
  '需要补齐品牌套件': 'Brand kit needs setup',
  '品牌套件有变更待同步': 'Brand kit changes need syncing',
  '品牌套件待整理': 'Brand kit needs setup',
  '已就绪': 'Ready',
  '需处理': 'Needs action',
  '需更新': 'Needs update',
  '草稿': 'Draft',
  '待确认': 'Pending',
  '已通过': 'Passed',
  '已签收': 'Signed',
  '部分完成': 'Partly complete',
  '已完成': 'Done',
  '已锁定': 'Locked',
  '正常': 'Clear',
  '已清空': 'Clear',
  '可处理': 'Actionable',
  '需修复': 'Needs fix',
  '待导出': 'To export',
  '需复核': 'Needs review',
  '缺少矢量源稿': 'Vector source missing',
  '套件不完整': 'Kit incomplete',
  '可锁定': 'Ready to lock',
  '已处理': 'Handled',
  '已略过': 'Skipped',
  '未通过': 'Not passed',
  '未完成': 'Unfinished',
  '已导出': 'Exported',
  '制作中': 'In progress',
  '待制作': 'To create',
  '待签收': 'To sign off',
  '需修改': 'Needs changes',
  '检查通过': 'Passed',
  '接受风险': 'Risk accepted',
  '缺少可编辑 Logo 源文件': 'Editable logo source missing',
  '品牌套件不能只存预览图，最终 VI 必须有 SVG/AI/EPS 等可复用标识源文件。': 'The brand kit needs reusable SVG, AI, or EPS logo sources, not only previews.',
  '上传或制作矢量 Logo 后再锁定品牌套件。': 'Add or create a vector logo before locking the brand kit.',
  '品牌套件尚未锁定': 'Brand kit is not locked',
  'Logo、颜色、字体或设计指导发生变化，后续物料需要重新绑定。': 'Logo, color, typography, or design guidance changed. Later materials need to be linked again.',
  '批量制作前需要把 Logo、颜色、字体和设计指导锁成同一份品牌资产清单。': 'Lock logo, color, typography, and design guidance into one brand asset list before batch production.',
  '在品牌资产节点锁定或重新锁定品牌资产清单。': 'Lock or refresh the brand asset list in Brand Assets.',
  '有物料没有绑定品牌套件': 'Some materials are not linked to the brand kit',
  '同步物料的品牌资产引用。': 'Sync brand asset links for the materials.',
  '有物料缺少矢量源稿': 'Some materials are missing vector sources',
  '制作可编辑矢量源稿，并通过源稿检查。': 'Create editable vector sources and pass the source check.',
  '交付格式缺少矢量目标': 'Vector delivery target missing',
  '为每个物料补齐可编辑矢量交付目标。': 'Add editable vector delivery targets for every material.',
  '先确认项目名称和品牌名称': 'Confirm the project and brand name first',
  '最终 VI 需要 SVG/AI/EPS 等可编辑标识源文件': 'Final VI delivery needs SVG, AI, EPS, or another editable logo source',
  '先锁定主色、辅助色和使用比例': 'Lock primary colors, supporting colors, and usage ratios',
  '先锁定标题字体和正文字体': 'Lock display and body typography',
  '已记录风格方向、禁忌和视觉语言': 'Style direction, limits, and visual language are recorded',
  '需要一份能约束后续创作的设计指导': 'Add design guidance that can constrain later work',
  '后续物料会引用同一份品牌资产清单': 'Later materials will reference one brand asset list',
  '开始批量物料前需要锁定品牌资产清单': 'Lock the brand asset list before batch production',
  '先创建客户会收到的交付物': 'Create at least one client-facing deliverable first',
  '最终交付物需要可编辑矢量源稿': 'Final deliverables need editable vector sources',
  '交付格式需要包含 SVG 或其他可编辑源文件': 'Delivery formats should include SVG or another editable source file',
  '品牌名称已明确': 'Brand name confirmed',
  '品牌名称': 'Brand name',
  '客户或品牌名称是所有 VI 判断的根身份。': 'The client or brand name anchors every VI decision.',
  '客户需求已记录': 'Client brief recorded',
  '客户需求': 'Client brief',
  '解读设计方向前，工作台需要一份书面需求。': 'A written brief is required before interpreting the design direction.',
  '设计哲学已记录': 'Design philosophy recorded',
  '视觉系统需要一条稳定的策略句或设计哲学文档。': 'The visual system needs a stable strategy line or design philosophy document.',
  '品牌色可用': 'Brand colors ready',
  '最终 VI 物料必须复用明确品牌色，不能让模型临场发明颜色。': 'Final VI materials must reuse locked brand colors.',
  '品牌字体可用': 'Brand typography ready',
  '扩展商用物料前，标题和正文字体必须明确。': 'Display and body typefaces must be clear before expanding commercial materials.',
  '主 Logo 源稿已选定': 'Primary logo source selected',
  '主 Logo 源稿': 'Primary logo source',
  '工作台必须复用已采纳主 Logo，不能每个物料重新绘制。': 'The workspace must reuse the adopted primary logo instead of redrawing it per material.',
  '需求目标物料已识别': 'Target materials identified',
  '目标物料': 'Target materials',
  '约定书需要知道本项目要优化哪些商用物料。': 'The contract needs to know which commercial materials this project will optimize.',
  '目标物料已有生产单': 'Target materials have production sheets',
  '已识别的目标物料都有生产单。': 'Identified target materials already have production sheets.',
  '需求约定书已锁定': 'Brief contract locked',
  '需求约定书存在阻断': 'Brief contract has blockers',
  '约定书当前版本已经锁定，可作为后续生成和交付检查的输入。': 'This contract version is locked and can guide generation and delivery checks.',
  '仍有必填项缺失，暂时不能作为稳定生成依据。': 'Required fields are still missing, so this cannot be used as stable generation input yet.',
  '品牌名片': 'Brand business card',
  'A3 海报': 'A3 poster',
  '社媒方图': 'Social square',
  '包装标签': 'Packaging label',
  '门店招牌': 'Storefront sign',
  '主 Logo': 'Primary logo',
  '标题字体': 'Display typeface',
  '正文字体': 'Body typeface',
  '设计哲学': 'Design philosophy',
  '视觉系统': 'Visual system',
  '主品牌色': 'Primary brand color',
  '品牌色': 'Brand colors',
  '品牌字体': 'Brand typography',
  '设计策略': 'Design strategy',
  '产品素材': 'Product asset',
  '场景素材': 'Scene asset',
  '交付物': 'Deliverable',
  '品牌资产引用完整': 'Brand asset links complete',
  '导出目标已设定': 'Export targets set',
  '可编辑矢量交付已设定': 'Editable vector delivery set',
  '可编辑矢量源稿已制作': 'Editable vector source created',
  '已有源稿': 'Source ready',
  '待制作源稿': 'Source pending',
  '等待制作矢量源稿': 'Waiting for editable vector source',
  '还没有可编辑源稿': 'No editable source yet',
  '制作源稿': 'Create sources',
  '下载矢量源稿': 'Download vector source',
  '切换物料状态': 'Change material status',
  '生产阻断': 'Production blockers',
  '品牌资产引用': 'Brand asset links',
  '源稿检查': 'Source check',
  '源稿': 'Source',
  '未设定': 'Not set',
  '物料': 'Material',
  '尚未创建物料生产单': 'No production sheets yet',
  '物料生产计划必须引用已锁定的品牌资产清单。': 'Material production must reference a locked brand asset list.',
  '至少创建一个带尺寸、导出目标和品牌资产引用的物料。': 'Create at least one material with size, export targets, and brand links.',
  '补齐物料生产单、品牌资产引用、尺寸或导出目标。': 'Complete production sheets, brand links, sizes, or export targets.',
  '商用交付需要可编辑的矢量源稿，不能只有物料状态记录。': 'Commercial delivery needs editable vector sources, not only status records.',
  '从物料生产清单重新制作源稿。': 'Rebuild the source from the material production list.',
  '当前源文件不是完整的 SVG 文档。': 'The current source file is not a complete SVG document.',
  '重新制作矢量源稿。': 'Rebuild the vector source.',
  '源稿缺少可追溯的物料信息，后续无法可靠审查。': 'The source file lacks traceable material metadata.',
  '通过物料源稿工具重新制作。': 'Rebuild it with the material source tool.',
  'SVG 宽高与物料生产尺寸不一致。': 'SVG width and height do not match the material size.',
  '按当前物料尺寸重新制作。': 'Rebuild it to the current material size.',
  'SVG 画布比例与物料尺寸不一致，可能导致缩放或裁切偏移。': 'SVG canvas ratio does not match the material size.',
  '重新制作或修正画布比例。': 'Rebuild it or correct the canvas ratio.',
  '一个或多个物料引用已缺失，或不再属于当前品牌资产清单。': 'One or more material references are missing or no longer belong to the current brand asset list.',
  '锁定当前品牌资产后刷新物料引用。': 'Lock current brand assets and refresh material links.',
  'SVG 没有记录全部必需品牌资产引用，无法审查复用一致性。': 'SVG does not record all required brand asset links.',
  '重新制作源稿，让品牌资产引用写入源文件。': 'Rebuild the source so brand links are written into it.',
  '源稿版本过期，或缺少品牌资产清单版本记录。': 'Source version is outdated or missing brand asset list version.',
  '锁定最新品牌资产后重新制作。': 'Lock the latest brand assets and rebuild.',
  'SVG 元数据没有写入当前品牌资产版本。': 'SVG metadata does not include the current brand asset version.',
  '重新制作带版本记录的源稿。': 'Rebuild the source with version metadata.',
  'SVG 中的脚本或事件处理不适合客户交付包。': 'Scripts or event handlers in SVG are not suitable for client delivery.',
  '移除脚本内容，或重新制作安全源稿。': 'Remove scripts or rebuild a safe source file.',
  '远程图片或字体会让源稿不可独立交付。': 'Remote images or fonts make the source file unsuitable for standalone delivery.',
  '交付前嵌入或替换外部依赖。': 'Embed or replace external dependencies before delivery.',
  'SVG 源稿过小或过大，可能不完整或过度膨胀。': 'SVG source size is unusually small or large.',
  '检查源稿，必要时重新制作。': 'Check the source and rebuild if needed.',
  '项目工作台数据': 'Project workspace data',
  'VI 物料生产规格': 'VI material production spec',
  '交付前审查报告': 'Final review report',
  'VI 规范手册': 'VI guide',
  '客户维护说明': 'Client maintenance notes',
  '交付文件清单': 'Delivery file list',
  '客户交付与维护说明': 'Client delivery and maintenance notes',
  '交付物文件清单': 'Deliverable file list',
  '交付包不能只依赖状态字段，必须包含可审查、可编辑的矢量源文件。': 'The package needs reviewable, editable vector source files.',
  '制作物料源稿后再导出并归档。': 'Create material sources before export and archive.',
  '当前物料还没有完成最终导出，不能作为客户交付文件。': 'This material has not been finally exported yet.',
  '完成排版和导出后，将物料状态切换为已导出。': 'After layout and export, mark the material as exported.',
  '最终交付不能只包含 PNG/JPG 等位图预览，必须包含 SVG、AI、EPS 或其他可编辑源文件。': 'Final delivery cannot be bitmap previews only; include SVG, AI, EPS, or another editable source.',
  '为这项物料加入可编辑 SVG 或其他可编辑矢量文件目标。': 'Add editable SVG or another editable vector target for this material.',
  '交付包需要完整的规范、交接说明和文件归档清单。': 'The package needs complete guidelines, handoff notes, and file archive checklist.',
  '点击整理交付包，或由工作台整理对应文档。': 'Prepare the package or let the workspace create the matching documents.',
  '交付清单存在未就绪项目': 'Delivery checklist has unfinished items',
  '补齐文档、导出文件或项目数据后重新整理交付包。': 'Complete documents, exports, or project data, then rebuild the package.',
  '缺少 VI 物料生产规格': 'VI material production spec missing',
  '审查需要可追溯的尺寸、导出目标、品牌资产引用和状态记录。': 'Review needs traceable size, export target, brand links, and status records.',
  '通过物料清单整理或刷新物料规格文档。': 'Refresh the material spec from the material list.',
  '字体授权未记录': 'Font license not recorded',
  '当前项目有品牌字体规范，但没有授权来源、授权范围或替代字体说明。': 'The project has brand typography but no license source, usage scope, or fallback notes.',
  '记录商用授权、开源许可或替代字体策略。': 'Record commercial license, open-source license, or fallback strategy.',
  '存在已采纳概念图': 'Adopted concept images exist',
  '概念图可作为方向或 mockup，但最终生产应转成确定性源资产并记录授权/来源。': 'Concept images can guide direction, but final production should use deterministic source assets with license/source notes.',
  '将核心视觉转为矢量/源文件，或在审查报告中标注使用边界。': 'Convert key visuals into vectors/source files, or record usage limits in the review.',
  '创建第一项生产物料': 'Create first production material',
  '商用交付至少需要一张包含尺寸、渠道、导出目标和品牌资产引用的物料生产单。': 'Commercial delivery needs at least one production sheet with size, channel, export targets, and brand links.',
  '添加名片': 'Add business card',
  '刷新引用': 'Refresh links',
  '批准进入审查': 'Approve for review',
  '标记导出': 'Mark exported',
  '刷新物料生产规格': 'Refresh material production spec',
  '交付前检查和交付包需要记录尺寸、品牌引用、源稿路径和源稿检查状态的物料规格文档。': 'Final checks and delivery package need a material spec with size, brand links, source path, and source-check status.',
  '刷新规格': 'Refresh spec',
  '运行交付前检查': 'Run final checks',
  '物料源稿和生产字段就绪后，整理商用审查报告。': 'After material sources and production fields are ready, prepare the commercial review report.',
  '运行检查': 'Run check',
  '修复后重新检查交付': 'Recheck delivery after fixes',
  '交付前检查仍有阻断项，完成上游物料修复后需要再运行一次。': 'Final checks still have blockers; run them again after upstream fixes.',
  '重新检查': 'Recheck',
  '整理交付包文档': 'Prepare delivery package documents',
  '整理交付包': 'Prepare package',
  '推进到交付阶段': 'Move to delivery phase',
  '所有交付关卡已通过，项目可以进入交付阶段。': 'All delivery gates have passed; the project can move to delivery.',
  '推进阶段': 'Move phase',
  '重新锁定需求约定书': 'Relock brief contract',
  '锁定需求约定书': 'Lock brief contract',
  '需求、品牌规范和目标物料已可锁定成工作台可读取的约定。': 'The brief, brand rules, and target materials can now be locked as a readable contract.',
  '锁定约定': 'Lock brief',
  '需求约定书识别到这项商用物料，但目前还没有生产单。': 'The brief identified this commercial material, but it has no production sheet yet.',
  '扩展商用物料套组': 'Expand commercial material set',
  '设计评分需要多个物料类型来验证跨物料 VI 一致性。': 'Quality scoring needs multiple material types to verify cross-material VI consistency.',
  '修复设计评分阻断项': 'Fix quality score blockers',
  '当前评分低于商用签收线。': 'Current score is below the commercial sign-off line.',
  '选择或创建项目': 'Select or create a project',
  '修复清单需要先选中一个项目。': 'Select a project before using the fix list.',
  '重新锁定品牌资产清单': 'Relock brand asset list',
  '锁定品牌资产清单': 'Lock brand asset list',
  '当前品牌规范已经可用于生产，但尚未锁定给下游物料复用。': 'Current brand rules are production-ready but not locked for downstream reuse.',
  '可生产的品牌资产': 'production-ready brand assets',
  '锁定清单': 'Lock list',
  '运行修复': 'Run fix',
  '查看影响': 'View impact',
  '可复用品牌资产已锁定，可进入生产。': 'Reusable brand assets are locked and ready for production.',
  '进入商用评审前必须先锁定品牌资产清单。': 'Lock the brand asset list before commercial review.',
  '可编辑源稿已通过所有阻断检查。': 'Editable source has passed all blocking checks.',
  '源稿检查仍有阻断问题。': 'Source checks still have blockers.',
  '最终交付前，需要人工或指定评审人确认该物料设计。': 'Before final delivery, a reviewer must approve this material design.',
  '源稿检查通过前，不能签收该物料设计。': 'This material cannot be signed off until the source check passes.',
  '交付前检查已无严重或高风险问题，并已整理审查报告。': 'Final checks have no critical or high-risk issues, and the review report is ready.',
  '修复严重/高风险问题并整理审查报告后，才能签收。': 'Fix critical and high-risk issues and prepare the review report before sign-off.',
  '交付包已就绪，需要最终发布确认。': 'The delivery package is ready and needs final release approval.',
  '交付包就绪前，最终交付签收会被阻断。': 'Final delivery sign-off is blocked until the package is ready.',
  '严重': 'Critical',
  '高': 'High',
  '中': 'Medium',
  '高风险': 'High risk',
  '高优先级': 'High priority',
  '中优先级': 'Medium priority',
  '待处理': 'Pending',
  '品牌一致性': 'Brand consistency',
  '生产精度': 'Production precision',
  '跨物料系统': 'Cross-material system',
  '商用交付准备': 'Commercial readiness',
  '工作台治理': 'Studio governance',
  '品牌资产清单已过期': 'Brand asset list is outdated',
  '品牌资产清单未锁定': 'Brand asset list is not locked',
  '商用 VI 生产必须复用已锁定的品牌资产清单。': 'Commercial VI production must reuse the locked brand asset list.',
  '生产评审前先锁定或刷新品牌资产清单。': 'Lock or refresh the brand asset list before production review.',
  '需求约定书已过期': 'Brief contract is outdated',
  '需求约定书未锁定': 'Brief contract is not locked',
  '需求目标物料缺少生产单': 'Brief targets are missing production sheets',
  '为需求中识别出的目标物料添加生产单。': 'Add production sheets for the target materials identified in the brief.',
  '还没有物料生产单': 'No material production sheet yet',
  '至少需要一个物料才能验证 VI 一致性。': 'At least one material is needed to verify VI consistency.',
  '基于已锁定的品牌资产创建物料生产单。': 'Create production sheets from the locked brand assets.',
  '源稿检查仍有未解决问题': 'Source checks still have open issues',
  '重新制作或修复矢量源稿，并再次运行源稿检查。': 'Rebuild or fix vector source files, then run the source check again.',
  '交付前检查仍有阻断问题': 'Final checks still have blockers',
  '商用签收前修复问题，或明确记录已接受的风险。': 'Fix the issue before commercial sign-off, or explicitly record the accepted risk.',
  '交付包尚未就绪': 'Delivery package is not ready',
  '交付包必须引用稳定的品牌资产清单。': 'The delivery package must reference a stable brand asset list.',
  '没有可交付物料': 'No deliverable materials yet',
  '交付包至少需要一个物料生产单。': 'The package needs at least one material production sheet.',
  '在物料清单中创建并完成物料。': 'Create and complete materials in the material list.',
  '交付前审查未通过或缺少审查报告': 'Final review has not passed or is missing',
  '正式交付前必须有无严重/高风险阻断的审查报告。': 'Commercial delivery needs a review report with no critical or high-risk blockers.',
  '运行交付前检查并修复阻断项。': 'Run final checks and fix blockers.',
  '回到品牌资产区重新锁定清单。': 'Return to Brand Assets and relock the list.',
  '需要整理交付包文档': 'Delivery package documents need preparation',
  '请基于已审查状态整理 VI 手册、维护说明和交付清单。': 'Prepare the VI guide, maintenance notes, and delivery checklist from the reviewed state.',
  '设计总监评分阻断签收': 'Quality score blocks sign-off',
  '补齐维护说明、源资产、成品导出和交付清单。': 'Add maintenance notes, source assets, exports, and the delivery checklist.',
  '优先修复该维度中未通过的检查项。': 'Fix the failed checks in this dimension first.',
  '设计总监评分低于签收线': 'Quality score is below sign-off line',
  '申请签收前先解决最高风险问题。': 'Resolve the highest-risk issues before requesting sign-off.',
  '生产影响范围': 'Production impact',
  '下游产物': 'Downstream work',
  '项目': 'Project',
  '物料源稿': 'Material source',
  '物料清单': 'Material list',
  '物料规格': 'Material spec',
  '交付前检查': 'Final check',
  '交付包': 'Delivery package',
  '签收看板': 'Sign-off board',
  '设计评分': 'Quality score',
  '交付阶段': 'Delivery phase',
  '品牌资产清单已锁定': 'Brand asset list locked',
  '设计总监评分': 'Quality score',
  '交付前审查签收': 'Final check sign-off',
  '最终交付签收': 'Final delivery sign-off',
  '评审人': 'Reviewer',
  '影响修复已处理': 'Impact fixes handled',
  '下游产物正常': 'Downstream work is clear',
  '当前没有检测到下游失效或待修复影响。': 'No downstream failure or repair impact is detected.',
  '处理影响修复': 'Handle impact fixes',
  '检查评分': 'Check score',
  '批准下一项': 'Approve next item',
  '批准': 'Approve',
  '手动': 'Manual',
  '概念探索': 'Concept exploration',
  '只做调研、访谈、品牌定义和设计哲学，不制作最终视觉。': 'Research, interviews, brand definition, and design philosophy only; no final visuals yet.',
  '可用图像服务探索方向，但输出必须经过人工选择和品牌锁定。': 'Use image services to explore direction; outputs still need human selection and brand locking.',
  '探索方向后沉淀为可复用 Logo 主资产和辅助图形资产。': 'Turn explored directions into reusable primary logo and supporting graphic assets.',
  '基于锁定资产批量扩展物料，所有跨物料元素必须复用同一套品牌规则和源资产。': 'Expand materials from locked assets; every cross-material element must reuse the same brand rules and source assets.',
  '归档源文件、成品文件、VI 手册和维护说明，形成可交付包。': 'Archive source files, finished exports, the VI guide, and maintenance notes into a delivery package.',
  '项目需求': 'Project brief',
  '品牌资产清单': 'Brand asset list',
  'Logo 源稿': 'Logo source',
  '方案草图': 'Direction drafts',
  '设计评审': 'Design review',
  '交付源文件': 'Deliverable source files',
  '审查记录': 'Review record',
  '交付清单': 'Delivery checklist',
  '维护说明': 'Maintenance notes',
  'VI 手册': 'VI guide',
};

function controlText(copy, value) {
  if (value == null || copy?.locale !== 'en') return value;
  const text = String(value);
  const plain = text.replace(/[。.]$/, '');
  if (CONTROL_TEXT_EN[text]) return CONTROL_TEXT_EN[text];
  if (CONTROL_TEXT_EN[plain]) return CONTROL_TEXT_EN[plain];
  const countVectorLogo = text.match(/^(\d+)\s*个可复用矢量标识$/);
  if (countVectorLogo) return `${countVectorLogo[1]} reusable vector logos`;
  const countColor = text.match(/^(\d+)\s*个品牌色$/);
  if (countColor) return `${countColor[1]} brand colors`;
  const countType = text.match(/^(\d+)\s*个品牌字体$/);
  if (countType) return `${countType[1]} brand typefaces`;
  const materialLinks = text.match(/^(\d+)\/(\d+)\s*个物料已绑定品牌套件$/);
  if (materialLinks) return `${materialLinks[1]}/${materialLinks[2]} materials linked to brand kit`;
  const sourceReady = text.match(/^(\d+)\/(\d+)\s*个物料已有可编辑矢量源稿$/);
  if (sourceReady) return `${sourceReady[1]}/${sourceReady[2]} materials have editable vector sources`;
  const exportTargets = text.match(/^(\d+)\/(\d+)\s*个物料包含矢量\/可编辑导出目标$/);
  if (exportTargets) return `${exportTargets[1]}/${exportTargets[2]} materials include vector or editable export targets`;
  const missingRefs = text.match(/^(\d+)\s*个物料缺少 Logo、颜色或字体引用，后续容易出现风格漂移。?$/);
  if (missingRefs) return `${missingRefs[1]} materials are missing logo, color, or typography links, which can cause visual drift.`;
  const missingSources = text.match(/^(\d+)\s*个物料还不能作为可交付源文件，只能视为待制作状态。?$/);
  if (missingSources) return `${missingSources[1]} materials are not deliverable source files yet.`;
  const missingTargets = text.match(/^(\d+)\s*个物料没有标注 SVG、AI、EPS 或可编辑源文件目标。?$/);
  if (missingTargets) return `${missingTargets[1]} materials do not list SVG, AI, EPS, or editable source targets.`;
  const missingProduction = text.match(/^缺少生产单[:：](.+)$/);
  if (missingProduction) return `Missing production sheets: ${missingProduction[1].replace(/、/g, ', ')}`;
  const missingList = text.match(/^缺少[:：](.+)。?$/);
  if (missingList) return `Missing: ${missingList[1].split(/[、，,]\s*/).map((part) => controlText(copy, part.trim())).join(', ')}.`;
  const sourcePassed = text.match(/^(\d+)\/(\d+)\s*个物料源稿已通过检查。?$/);
  if (sourcePassed) return `${sourcePassed[1]}/${sourcePassed[2]} material source files passed checks.`;
  const severeIssues = text.match(/^仍有\s*(\d+)\s*个严重问题和\s*(\d+)\s*个高风险问题。?$/);
  if (severeIssues) return `${severeIssues[1]} critical issues and ${severeIssues[2]} high-risk issues remain.`;
  const scoreLine = text.match(/^当前评分\s*(\d+)\/100；签收线为\s*(\d+)\/100。?$/);
  if (scoreLine) return `Current score ${scoreLine[1]}/100; sign-off line ${scoreLine[2]}/100.`;
  const reviewScoreLine = text.match(/^评分\s*(\d+)\/100（(.+)）低于\s*(\d+)\/100\s*签收线，或仍有阻断问题。?$/);
  if (reviewScoreLine) return `Score ${reviewScoreLine[1]}/100 (${reviewScoreLine[2]}) is below the ${reviewScoreLine[3]}/100 sign-off line, or blockers remain.`;
  const reviewScorePass = text.match(/^评分\s*(\d+)\/100（(.+)）已达到商用签收线。?$/);
  if (reviewScorePass) return `Score ${reviewScorePass[1]}/100 (${reviewScorePass[2]}) meets the commercial sign-off line.`;
  const dimensionLow = text.match(/^(.+)低于商用目标$/);
  if (dimensionLow) return `${controlText(copy, dimensionLow[1])} is below the commercial target`;
  const dimensionScore = text.match(/^(.+)当前为\s*(\d+)\/100。?$/);
  if (dimensionScore) return `${controlText(copy, dimensionScore[1])} is currently ${dimensionScore[2]}/100.`;
  const missingTargetMaterial = text.match(/^缺少需求物料[:：](.+)$/);
  if (missingTargetMaterial) return `Missing requested material: ${controlText(copy, missingTargetMaterial[1])}`;
  const materialBrandRefresh = text.match(/^(.+)\s+品牌资产引用需要刷新$/);
  if (materialBrandRefresh) return `${controlText(copy, materialBrandRefresh[1])} brand links need refresh`;
  const repairRefreshRefs = text.match(/^刷新\s+(.+)\s+的品牌资产引用$/);
  if (repairRefreshRefs) return `Refresh ${controlText(copy, repairRefreshRefs[1])} brand links`;
  const missingRoleRefs = text.match(/^缺少引用[:：](.+)。?$/);
  if (missingRoleRefs) return `Missing links: ${missingRoleRefs[1].split(/[、，,]\s*/).map((part) => controlText(copy, part.trim())).join(', ')}.`;
  const materialSourceRefresh = text.match(/^(.+)\s+源稿需要重新制作$/);
  if (materialSourceRefresh) return `${controlText(copy, materialSourceRefresh[1])} source file needs rebuilding`;
  const repairSourceRefresh = text.match(/^重新制作\s+(.+)\s+源稿$/);
  if (repairSourceRefresh) return `Rebuild ${controlText(copy, repairSourceRefresh[1])} source`;
  const approveReview = text.match(/^批准\s+(.+)\s+进入审查$/);
  if (approveReview) return `Approve ${controlText(copy, approveReview[1])} for review`;
  const markExported = text.match(/^标记\s+(.+)\s+已导出$/);
  if (markExported) return `Mark ${controlText(copy, markExported[1])} exported`;
  const addRequestedMaterial = text.match(/^添加需求中的物料[:：](.+)$/);
  if (addRequestedMaterial) return `Add requested material: ${controlText(copy, addRequestedMaterial[1])}`;
  const materialApproval = text.match(/^(.+)\s+等待设计批准$/);
  if (materialApproval) return `${controlText(copy, materialApproval[1])} awaits design approval`;
  const materialExport = text.match(/^(.+)\s+等待导出确认$/);
  if (materialExport) return `${controlText(copy, materialExport[1])} awaits export confirmation`;
  const materialNotReady = text.match(/^(.+)\s+未达到生产就绪$/);
  if (materialNotReady) return `${controlText(copy, materialNotReady[1])} is not production-ready`;
  const sourceFailed = text.match(/^(.+)\s+源稿检查未通过$/);
  if (sourceFailed) return `${controlText(copy, sourceFailed[1])} source check did not pass`;
  const notExported = text.match(/^(.+)\s+尚未导出$/);
  if (notExported) return `${controlText(copy, notExported[1])} has not been exported`;
  const missingVectorTarget = text.match(/^(.+)\s+缺少可编辑矢量交付目标$/);
  if (missingVectorTarget) return `${controlText(copy, missingVectorTarget[1])} is missing an editable vector delivery target`;
  const missingDoc = text.match(/^缺少\s+(.+)$/);
  if (missingDoc) return `Missing ${controlText(copy, missingDoc[1])}`;
  const preflightSourceCheck = text.match(/^(.+)\s+源稿检查[:：](.+)$/);
  if (preflightSourceCheck) return `${controlText(copy, preflightSourceCheck[1])} source check: ${controlText(copy, preflightSourceCheck[2])}`;
  const preflightApproval = text.match(/^(.+)\s+尚未进入审查通过状态$/);
  if (preflightApproval) return `${controlText(copy, preflightApproval[1])} has not passed review yet`;
  const bleedIssue = text.match(/^(.+)\s+印刷出血设置不足$/);
  if (bleedIssue) return `${controlText(copy, bleedIssue[1])} needs print bleed setup`;
  const colorModeIssue = text.match(/^(.+)\s+色彩模式不是 CMYK$/);
  if (colorModeIssue) return `${controlText(copy, colorModeIssue[1])} is not in CMYK`;
  const exportTargetIssue = text.match(/^(.+)\s+缺少导出目标$/);
  if (exportTargetIssue) return `${controlText(copy, exportTargetIssue[1])} is missing export targets`;
  const currentBleed = text.match(/^当前出血为\s*(.+)。?$/);
  if (currentBleed) return `Current bleed: ${controlText(copy, currentBleed[1])}.`;
  const currentColor = text.match(/^当前色彩模式为\s*(.+)。?$/);
  if (currentColor) return `Current color mode: ${controlText(copy, currentColor[1])}.`;
  const currentTargets = text.match(/^当前导出目标为\s*(.+)，不能只交付位图预览。?$/);
  if (currentTargets) return `Current export targets: ${currentTargets[1].replace(/、/g, ', ')}. Bitmap previews alone are not deliverable.`;
  const sizeLabel = text.match(/^尺寸\s+(.+)$/);
  if (sizeLabel) return `Size ${sizeLabel[1]}`;
  const colorModeLabel = text.match(/^色彩模式\s+(.+)$/);
  if (colorModeLabel) return `Color mode ${controlText(copy, colorModeLabel[1])}`;
  const sourceQaLabel = text.match(/^源稿检查\s+(.+)$/);
  if (sourceQaLabel) return `Source check ${sourceQaLabel[1]}`;
  const sourceCheck = text.match(/^(.+)\s+源稿检查$/);
  if (sourceCheck) return `${controlText(copy, sourceCheck[1])} source check`;
  const designSignoff = text.match(/^(.+)\s+设计签收$/);
  if (designSignoff) return `${controlText(copy, designSignoff[1])} design sign-off`;
  if (/[\u4e00-\u9fff]/.test(text) && /[、，,]/.test(text)) {
    const parts = text.split(/[、，,]\s*/).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) {
      const translated = parts.map((part) => controlText(copy, part)).join(', ');
      if (translated !== text) return translated;
    }
  }
  return text;
}

function panelText(copy, group, key, fallback) {
  return copy?.panels?.[group]?.[key] || fallback;
}

function controlStatus(copy, status) {
  return controlText(copy, friendlyStatus(status));
}

function friendlyStatus(status) {
  return STATUS_LABELS[status] || status || '待确认';
}

function severityLabel(severity) {
  if (severity === 'critical') return '严重';
  if (severity === 'high') return '高';
  if (severity === 'medium') return '中';
  return severity;
}

function priorityLabel(priority) {
  if (priority === 'critical') return '严重';
  if (priority === 'high') return '高优先级';
  if (priority === 'medium') return '中优先级';
  return '待处理';
}

function outputKeyLabel(key) {
  const labels = {
    'documents.brief': '项目需求',
    'documents.philosophy': '设计理念',
    'brandKit.colors': '品牌色',
    'brandKit.typography': '品牌字体',
    'assets.logo': 'Logo 源稿',
    'assets.draft': '方案草图',
    assetManifest: '品牌资产清单',
    materialProduction: '物料生产清单',
    'documents.critique': '设计评审',
    'documents.materialSpec': '物料规格',
    'assets.deliverable': '交付源文件',
    preflightReview: '交付前检查',
    'documents.audit': '审查记录',
    deliveryPackage: '交付包',
    'documents.deliveryManifest': '交付清单',
    'documents.handoff': '维护说明',
    'documents.viManual': 'VI 手册',
  };
  return labels[key] || key;
}

function artifactLabel(artifact) {
  if (!artifact) return '下游产物';
  if (String(artifact).startsWith('material:')) return '物料源稿';
  const labels = {
    project: '项目',
    'brief-contract': '需求约定书',
    'asset-manifest': '品牌资产清单',
    'material-plan': '物料清单',
    'material-source': '物料源稿',
    'material-spec': '物料规格',
    'preflight-review': '交付前检查',
    'delivery-package': '交付包',
    'review-board': '签收看板',
    'design-scorecard': '设计评分',
    'phase-6': '交付阶段',
  };
  return labels[artifact] || artifact;
}

function reviewEvidenceLabel(evidence) {
  if (!evidence) return '签收依据';
  if (evidence.includes('assetManifest')) return '品牌资产清单';
  if (evidence.includes('designScorecard')) return '设计评分';
  if (evidence.includes('materialProduction')) return '物料生产记录';
  if (evidence.includes('preflightReview')) return '交付前检查';
  if (evidence.includes('deliveryPackage')) return '交付包';
  return evidence;
}

function assetRoleLabel(role) {
  const labels = {
    'primary-logo': '主 Logo',
    'primary-color-token': '主品牌色',
    'color-token': '品牌色',
    'display-font-token': '标题字体',
    'body-font-token': '正文字体',
    'strategy-token': '设计策略',
    logo: 'Logo',
    draft: '方案稿',
    product: '产品素材',
    scene: '场景素材',
    deliverable: '交付物',
  };
  return labels[role] || role || '品牌资产';
}


const REVIEW_BOARD_STATUS_STYLE = {
  signed: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  'pending-signoff': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  'changes-requested': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  blocked: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
};

const SCORECARD_STATUS_STYLE = {
  ready: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  'needs-fix': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  blocked: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
};

const BRIEF_CONTRACT_STATUS_STYLE = {
  locked: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  'ready-to-compile': 'text-gdpro-info bg-gdpro-info/10 border-gdpro-info/20',
  stale: 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  blocked: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
};

const IMPACT_STATUS_STYLE = {
  clean: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  actionable: 'text-gdpro-info bg-gdpro-info/10 border-gdpro-info/20',
  'needs-review': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  blocked: 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
};

const BRAND_KIT_STATUS_STYLE = {
  locked: 'text-gdpro-success bg-gdpro-success/10 border-gdpro-success/20',
  'needs-vector': 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  'needs-kit': 'text-gdpro-danger bg-gdpro-danger/10 border-gdpro-danger/20',
  stale: 'text-gdpro-warning bg-gdpro-warning/10 border-gdpro-warning/20',
  draft: 'text-gdpro-text-muted bg-gdpro-bg-surface border-gdpro-border',
};

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

function Section({ title, icon: Icon, children, action }) {
  return (
    <section className="py-4 border-b border-gdpro-border/80">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gdpro-text-muted">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, tone = 'default' }) {
  const toneClass = tone === 'danger'
    ? 'text-gdpro-danger'
    : tone === 'success'
      ? 'text-gdpro-success'
      : tone === 'warning'
        ? 'text-gdpro-warning'
        : 'text-gdpro-text';

  return (
    <div className="min-w-0 border border-gdpro-border bg-gdpro-bg-elevated rounded-lg px-3 py-2">
      <div className={`text-[20px] font-semibold leading-none tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[10px] text-gdpro-text-muted mt-1 truncate">{label}</div>
    </div>
  );
}

function formatHandoffTime(value, locale) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '-';
  }
}

function PartnerHandoffPanel({ project, task, report, receipt, onProjectUpdate, onAction, copy }) {
  const [handoffState, setHandoffState] = useState({ state: 'idle', message: '' });
  const [queueState, setQueueState] = useState({ state: 'idle', tasks: [], receipts: [] });
  const [workState, setWorkState] = useState({ state: 'idle', message: '' });
  const handoffCopy = copy.panels?.partnerHandoff || {};
  const storedQueue = Array.isArray(project?.control?.workflowRunPartnerTaskQueue)
    ? project.control.workflowRunPartnerTaskQueue
    : [];
  const visibleTasks = (queueState.tasks.length ? queueState.tasks.map((item) => item.task).filter(Boolean) : storedQueue)
    .filter(Boolean)
    .slice(0, 4);
  const taskPath = task?.primaryPath || report?.partnerTaskPath || '';
  const queueStatus = task?.queueStatus || report?.partnerTaskStatus || 'saved-for-review';
  const workStatus = workState.workStatus || task?.localConsole?.workStatus || 'saved';
  const nextAction = task?.nextAction || '';
  const statusLabel = handoffCopy.statuses?.[queueStatus] || controlStatus(copy, queueStatus);
  const workStatusLabel = handoffCopy.workStatuses?.[workStatus] || handoffCopy.workStatuses?.saved || '';
  const nextActionLabel = handoffCopy.nextActions?.[nextAction] || handoffCopy.nextActions?.default || controlText(copy, nextAction || '');
  const statusStyle = PARTNER_HANDOFF_STATUS_STYLE[queueStatus] || PARTNER_HANDOFF_STATUS_STYLE['saved-for-review'];
  const hasTask = Boolean(taskPath || task?.id);
  const message = handoffState.message || (receipt?.receiptPath ? handoffCopy.receiptSaved : '');

  useEffect(() => {
    setHandoffState({ state: 'idle', message: '' });
    setWorkState({ state: 'idle', message: '', workStatus: task?.localConsole?.workStatus || 'saved' });
  }, [task?.id, taskPath]);

  useEffect(() => {
    setQueueState({ state: 'idle', tasks: [], receipts: [] });
  }, [project?.id]);

  const recordReceipt = (receiptRecord) => {
    if (!project?.id || !onProjectUpdate) return;
    onProjectUpdate(project.id, (prev) => ({
      ...prev,
      control: {
        ...(prev.control || {}),
        workflowRunPartnerTaskReceipt: receiptRecord,
        events: [
          createGuiEvent(handoffCopy.eventLabel, 'partner_handoff_requested'),
          ...((prev.control || {}).events || []),
        ].slice(0, 40),
      },
      updatedAt: Date.now(),
    }));
  };

  const recordWorkStatus = (statusRecord, updatedTask = null) => {
    if (!project?.id || !onProjectUpdate) return;
    onProjectUpdate(project.id, (prev) => {
      const currentQueue = Array.isArray(prev.control?.workflowRunPartnerTaskQueue)
        ? prev.control.workflowRunPartnerTaskQueue
        : [];
      const nextTask = updatedTask || {
        ...(prev.control?.workflowRunPartnerTask || task || {}),
        localConsole: {
          ...((prev.control?.workflowRunPartnerTask || task || {}).localConsole || {}),
          workStatus: statusRecord.status,
          statusUpdatedAt: statusRecord.updatedAt,
          statusNote: statusRecord.note || '',
        },
      };
      const nextQueue = currentQueue.map((item) => (
        item?.id === nextTask?.id
          ? { ...item, localConsole: nextTask.localConsole }
          : item
      ));
      return {
        ...prev,
        control: {
          ...(prev.control || {}),
          workflowRunPartnerTask: nextTask,
          workflowRunPartnerTaskQueue: nextQueue.length ? nextQueue : currentQueue,
          workflowRunPartnerTaskWorkStatus: statusRecord,
          events: [
            createGuiEvent(handoffCopy.workEventLabel(statusRecord.label), 'partner_handoff_status'),
            ...((prev.control || {}).events || []),
          ].slice(0, 40),
        },
        updatedAt: Date.now(),
      };
    });
  };

  const requestPartner = async () => {
    if (!hasTask) return;
    setHandoffState({ state: 'checking', message: handoffCopy.checking });
    try {
      const result = await openclaw.claimPartnerHandoffTask({
        projectId: project?.id,
        path: taskPath,
      });
      const receiptRecord = {
        requestedAt: Date.now(),
        status: result?.exists ? 'sent' : 'saved',
        taskPath,
        receiptPath: result?.receiptPath || '',
      };
      recordReceipt(receiptRecord);
      setHandoffState({
        state: result?.exists ? 'ready' : 'saved',
        message: result?.exists ? handoffCopy.ready : handoffCopy.saved,
      });
    } catch (err) {
      console.warn('[Partner Handoff] Request failed:', err);
      recordReceipt({
        requestedAt: Date.now(),
        status: 'saved',
        taskPath,
        receiptPath: '',
      });
      setHandoffState({ state: 'saved', message: handoffCopy.saved });
    }
  };

  const refreshQueue = async () => {
    if (!project?.id) return;
    setQueueState((prev) => ({ ...prev, state: 'loading' }));
    try {
      const result = await openclaw.listPartnerHandoffTasks({ projectId: project.id, limit: 8 });
      setQueueState({
        state: 'ready',
        tasks: Array.isArray(result?.tasks) ? result.tasks : [],
        receipts: Array.isArray(result?.receipts) ? result.receipts : [],
      });
    } catch (err) {
      console.warn('[Partner Handoff] Queue refresh failed:', err);
      setQueueState((prev) => ({ ...prev, state: 'saved' }));
    }
  };

  const updateWorkStatus = async (status) => {
    if (!hasTask) return;
    const label = handoffCopy.workStatuses?.[status] || status;
    const note = handoffCopy.workNotes?.[status] || label;
    setWorkState({ state: 'updating', message: handoffCopy.statusSaving, workStatus: status });
    try {
      const result = await openclaw.updatePartnerHandoffStatus({
        projectId: project?.id,
        path: taskPath,
        status,
        note,
      });
      const statusRecord = {
        status,
        label,
        note,
        taskPath,
        statusPath: result?.statusPath || '',
        updatedAt: Date.now(),
      };
      recordWorkStatus(statusRecord, result?.task || null);
      setWorkState({ state: 'saved', message: handoffCopy.statusSaved(label), workStatus: status });
    } catch (err) {
      console.warn('[Partner Handoff] Status update failed:', err);
      const statusRecord = {
        status,
        label,
        note,
        taskPath,
        statusPath: '',
        updatedAt: Date.now(),
      };
      recordWorkStatus(statusRecord);
      setWorkState({ state: 'saved', message: handoffCopy.statusSaved(label), workStatus: status });
    }
  };

  if (!hasTask) {
    return (
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-center gap-2">
          <Route className="w-3.5 h-3.5 text-gdpro-text-muted" strokeWidth={2} />
          <div className="text-[12px] font-semibold text-gdpro-text">{handoffCopy.emptyTitle}</div>
        </div>
        <p className="text-[10px] leading-relaxed text-gdpro-text-muted mt-2">
          {handoffCopy.emptyBody}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gdpro-accent/20 bg-gdpro-accent/10 p-3 shadow-[0_10px_28px_rgba(24,35,48,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Route className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2.2} />
            <div className="text-[12px] font-semibold text-gdpro-text truncate">{handoffCopy.title}</div>
          </div>
          <p className="text-[10px] leading-relaxed text-gdpro-text-secondary mt-1">
            {handoffCopy.summary ? handoffCopy.summary(statusLabel, nextActionLabel) : `${statusLabel} · ${nextActionLabel}`}
          </p>
        </div>
        <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${statusStyle}`}>
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-md border border-gdpro-accent/15 bg-white/70 px-2.5 py-2 min-w-0">
          <div className="text-[9px] text-gdpro-text-muted">{handoffCopy.savedAt}</div>
          <div className="text-[12px] font-semibold text-gdpro-text mt-0.5 truncate">
            {formatHandoffTime(task?.createdAt || report?.createdAt, copy.locale)}
          </div>
        </div>
        <div className="rounded-md border border-gdpro-accent/15 bg-white/70 px-2.5 py-2 min-w-0">
          <div className="text-[9px] text-gdpro-text-muted">{handoffCopy.next}</div>
          <div className="text-[12px] font-semibold text-gdpro-text mt-0.5 truncate">{nextActionLabel}</div>
        </div>
      </div>

      {taskPath && (
        <div className="mt-2 rounded-md border border-gdpro-accent/15 bg-white/70 px-2 py-1.5">
          <div className="text-[9px] text-gdpro-text-muted mb-0.5">{handoffCopy.path}</div>
          <div className="font-mono text-[9px] text-gdpro-accent truncate" title={taskPath}>{taskPath}</div>
        </div>
      )}

      {message && (
        <p className="text-[10px] leading-relaxed text-gdpro-accent mt-2">{message}</p>
      )}

      <div className="mt-2 rounded-md border border-gdpro-accent/15 bg-white/70 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] text-gdpro-text-muted">{handoffCopy.workState}</span>
          <span className="text-[10px] font-semibold text-gdpro-accent">{workStatusLabel}</span>
        </div>
        {workState.message && (
          <p className="text-[9px] leading-relaxed text-gdpro-accent mt-1">{workState.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          type="button"
          onClick={requestPartner}
          disabled={handoffState.state === 'checking'}
          className="gdpro-button flex items-center justify-center gap-1.5 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {handoffState.state === 'checking' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.3} />
          ) : (
            <Route className="w-3.5 h-3.5" strokeWidth={2.3} />
          )}
          {handoffState.state === 'checking' ? handoffCopy.checking : handoffCopy.notify}
        </button>
        <button
          type="button"
          onClick={() => onAction?.(handoffCopy.inspectPrompt, 'inspect_partner_handoff')}
          className="px-3 py-[7px] rounded-md bg-white/80 border border-gdpro-accent/20 text-[11px] text-gdpro-accent hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent"
        >
          {handoffCopy.inspect}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mt-2">
        {['in-progress', 'completed', 'needs-help'].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => updateWorkStatus(status)}
            disabled={workState.state === 'updating'}
            className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent disabled:opacity-50 disabled:cursor-not-allowed ${
              workStatus === status
                ? 'border-gdpro-accent/30 bg-white text-gdpro-accent'
                : 'border-gdpro-accent/15 bg-white/70 text-gdpro-text-secondary hover:text-gdpro-accent hover:bg-white'
            }`}
          >
            {handoffCopy.workActions?.[status] || status}
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-gdpro-accent/15 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold text-gdpro-text-muted uppercase tracking-[0.12em]">
            {handoffCopy.queueTitle}
          </div>
          <button
            type="button"
            onClick={refreshQueue}
            disabled={queueState.state === 'loading'}
            className="text-[10px] px-2 py-1 rounded-md bg-white/70 border border-gdpro-accent/15 text-gdpro-accent hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gdpro-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {queueState.state === 'loading' ? handoffCopy.refreshing : handoffCopy.refresh}
          </button>
        </div>

        <div className="mt-2 space-y-1.5">
          {visibleTasks.length ? visibleTasks.map((item, index) => {
            const itemStatus = item?.queueStatus || 'saved-for-review';
            const itemStatusLabel = handoffCopy.statuses?.[itemStatus] || controlStatus(copy, itemStatus);
            const itemAction = handoffCopy.nextActions?.[item?.nextAction] || handoffCopy.nextActions?.default;
            return (
              <div key={item?.id || `${item?.primaryPath || 'handoff'}-${index}`} className="rounded-md border border-gdpro-accent/15 bg-white/70 px-2.5 py-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-gdpro-text truncate">
                    {item?.run?.scopeLabel || item?.run?.label || handoffCopy.queueItemFallback}
                  </span>
                  <span className="text-[9px] text-gdpro-accent shrink-0">{itemStatusLabel}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-gdpro-text-muted">
                  <span className="truncate">{itemAction}</span>
                  <span className="shrink-0">{formatHandoffTime(item?.createdAt, copy.locale)}</span>
                </div>
                {item?.localConsole?.workStatus && (
                  <div className="mt-1 text-[9px] text-gdpro-accent truncate">
                    {handoffCopy.workStatuses?.[item.localConsole.workStatus] || item.localConsole.workStatus}
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="rounded-md border border-gdpro-accent/15 bg-white/70 px-2.5 py-2 text-[10px] text-gdpro-text-muted">
              {handoffCopy.queueEmpty}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BrandKitPassportPanel({ brandKit, onAction, copy }) {
  if (!brandKit) return null;

  const stats = brandKit.stats || {};
  const materials = stats.materials || 0;
  const statusClass = BRAND_KIT_STATUS_STYLE[brandKit.status] || BRAND_KIT_STATUS_STYLE.draft;
  const topIssue = (brandKit.issues || [])[0];
  const brandCopy = copy.brandKit;
  const passportItems = [
    {
      id: 'kit-readiness',
      label: brandCopy.metrics.readiness[0],
      value: `${brandKit.readiness || 0}%`,
      detail: controlText(copy, brandKit.statusLabel || brandCopy.metrics.readiness[1]),
      ok: brandKit.locked,
    },
    {
      id: 'vector-logo',
      label: brandCopy.metrics.vectorLogo[0],
      value: stats.vectorLogos || 0,
      detail: brandCopy.metrics.vectorLogo[1],
      ok: (stats.vectorLogos || 0) > 0,
    },
    {
      id: 'material-refs',
      label: brandCopy.metrics.materialRefs[0],
      value: `${stats.boundMaterials || 0}/${materials}`,
      detail: brandCopy.metrics.materialRefs[1],
      ok: materials > 0 && stats.boundMaterials === materials,
    },
    {
      id: 'svg-source',
      label: brandCopy.metrics.svgSource[0],
      value: `${stats.sourceSvgReady || 0}/${materials}`,
      detail: brandCopy.metrics.svgSource[1],
      ok: materials > 0 && stats.sourceSvgReady === materials,
    },
  ];

  const contractItems = (brandKit.contract || []).slice(0, 9);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3 shadow-[0_10px_28px_rgba(24,35,48,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gdpro-icon-mark flex items-center justify-center shrink-0">
                <PackageCheck className="w-4 h-4 text-white" strokeWidth={2.4} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-gdpro-text truncate">
                  {brandKit.brandName || brandCopy.currentProject} {brandCopy.titleSuffix}
                </div>
                <div className="text-[10px] text-gdpro-text-muted mt-0.5">
                  {brandCopy.subtitle}
                </div>
              </div>
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${statusClass}`}>
            {brandKit.readyForDelivery ? brandCopy.readyForDelivery : (copy.locale === 'en' ? brandCopy.draftStatus : brandKit.statusLabel)}
          </span>
        </div>

        <div className="mt-3 h-1.5 rounded-full bg-gdpro-bg-surface overflow-hidden">
          <div
            className={`h-full rounded-full ${brandKit.readyForDelivery ? 'bg-gdpro-success' : brandKit.locked ? 'bg-gdpro-accent' : 'bg-gdpro-warning'}`}
            style={{ width: `${Math.max(4, brandKit.readiness || 0)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          {passportItems.map((item) => (
            <div key={item.id} className="rounded-lg border border-gdpro-border bg-gdpro-bg-surface/70 px-2.5 py-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-gdpro-text-muted truncate">{item.label}</span>
                <StatusIcon ok={item.ok} blocker={!item.ok} />
              </div>
              <div className={`text-[17px] font-semibold mt-1 tabular-nums ${item.ok ? 'text-gdpro-success' : 'text-gdpro-warning'}`}>
                {item.value}
              </div>
              <p className="text-[9px] text-gdpro-text-muted truncate" title={item.detail}>{item.detail}</p>
            </div>
          ))}
        </div>

        {topIssue && (
          <div className={`mt-3 rounded-lg border px-3 py-2 ${RISK_STYLE[topIssue.severity] || RISK_STYLE.medium}`}>
            <div className="text-[11px] font-semibold">{controlText(copy, topIssue.title)}</div>
            <p className="text-[10px] leading-relaxed opacity-85 mt-1">{controlText(copy, topIssue.fix || topIssue.detail)}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {contractItems.map((item) => (
          <div
            key={item.id}
            className={`rounded-md border px-2 py-1.5 min-w-0 ${item.passed ? 'border-gdpro-success/20 bg-gdpro-success/10' : 'border-gdpro-warning/20 bg-gdpro-warning/10'}`}
            title={controlText(copy, item.detail)}
          >
            <div className="flex items-center gap-1.5">
              <StatusIcon ok={item.passed} blocker={false} />
              <span className={`text-[10px] font-semibold truncate ${item.passed ? 'text-gdpro-success' : 'text-gdpro-warning'}`}>
                {copy.locale === 'en' && item.labelEn ? item.labelEn : item.label}
              </span>
            </div>
            <div className="text-[9px] text-gdpro-text-muted mt-0.5 truncate">
              {copy.locale === 'en' ? (item.passed ? 'Ready' : 'Missing') : item.labelEn}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAction?.('请读取品牌套件护照，列出缺失的 Logo、颜色、字体、设计指导、物料引用和矢量源稿，并给出最小修复顺序。', 'inspect_brand_kit_passport')}
          className="gdpro-button flex items-center justify-center gap-1.5"
        >
          <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
          {copy.brandKit.check}
        </button>
        <button
          type="button"
          onClick={() => onAction?.('请只返回能保持品牌一致性的下一步界面动作：优先锁定品牌资产、同步物料引用、制作矢量源稿或完成交付前检查。', 'repair_brand_kit_passport')}
          className="gdpro-button-secondary flex items-center justify-center gap-1.5"
        >
          <Route className="w-3.5 h-3.5" strokeWidth={2.2} />
          {copy.brandKit.repairNext}
        </button>
      </div>
    </div>
  );
}

function GlobalBrandKitLibraryPanel({ project, onProjectUpdate }) {
  const [kits, setKits] = useState(() => loadBrandKitLibrary());
  const [kitName, setKitName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef(null);
  const assignedId = project?.assignedBrandKitId;

  const refresh = () => setKits(loadBrandKitLibrary());

  const handleFiles = async (files) => {
    const fileList = Array.from(files || []);
    if (!fileList.length || isParsing) return;
    setIsParsing(true);
    const parsedFiles = await Promise.all(fileList.map(async (file) => ({
      id: `kit_file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      size: file.size,
      type: file.type || file.name.split('.').pop() || 'file',
      createdAt: Date.now(),
      parsed: await parseFile(file),
    })));
    const kit = createBrandKitFromParsedFiles({
      name: kitName.trim(),
      files: parsedFiles,
    });
    upsertBrandKit(kit);
    setKitName('');
    refresh();
    setIsParsing(false);
  };

  const assignKit = (kit) => {
    if (!project?.id || !onProjectUpdate) return;
    const nextProject = assignBrandKitToProject(project, kit);
    onProjectUpdate(project.id, nextProject);
    refresh();
  };

  const deleteKit = (kitId) => {
    removeBrandKit(kitId);
    refresh();
  };

  return (
    <div className="space-y-3 mb-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-gdpro-text">全局品牌套件库</div>
            <p className="text-[10px] text-gdpro-text-muted leading-relaxed mt-1">
              品牌套件是可复用知识库。上传规范、Logo 说明或品牌手册后，可分配给不同项目。
            </p>
          </div>
          <span className="rounded-md border border-gdpro-accent/20 bg-gdpro-accent/10 px-2 py-1 text-[10px] font-semibold text-gdpro-accent">
            {kits.length} 套
          </span>
        </div>
        <div className="mt-3 flex gap-1.5">
          <input
            value={kitName}
            onChange={(e) => setKitName(e.target.value)}
            className="gdpro-input text-[12px] py-[5px] flex-1"
            placeholder="套件名称（可选）"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing}
            className="gdpro-button text-[11px] px-2.5 py-[5px] flex items-center gap-1.5 disabled:opacity-40"
          >
            {isParsing ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2.4} /> : <Upload className="w-3 h-3" strokeWidth={2.4} />}
            上传
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,.pdf,.svg,.md,.txt"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {kits.length ? (
        <div className="space-y-2">
          {kits.slice(0, 5).map((kit) => {
            const assigned = assignedId === kit.id;
            return (
              <div key={kit.id} className={`rounded-lg border px-3 py-2 ${assigned ? 'border-gdpro-accent/30 bg-gdpro-accent/8' : 'border-gdpro-border bg-gdpro-bg-elevated'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-gdpro-text truncate">{kit.name}</div>
                    <p className="text-[9px] leading-relaxed text-gdpro-text-muted mt-0.5 line-clamp-2">{kit.description}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="rounded border border-gdpro-border bg-gdpro-bg-surface px-1.5 py-[1px] text-[9px] text-gdpro-text-muted">{kit.files.length} 文件</span>
                      <span className="rounded border border-gdpro-border bg-gdpro-bg-surface px-1.5 py-[1px] text-[9px] text-gdpro-text-muted">{kit.guidance.colors.length} 色彩</span>
                      <span className="rounded border border-gdpro-border bg-gdpro-bg-surface px-1.5 py-[1px] text-[9px] text-gdpro-text-muted">{kit.guidance.rules.length} 规则</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => assignKit(kit)}
                      className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${assigned ? 'border-gdpro-success/20 bg-gdpro-success/10 text-gdpro-success' : 'border-gdpro-accent/20 bg-gdpro-accent/10 text-gdpro-accent hover:bg-gdpro-accent/15'}`}
                    >
                      {assigned ? '已分配' : '分配'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteKit(kit.id)}
                      className="rounded-md border border-gdpro-border bg-gdpro-bg-surface p-1 text-gdpro-text-muted hover:text-gdpro-danger"
                      title="删除套件"
                      aria-label="删除套件"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={2.3} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-surface px-3 py-2 text-[10px] text-gdpro-text-muted leading-relaxed">
          还没有全局品牌套件。上传一份品牌规范、Logo 文档或参考说明即可建立第一套。
        </div>
      )}
    </div>
  );
}

function StatusIcon({ ok, blocker }) {
  if (ok) return <CheckCircle2 className="w-3.5 h-3.5 text-gdpro-success shrink-0" strokeWidth={2} />;
  if (blocker) return <XCircle className="w-3.5 h-3.5 text-gdpro-danger shrink-0" strokeWidth={2} />;
  return <Circle className="w-3.5 h-3.5 text-gdpro-warning shrink-0" strokeWidth={2} />;
}

function createGuiEvent(label, type = 'gui_update') {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    source: 'gui',
    type,
    label,
  };
}

function buildTokenDraft(project) {
  const kit = project?.brandKit || {};
  const typography = kit.typography || {};
  const colors = Array.isArray(kit.colors) && kit.colors.length
    ? kit.colors
    : [{ name: '主色', hex: '#16A085', usage: 'Primary' }];

  return {
    brandName: project?.brandName || '',
    slogan: kit.slogan || '',
    philosophy: kit.philosophy || '',
    display: typography.display || '',
    body: typography.body || '',
    colors: colors.map((color) => ({
      name: color.name || color.label || '',
      hex: color.hex || color.color || '',
      usage: color.usage || color.role || '',
    })),
  };
}

function BrandTokenEditor({ project, onProjectUpdate }) {
  const [draft, setDraft] = useState(() => buildTokenDraft(project));

  useEffect(() => {
    setDraft(buildTokenDraft(project));
  }, [project?.id, project?.brandName, project?.brandKit]);

  const updateField = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updateColor = (index, patch) => {
    setDraft((prev) => ({
      ...prev,
      colors: prev.colors.map((color, i) => (i === index ? { ...color, ...patch } : color)),
    }));
  };

  const addColor = () => {
    setDraft((prev) => ({
      ...prev,
      colors: [...prev.colors, { name: '新颜色', hex: '#D6A94A', usage: 'Accent' }],
    }));
  };

  const removeColor = (index) => {
    setDraft((prev) => ({
      ...prev,
      colors: prev.colors.filter((_, i) => i !== index),
    }));
  };

  const saveTokens = () => {
    if (!project?.id || !onProjectUpdate) return;
    onProjectUpdate(project.id, (prev) => ({
      ...prev,
      brandName: draft.brandName.trim(),
      brandKit: {
        ...(prev.brandKit || {}),
        slogan: draft.slogan.trim(),
        philosophy: draft.philosophy.trim(),
        colors: draft.colors
          .map((color) => ({
            name: color.name.trim() || color.hex.trim(),
            hex: color.hex.trim(),
            usage: color.usage.trim(),
          }))
          .filter((color) => color.hex),
        typography: {
          ...((prev.brandKit || {}).typography || {}),
          display: draft.display.trim(),
          body: draft.body.trim(),
        },
      },
      control: {
        ...(prev.control || {}),
        lastAction: 'gui_lock_brand_tokens',
        lastUpdatedAt: Date.now(),
        events: [
          createGuiEvent('品牌规范已锁定', 'gui-token-lock'),
          ...((prev.control || {}).events || []),
        ].slice(0, 40),
      },
      updatedAt: Date.now(),
    }));
  };

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-[10px] text-gdpro-text-muted">品牌名称</span>
        <input
          value={draft.brandName}
          onChange={(e) => updateField('brandName', e.target.value)}
          className="gdpro-input mt-1 py-1.5 text-[12px]"
        />
      </label>
      <label className="block">
        <span className="text-[10px] text-gdpro-text-muted">品牌口号</span>
        <input
          value={draft.slogan}
          onChange={(e) => updateField('slogan', e.target.value)}
          placeholder="未锁定"
          className="gdpro-input mt-1 py-1.5 text-[12px]"
        />
      </label>
      <label className="block">
        <span className="text-[10px] text-gdpro-text-muted">设计哲学</span>
        <textarea
          value={draft.philosophy}
          onChange={(e) => updateField('philosophy', e.target.value)}
          placeholder="例如：克制中的力量"
          rows={2}
          className="gdpro-input mt-1 py-1.5 text-[12px] resize-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-gdpro-text-muted flex items-center gap-1">
            <Type className="w-3 h-3" strokeWidth={2} /> 标题字体
          </span>
          <input
            value={draft.display}
            onChange={(e) => updateField('display', e.target.value)}
            placeholder="Display"
            className="gdpro-input mt-1 py-1.5 text-[12px]"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-gdpro-text-muted flex items-center gap-1">
            <Type className="w-3 h-3" strokeWidth={2} /> 正文字体
          </span>
          <input
            value={draft.body}
            onChange={(e) => updateField('body', e.target.value)}
            placeholder="Body"
            className="gdpro-input mt-1 py-1.5 text-[12px]"
          />
        </label>
      </div>
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center gap-2">
          <Palette className="w-3 h-3 text-gdpro-text-muted" strokeWidth={2} />
          <span className="text-[10px] text-gdpro-text-muted">品牌色</span>
          <button
            type="button"
            onClick={addColor}
            className="ml-auto p-1 rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-gdpro-text-muted hover:text-gdpro-text"
            title="添加颜色"
          >
            <Plus className="w-3 h-3" strokeWidth={2} />
          </button>
        </div>
        {draft.colors.map((color, index) => (
          <div key={`${color.hex}_${index}`} className="grid grid-cols-[20px_1fr_72px_24px] items-center gap-1.5">
            <span className="w-4 h-4 rounded border border-gdpro-border" style={{ backgroundColor: color.hex || '#11100F' }} />
            <input
              value={color.name}
              onChange={(e) => updateColor(index, { name: e.target.value })}
              className="gdpro-input py-1 text-[11px]"
              placeholder="名称"
            />
            <input
              value={color.hex}
              onChange={(e) => updateColor(index, { hex: e.target.value })}
              className="gdpro-input py-1 text-[11px] font-mono"
              placeholder="#000000"
            />
            <button
              type="button"
              onClick={() => removeColor(index)}
              className="p-1 rounded-md text-gdpro-text-muted hover:text-gdpro-danger hover:bg-gdpro-danger/10"
              title="删除颜色"
            >
              <Trash2 className="w-3 h-3" strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={saveTokens}
        className="w-full gdpro-button flex items-center justify-center gap-2 mt-2"
      >
      <Save className="w-3.5 h-3.5" strokeWidth={2.5} />
        保存并锁定品牌规范
      </button>
    </div>
  );
}

function PhaseTaskList({ project, phaseState, onProjectUpdate }) {
  const phase = phaseState?.phase || project?.currentPhase || 1;
  const tasks = phaseState?.tasks || project?.workflow?.tasks || [];
  const doneCount = tasks.filter((task) => task.done).length;

  const toggleTask = (index) => {
    if (!project?.id || !onProjectUpdate) return;
    onProjectUpdate(project.id, (prev) => {
      const seedTasks = phaseState?.tasks || prev.workflow?.tasks || [];
      const nextTasks = seedTasks.map((task, i) => (
        i === index ? { ...task, done: !task.done } : { ...task }
      ));
      const previousPhaseStates = prev.workflow?.phaseStates || {};
      return {
        ...prev,
        workflow: {
          ...(prev.workflow || {}),
          currentPhaseId: phase,
          tasks: nextTasks,
          phaseStates: {
            ...previousPhaseStates,
            [phase]: {
              ...(previousPhaseStates[phase] || {}),
              phase,
              tasks: nextTasks,
              updatedAt: Date.now(),
            },
          },
        },
        control: {
          ...(prev.control || {}),
          lastAction: 'gui_toggle_phase_task',
          lastUpdatedAt: Date.now(),
          events: [
            createGuiEvent(`第 ${phase} 阶段待办已更新`, 'gui-task-toggle'),
            ...((prev.control || {}).events || []),
          ].slice(0, 40),
        },
        updatedAt: Date.now(),
      };
    });
  };

  if (!tasks.length) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-gdpro-text">第 {phase} 阶段待办</span>
        <span className="text-[10px] text-gdpro-text-muted">{doneCount}/{tasks.length}</span>
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {tasks.map((task, index) => (
          <button
            key={`${task.text}_${index}`}
            type="button"
            onClick={() => toggleTask(index)}
            className="w-full flex items-start gap-2 text-left rounded-md px-2 py-1.5 hover:bg-gdpro-bg-hover transition-colors"
          >
            <StatusIcon ok={task.done} blocker={false} />
            <span className={`text-[11px] leading-snug ${task.done ? 'text-gdpro-text-muted line-through' : 'text-gdpro-text-secondary'}`}>
              {task.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AssetManifestPanel({ project, manifest, onProjectUpdate, onAction, copy }) {
  if (!manifest) return null;

  const canLock = manifest.productionReady;
  const lockManifest = () => {
    if (!project?.id || !onProjectUpdate || !canLock) return;
    onProjectUpdate(project.id, (prev) => ({
      ...prev,
      assetManifest: createLockedBrandAssetManifest(prev, { lockedBy: 'gui' }),
      control: {
        ...(prev.control || {}),
        lastAction: 'gui_lock_asset_manifest',
        lastUpdatedAt: Date.now(),
        events: [
          createGuiEvent('品牌资产清单已锁定', 'gui-manifest-lock'),
          ...((prev.control || {}).events || []),
        ].slice(0, 40),
      },
      updatedAt: Date.now(),
    }));
  };

  const statusClass = manifest.locked
    ? 'text-gdpro-success border-gdpro-success/20 bg-gdpro-success/10'
    : manifest.stale
      ? 'text-gdpro-warning border-gdpro-warning/20 bg-gdpro-warning/10'
      : manifest.productionReady
        ? 'text-gdpro-info border-gdpro-info/20 bg-gdpro-info/10'
        : 'text-gdpro-danger border-gdpro-danger/20 bg-gdpro-danger/10';

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-gdpro-text">{panelText(copy, 'assetManifest', 'title', '品牌资产清单')}</div>
            <div className="text-[10px] text-gdpro-text-muted mt-0.5">
              {copy?.panels?.assetManifest?.summary
                ? copy.panels.assetManifest.summary(manifest.readyItemCount, manifest.requiredItemCount, manifest.items.length)
                : `${manifest.readyItemCount}/${manifest.requiredItemCount} 必需项 · ${manifest.items.length} 可引用项`}
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${statusClass}`}>
            {controlStatus(copy, manifest.status)}
          </span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-gdpro-bg-surface overflow-hidden">
          <div
            className={`h-full rounded-full ${manifest.productionReady ? 'bg-gdpro-success' : 'bg-gdpro-danger'}`}
            style={{ width: `${Math.max(4, manifest.readiness)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {manifest.requiredSlots.map((slot) => (
          <div key={slot.id} className="flex items-center gap-1.5 rounded-md bg-gdpro-bg-elevated border border-gdpro-border px-2 py-1.5 min-w-0">
            <StatusIcon ok={slot.filled} blocker />
            <span className="text-[10px] text-gdpro-text-secondary truncate">{controlText(copy, slot.label)}</span>
          </div>
        ))}
      </div>

      {manifest.missing.length > 0 && (
        <div className="rounded-lg border border-gdpro-danger/20 bg-gdpro-danger/10 px-3 py-2">
          <div className="text-[11px] font-semibold text-gdpro-danger">{panelText(copy, 'assetManifest', 'missingTitle', '缺少生产依据')}</div>
          <p className="text-[10px] leading-relaxed text-gdpro-danger/85 mt-1">
            {manifest.missing.map((item) => controlText(copy, item.label)).join(copy.locale === 'en' ? ', ' : '、')}
          </p>
        </div>
      )}

      {manifest.items.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {manifest.items.slice(0, 8).map((item) => (
            <div key={item.id} className="flex items-center gap-2 min-w-0 rounded-md px-2 py-1.5 bg-gdpro-bg-elevated border border-gdpro-border">
              <span className="w-1.5 h-1.5 rounded-full bg-gdpro-accent shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-gdpro-text truncate">{controlText(copy, item.name || item.value)}</div>
                <div className="text-[9px] text-gdpro-text-muted truncate">{controlText(copy, assetRoleLabel(item.role))}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={lockManifest}
          disabled={!canLock}
          className="gdpro-button flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          title={canLock
            ? panelText(copy, 'assetManifest', 'lockReadyTitle', '锁定为后续物料生产依据')
            : panelText(copy, 'assetManifest', 'lockBlockedTitle', '先补齐 Logo、色彩、字体和设计哲学')}
        >
          <Save className="w-3.5 h-3.5" strokeWidth={2.5} />
          {manifest.locked && !manifest.stale
            ? panelText(copy, 'assetManifest', 'locked', '已锁定')
            : panelText(copy, 'assetManifest', 'lock', '锁定')}
        </button>
        <button
          type="button"
          onClick={() => onAction?.('请检查当前品牌资产清单，列出可复用项、缺失项、过期风险，以及进入物料扩展前必须补齐的动作。', 'inspect_asset_manifest')}
          className="px-3 py-[7px] rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-[12px] text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
        >
          {panelText(copy, 'assetManifest', 'check', '检查')}
        </button>
      </div>
    </div>
  );
}

function getNextMaterialStatus(status) {
  const index = MATERIAL_STATUSES.indexOf(status);
  return MATERIAL_STATUSES[(index + 1) % MATERIAL_STATUSES.length] || 'planned';
}

function MaterialProductionPanel({ project, materialPlan, manifest, onProjectUpdate, onAction, copy }) {
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const materials = materialPlan?.materials || [];
  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId) || materials[0] || null;
  const selectedArtworkAudit = selectedMaterial ? auditMaterialArtwork(project, selectedMaterial) : null;
  const selectedQaIssues = selectedArtworkAudit?.issues?.slice(0, 3) || [];

  useEffect(() => {
    if (!materials.length) {
      setSelectedMaterialId(null);
      return;
    }
    if (!selectedMaterialId || !materials.some((material) => material.id === selectedMaterialId)) {
      setSelectedMaterialId(materials[0].id);
    }
  }, [materials, selectedMaterialId]);

  if (!materialPlan) return null;

  const addMaterial = (templateId) => {
    if (!project?.id || !onProjectUpdate || !manifest?.locked) return;
    const template = MATERIAL_TEMPLATES.find((item) => item.id === templateId);
    onProjectUpdate(project.id, (prev) => {
      const next = addMaterialToProduction(prev, templateId);
      return {
        ...next,
        control: {
          ...(next.control || {}),
          lastAction: 'gui_add_material',
          lastUpdatedAt: Date.now(),
          events: [
            createGuiEvent(`已添加物料：${template?.name || templateId}`, 'gui-material-add'),
            ...((next.control || {}).events || []),
          ].slice(0, 40),
        },
      };
    });
  };

  const cycleStatus = (materialId, status) => {
    if (!project?.id || !onProjectUpdate) return;
    const nextStatus = getNextMaterialStatus(status);
    onProjectUpdate(project.id, (prev) => {
      const material = (prev.materialProduction?.materials || []).find((item) => item.id === materialId);
      if (nextStatus === 'exported') {
        const artworkAudit = auditMaterialArtwork(prev, material);
        if (!artworkAudit.passed) {
          return {
            ...prev,
            control: {
              ...(prev.control || {}),
              lastAction: 'gui_block_material_export',
              lastUpdatedAt: Date.now(),
              events: [
                createGuiEvent(`${material?.name || '物料'} 源稿检查未通过，不能标为已导出`, 'gui-material-export-blocked'),
                ...((prev.control || {}).events || []),
              ].slice(0, 40),
            },
          };
        }
      }
      const next = updateMaterialStatus(prev, materialId, nextStatus);
      return {
        ...next,
        control: {
          ...(next.control || {}),
          lastAction: 'gui_update_material_status',
          lastUpdatedAt: Date.now(),
          events: [
            createGuiEvent(`物料状态已更新为：${friendlyStatus(nextStatus)}`, 'gui-material-status'),
            ...((next.control || {}).events || []),
          ].slice(0, 40),
        },
      };
    });
  };

  const generateArtwork = () => {
    if (!project?.id || !onProjectUpdate || !materialPlan.materials.length) return;
    onProjectUpdate(project.id, (prev) => {
      const next = generateAllMaterialArtwork(prev);
      return {
        ...next,
        documents: {
          ...(next.documents || {}),
          materialSpec: createMaterialSpecDocument(next),
        },
        control: {
          ...(next.control || {}),
          lastAction: 'gui_generate_material_artwork',
          lastUpdatedAt: Date.now(),
          events: [
            createGuiEvent('物料源稿已制作', 'gui-material-artwork'),
            ...((next.control || {}).events || []),
          ].slice(0, 40),
        },
      };
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[12px] font-semibold text-gdpro-text">{panelText(copy, 'materials', 'title', '物料生产清单')}</div>
            <div className="text-[10px] text-gdpro-text-muted mt-0.5">
              {copy?.panels?.materials?.summary
                ? copy.panels.materials.summary(materialPlan.stats.total, materialPlan.stats.sourceArtworks || 0, materialPlan.stats.sourceQaPassed || 0, materialPlan.stats.exported)
                : `${materialPlan.stats.total} 个物料 · ${materialPlan.stats.sourceArtworks || 0} 份源稿 · ${materialPlan.stats.sourceQaPassed || 0} 个已检查 · ${materialPlan.stats.exported} 个已导出`}
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold ${
            materialPlan.status === 'ready'
              ? 'text-gdpro-success border-gdpro-success/20 bg-gdpro-success/10'
              : 'text-gdpro-warning border-gdpro-warning/20 bg-gdpro-warning/10'
          }`}>
            {controlStatus(copy, materialPlan.status)}
          </span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-gdpro-bg-surface overflow-hidden">
          <div
            className="h-full rounded-full bg-gdpro-accent"
            style={{ width: `${Math.max(4, materialPlan.readiness)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {MATERIAL_TEMPLATES.slice(0, 4).map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => addMaterial(template.id)}
            disabled={!manifest?.locked}
            className="flex items-center gap-1.5 rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5 text-left text-[10px] text-gdpro-text-secondary hover:text-gdpro-text disabled:opacity-40 disabled:cursor-not-allowed"
            title={manifest?.locked
              ? (copy?.panels?.materials?.addTitle ? copy.panels.materials.addTitle(controlText(copy, template.name)) : `添加${template.name}`)
              : panelText(copy, 'materials', 'addBlockedTitle', '先锁定品牌资产清单')}
          >
            <Plus className="w-3 h-3 shrink-0" strokeWidth={2.2} />
            <span className="truncate">{controlText(copy, template.name)}</span>
          </button>
        ))}
      </div>

      {materialPlan.blockers.length > 0 && (
        <div className="rounded-lg border border-gdpro-warning/20 bg-gdpro-warning/10 px-3 py-2">
          <div className="text-[11px] font-semibold text-gdpro-warning">{panelText(copy, 'materials', 'blockerTitle', '生产阻断')}</div>
          <p className="text-[10px] leading-relaxed text-gdpro-warning/85 mt-1 line-clamp-2">
            {materialPlan.blockers.map((blocker) => controlText(copy, blocker.title)).join(copy.locale === 'en' ? ', ' : '、')}
          </p>
        </div>
      )}

      {materialPlan.materials.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {materialPlan.materials.slice(0, 6).map((material) => {
            const artworkAudit = auditMaterialArtwork(project, material);
            const qaClass = SOURCE_QA_STATUS_STYLE[artworkAudit.status] || SOURCE_QA_STATUS_STYLE.blocked;
            return (
              <div
                key={material.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedMaterialId(material.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setSelectedMaterialId(material.id);
                }}
                className={`rounded-md border px-2 py-1.5 cursor-pointer transition-colors ${
                  selectedMaterial?.id === material.id
                    ? 'border-gdpro-accent/40 bg-gdpro-accent/10'
                    : 'border-gdpro-border bg-gdpro-bg-elevated hover:border-gdpro-border-light'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gdpro-text truncate">{controlText(copy, material.name)}</span>
                  <button
                    type="button"
                    onClick={() => cycleStatus(material.id, material.status)}
                    className={`px-1.5 py-[2px] rounded border text-[9px] font-semibold shrink-0 ${MATERIAL_STATUS_STYLE[material.status] || MATERIAL_STATUS_STYLE.planned}`}
                    title={panelText(copy, 'materials', 'changeStatus', '切换物料状态')}
                  >
                    {controlStatus(copy, material.status)}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-1 min-w-0">
                  <span className="text-[9px] text-gdpro-text-muted truncate">
                    {material.size.width}x{material.size.height}{material.size.unit} · {material.colorMode} · {material.artwork?.sourceType
                      ? panelText(copy, 'materials', 'hasSource', '已有源稿')
                      : panelText(copy, 'materials', 'needsSource', '待制作源稿')}
                  </span>
                  <span className={`ml-auto px-1.5 py-[1px] rounded border text-[8px] font-semibold shrink-0 ${qaClass}`}>
                    {artworkAudit.passed
                      ? panelText(copy, 'materials', 'passed', '检查通过')
                      : panelText(copy, 'materials', 'needsFix', '需修复')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedMaterial && (
        <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gdpro-border">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-gdpro-text truncate">
                {copy?.panels?.materials?.sourceTitle
                  ? copy.panels.materials.sourceTitle(controlText(copy, selectedMaterial.name))
                  : `${selectedMaterial.name} 源稿`}
              </div>
              <div className="text-[9px] text-gdpro-text-muted truncate">{selectedMaterial.artwork?.sourcePath || panelText(copy, 'materials', 'noSource', '还没有可编辑源稿')}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`px-1.5 py-[2px] rounded border text-[9px] font-semibold ${SOURCE_QA_STATUS_STYLE[selectedArtworkAudit?.status] || SOURCE_QA_STATUS_STYLE.blocked}`}>
                {copy?.panels?.materials?.sourceReadiness
                  ? copy.panels.materials.sourceReadiness(selectedArtworkAudit?.readiness || 0)
                  : `源稿 ${selectedArtworkAudit?.readiness || 0}%`}
              </span>
              {selectedMaterial.artwork?.svg && (
                <button
                  type="button"
                  onClick={() => downloadSvgMaterial(selectedMaterial)}
                  className="p-1.5 rounded-md border border-gdpro-border bg-gdpro-bg-surface text-gdpro-text-muted hover:text-gdpro-text"
                  title={panelText(copy, 'materials', 'downloadSource', '下载矢量源稿')}
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
          <div className="h-32 bg-white flex items-center justify-center p-2">
            {selectedMaterial.artwork?.svg ? (
              <img
                src={svgToDataUrl(selectedMaterial.artwork.svg)}
                alt={`${controlText(copy, selectedMaterial.name)} vector source preview`}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <span className="text-[10px] text-gdpro-text-muted">{panelText(copy, 'materials', 'waitingSource', '等待制作矢量源稿')}</span>
            )}
          </div>
          <div className="px-3 py-2 border-t border-gdpro-border space-y-1.5">
            {(selectedQaIssues.length ? selectedQaIssues : selectedArtworkAudit?.checks?.slice(0, 3) || []).map((item) => (
              <div key={item.id} className="flex items-start gap-1.5 min-w-0">
                <StatusIcon ok={item.passed} blocker={['critical', 'high'].includes(item.severity)} />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-gdpro-text-secondary truncate">{controlText(copy, item.label)}</div>
                  {!item.passed && (
                    <div className="text-[9px] text-gdpro-text-muted truncate">{controlText(copy, item.fix || item.detail)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={generateArtwork}
          disabled={!materialPlan.materials.length}
          className="gdpro-button flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PenTool className="w-3.5 h-3.5" strokeWidth={2.5} />
          {panelText(copy, 'materials', 'makeSource', '制作源稿')}
        </button>
        <button
          type="button"
          onClick={() => onAction?.('请检查当前物料生产清单：列出每个物料的尺寸、品牌资产引用、确定性源稿、导出目标、缺失项和下一步生产动作。', 'inspect_material_plan')}
          className="px-3 py-[7px] rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-[12px] text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
        >
          {panelText(copy, 'materials', 'check', '检查')}
        </button>
      </div>
    </div>
  );
}

function PreflightReviewPanel({ project, preflightReview, onProjectUpdate, onAction, copy }) {
  if (!preflightReview) return null;

  const runReview = () => {
    if (!project?.id || !onProjectUpdate) return;
    onProjectUpdate(project.id, (prev) => {
      const next = runPreflightReview(prev);
      return {
        ...next,
        control: {
          ...(next.control || {}),
          lastAction: 'gui_run_preflight',
          lastUpdatedAt: Date.now(),
          events: [
            createGuiEvent('交付前检查已完成', 'gui-preflight-review'),
            ...((next.control || {}).events || []),
          ].slice(0, 40),
        },
      };
    });
  };

  const statusClass = PREFLIGHT_STATUS_STYLE[preflightReview.status] || PREFLIGHT_STATUS_STYLE.blocked;
  const topIssues = preflightReview.issues.slice(0, 4);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[12px] font-semibold text-gdpro-text">{panelText(copy, 'preflight', 'title', '交付前检查')}</div>
            <div className="text-[10px] text-gdpro-text-muted mt-0.5">
              {copy?.panels?.preflight?.summary
                ? copy.panels.preflight.summary(preflightReview.issues.length, preflightReview.checks.approvedMaterials, preflightReview.checks.totalMaterials)
                : `${preflightReview.issues.length} 个问题 · ${preflightReview.checks.approvedMaterials}/${preflightReview.checks.totalMaterials} 个物料已通过`}
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold ${statusClass}`}>
            {controlStatus(copy, preflightReview.status)}
          </span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-gdpro-bg-surface overflow-hidden">
          <div
            className={`h-full rounded-full ${preflightReview.passed ? 'bg-gdpro-success' : 'bg-gdpro-warning'}`}
            style={{ width: `${Math.max(4, preflightReview.readiness)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {['critical', 'high', 'medium'].map((severity) => (
          <div key={severity} className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
            <div className="text-[13px] font-semibold text-gdpro-text">{preflightReview.summary[severity] || 0}</div>
            <div className="text-[9px] text-gdpro-text-muted truncate">{controlText(copy, severityLabel(severity))}</div>
          </div>
        ))}
      </div>

      {topIssues.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {topIssues.map((item) => (
            <div key={item.id} className={`rounded-md border px-2 py-1.5 ${RISK_STYLE[item.severity] || RISK_STYLE.medium}`}>
              <div className="text-[11px] font-semibold truncate">{controlText(copy, item.title)}</div>
              <p className="text-[10px] leading-relaxed opacity-85 mt-0.5 line-clamp-2">{controlText(copy, item.fix || item.detail)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={runReview}
          className="gdpro-button flex items-center justify-center gap-1.5"
        >
          <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
          {panelText(copy, 'preflight', 'run', '开始审查')}
        </button>
        <button
          type="button"
          onClick={() => onAction?.('请读取当前交付前检查和审查记录，按严重/高/中输出商用化修复动作、责任环节和是否允许进入交付。', 'inspect_preflight_review')}
          className="px-3 py-[7px] rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-[12px] text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
        >
          {panelText(copy, 'preflight', 'check', '检查')}
        </button>
      </div>
    </div>
  );
}

function DeliveryPackagePanel({ project, deliveryPackage, onProjectUpdate, onAction, copy }) {
  if (!deliveryPackage) return null;

  const generatePackage = () => {
    if (!project?.id || !onProjectUpdate) return;
    onProjectUpdate(project.id, (prev) => {
      const next = createDeliveryPackage(prev);
      return {
        ...next,
        control: {
          ...(next.control || {}),
          lastAction: 'gui_create_delivery_package',
          lastUpdatedAt: Date.now(),
          events: [
            createGuiEvent('交付包已整理', 'gui-delivery-package'),
            ...((next.control || {}).events || []),
          ].slice(0, 40),
        },
      };
    });
  };

  const statusClass = DELIVERY_STATUS_STYLE[deliveryPackage.status] || DELIVERY_STATUS_STYLE.blocked;
  const topBlockers = deliveryPackage.blockers.slice(0, 4);
  const topFolders = deliveryPackage.folders.filter((folder) => folder.itemCount > 0).slice(0, 4);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-gdpro-text">{panelText(copy, 'package', 'title', '交付包')}</div>
            <div className="text-[10px] text-gdpro-text-muted mt-0.5">
              {copy?.panels?.package?.summary
                ? copy.panels.package.summary(deliveryPackage.stats.readyEntries, deliveryPackage.stats.entries, deliveryPackage.stats.readyMaterialExports, deliveryPackage.stats.materialExports)
                : `${deliveryPackage.stats.readyEntries}/${deliveryPackage.stats.entries} 项已准备 · ${deliveryPackage.stats.readyMaterialExports}/${deliveryPackage.stats.materialExports} 份源稿可交付`}
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${statusClass}`}>
            {controlStatus(copy, deliveryPackage.status)}
          </span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-gdpro-bg-surface overflow-hidden">
          <div
            className={`h-full rounded-full ${deliveryPackage.ready ? 'bg-gdpro-success' : 'bg-gdpro-warning'}`}
            style={{ width: `${Math.max(4, deliveryPackage.readiness)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
          <div className="text-[13px] font-semibold text-gdpro-text">{deliveryPackage.stats.requiredEntries}</div>
          <div className="text-[9px] text-gdpro-text-muted truncate">{panelText(copy, 'package', 'required', '必交项')}</div>
        </div>
        <div className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
          <div className="text-[13px] font-semibold text-gdpro-text">{deliveryPackage.stats.materialExports}</div>
          <div className="text-[9px] text-gdpro-text-muted truncate">{panelText(copy, 'package', 'sourceItems', '源稿项')}</div>
        </div>
        <div className="rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5">
          <div className="text-[13px] font-semibold text-gdpro-text">{deliveryPackage.blockers.length}</div>
          <div className="text-[9px] text-gdpro-text-muted truncate">{panelText(copy, 'package', 'blockers', '阻断项')}</div>
        </div>
      </div>

      {topFolders.length > 0 && (
        <div className="space-y-1.5">
          {topFolders.map((folder) => (
            <div key={folder.id} className="flex items-center gap-2 rounded-md border border-gdpro-border bg-gdpro-bg-elevated px-2 py-1.5 min-w-0">
              <StatusIcon ok={folder.ready} blocker />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-gdpro-text truncate">{folder.path}</div>
                <div className="text-[9px] text-gdpro-text-muted truncate">{folder.readyCount}/{folder.itemCount} · {controlText(copy, folder.label)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {topBlockers.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {topBlockers.map((item) => (
            <div key={item.id} className={`rounded-md border px-2 py-1.5 ${RISK_STYLE[item.level] || RISK_STYLE.medium}`}>
              <div className="text-[11px] font-semibold truncate">{controlText(copy, item.title)}</div>
              <p className="text-[10px] leading-relaxed opacity-85 mt-0.5 line-clamp-2">{controlText(copy, item.fix || item.detail)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={generatePackage}
          className="gdpro-button flex items-center justify-center gap-1.5"
        >
          <Archive className="w-3.5 h-3.5" strokeWidth={2.5} />
          {panelText(copy, 'package', 'prepare', '整理交付包')}
        </button>
        <button
          type="button"
          onClick={() => onAction?.('请检查当前 Delivery Package：列出缺少的源文件、成品导出、VI 手册、交付清单和客户维护说明，并判断是否可作为商用交付包。', 'inspect_delivery_package')}
          className="px-3 py-[7px] rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-[12px] text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
        >
          {panelText(copy, 'package', 'check', '检查')}
        </button>
      </div>
    </div>
  );
}

function OperationResultsPanel({ operationResults, copy }) {
  if (!operationResults?.length) return null;

  return (
    <div className="space-y-2">
      {operationResults.slice(0, 6).map((item) => {
        const statusClass = OPERATION_STATUS_STYLE[item.status] || OPERATION_STATUS_STYLE.blocked;
        return (
          <div key={item.id} className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-gdpro-text truncate">{controlText(copy, item.label)}</span>
              <span className={`px-1.5 py-[2px] rounded border text-[9px] font-semibold shrink-0 ${statusClass}`}>
                {controlStatus(copy, item.status)}
              </span>
            </div>
            <div className="text-[9px] text-gdpro-text-muted mt-1 truncate">
              {panelText(copy, 'history', 'saved', '处理记录已保存')}
            </div>
            {item.detail && (
              <p className="text-[10px] leading-relaxed text-gdpro-text-muted mt-1 line-clamp-2">{controlText(copy, item.detail)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RepairQueuePanel({ project, repairQueue, onProjectUpdate, onAction, copy }) {
  if (!repairQueue) return null;

  const runnableItems = repairQueue.items.filter((item) => item.autoRunnable && item.operation);
  const topItems = repairQueue.items.slice(0, 5);
  const statusClass = REPAIR_QUEUE_STATUS_STYLE[repairQueue.status] || REPAIR_QUEUE_STATUS_STYLE.blocked;

  const runOperations = (items, label) => {
    if (!project?.id || !onProjectUpdate || !items.length) return;
    onProjectUpdate(project.id, (prev) => {
      const operations = items.map((item) => item.operation).filter(Boolean);
      const operationResult = applyAgentOperations(prev, operations, { action: 'repair_queue' });
      const next = operationResult.project;
      return {
        ...next,
        control: {
          ...(next.control || {}),
          lastAction: 'gui_run_repair_queue',
          lastUpdatedAt: Date.now(),
          events: [
            createGuiEvent(label, 'gui-repair-queue'),
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
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-gdpro-text">{panelText(copy, 'repair', 'title', '生产修复清单')}</div>
            <div className="text-[10px] text-gdpro-text-muted mt-0.5">
              {copy?.panels?.repair?.summary
                ? copy.panels.repair.summary(repairQueue.stats.open, repairQueue.stats.safe, repairQueue.stats.manual)
                : `${repairQueue.stats.open} 个待处理 · ${repairQueue.stats.safe} 个可直接处理 · ${repairQueue.stats.manual} 个需确认`}
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${statusClass}`}>
            {controlStatus(copy, repairQueue.status)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-gdpro-success leading-none">{repairQueue.stats.safe}</div>
            <div className="text-gdpro-text-muted mt-1 truncate">{panelText(copy, 'repair', 'safe', '可一键处理')}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-gdpro-warning leading-none">{repairQueue.stats.manual}</div>
            <div className="text-gdpro-text-muted mt-1 truncate">{panelText(copy, 'repair', 'manual', '人工确认')}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-gdpro-danger leading-none">{repairQueue.stats.blocked}</div>
            <div className="text-gdpro-text-muted mt-1 truncate">{panelText(copy, 'repair', 'blocked', '阻断')}</div>
          </div>
        </div>
      </div>

      {topItems.length > 0 ? (
        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
          {topItems.map((item) => {
            const priorityClass = RISK_STYLE[item.priority] || RISK_STYLE.info;
            return (
              <div key={item.id} className={`rounded-md border px-2 py-1.5 ${priorityClass}`}>
                <div className="flex items-start gap-2">
                  <StatusIcon ok={false} blocker={item.status === 'blocked'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold truncate">{controlText(copy, item.title)}</span>
                      <span className="text-[9px] font-semibold shrink-0">{controlText(copy, priorityLabel(item.priority))}</span>
                    </div>
                    <p className="text-[10px] leading-relaxed opacity-85 mt-0.5 line-clamp-2">{controlText(copy, item.detail)}</p>
                    {item.operation && (
                      <div className="mt-1 text-[9px] opacity-75 truncate">
                        {item.autoRunnable
                          ? panelText(copy, 'repair', 'runnable', '可直接处理')
                          : panelText(copy, 'repair', 'confirm', '需要你确认')}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[9px] opacity-80 truncate flex-1">{controlText(copy, item.evidence)}</span>
                  {item.operation ? (
                    <button
                      type="button"
                      onClick={() => runOperations([item], `已处理修复项：${item.title}`)}
                      className="px-2 py-1 rounded-md bg-gdpro-bg-elevated/80 border border-current/20 text-[10px] font-semibold hover:bg-gdpro-bg-hover transition-colors shrink-0"
                      title={item.autoRunnable ? '处理这项修复' : '查看这项修复'}
                    >
                      {controlText(copy, item.actionLabel)}
                    </button>
                  ) : (
                    <span className="px-2 py-1 rounded-md border border-current/20 text-[10px] font-semibold shrink-0">
                      {controlText(copy, '手动')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-gdpro-success/20 bg-gdpro-success/10 px-3 py-2">
          <div className="text-[11px] font-semibold text-gdpro-success">{panelText(copy, 'repair', 'emptyTitle', '修复队列为空')}</div>
          <p className="text-[10px] leading-relaxed text-gdpro-success/85 mt-1">
            {panelText(copy, 'repair', 'emptyBody', '当前没有需要马上处理的生产修复项。')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => runOperations(runnableItems, '安全修复已处理')}
          disabled={!runnableItems.length}
          className="gdpro-button flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PenTool className="w-3.5 h-3.5" strokeWidth={2.5} />
          {panelText(copy, 'repair', 'run', '处理安全修复')}
        </button>
        <button
          type="button"
          onClick={() => onAction?.('请读取生产修复清单，按优先级说明哪些可直接处理、哪些需要人工确认，并给出下一步处理建议。', 'inspect_repair_queue')}
          className="px-3 py-[7px] rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-[12px] text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
        >
          {panelText(copy, 'repair', 'inspect', '检查')}
        </button>
      </div>
    </div>
  );
}

function DesignBriefContractPanel({ project, designBriefContract, onProjectUpdate, onAction, copy }) {
  if (!designBriefContract) return null;

  const statusClass = BRIEF_CONTRACT_STATUS_STYLE[designBriefContract.status] || BRIEF_CONTRACT_STATUS_STYLE.blocked;
  const blockingViolations = designBriefContract.violations.filter((item) => ['critical', 'high'].includes(item.severity));
  const canCompile = !blockingViolations.length && !designBriefContract.locked;
  const topChecks = designBriefContract.checks.filter((item) => item.required).slice(0, 3);
  const topTargets = designBriefContract.targets.slice(0, 4);

  const compileContract = () => {
    if (!project?.id || !onProjectUpdate) return;
    onProjectUpdate(project.id, (prev) => {
      const operationResult = applyAgentOperations(prev, [{
        id: 'gui_compile_design_brief_contract',
        type: 'compile_design_brief_contract',
        params: {},
        reason: '界面锁定了需求约定书。',
      }], { action: 'brief_contract' });
      const next = operationResult.project;
      return {
        ...next,
        control: {
          ...(next.control || {}),
          lastAction: 'gui_compile_design_brief_contract',
          lastUpdatedAt: Date.now(),
          events: [
            createGuiEvent('需求约定书已锁定', 'gui-brief-contract'),
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
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-gdpro-text">{copy.briefContract.title}</div>
            <div className="text-[10px] text-gdpro-text-muted mt-0.5">
              {copy.briefContract.summary(designBriefContract.readiness, designBriefContract.stats.targets)}
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${statusClass}`}>
            {controlText(copy, friendlyStatus(designBriefContract.status))}
          </span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-gdpro-bg-surface overflow-hidden">
          <div
            className={`h-full rounded-full ${designBriefContract.locked ? 'bg-gdpro-success' : canCompile ? 'bg-gdpro-info' : 'bg-gdpro-danger'}`}
            style={{ width: `${Math.max(4, designBriefContract.readiness)}%` }}
          />
        </div>
        <div className="mt-2 text-[10px] text-gdpro-text-muted truncate">
          {copy.briefContract.version(designBriefContract.sourceRevision)}
        </div>
      </div>

      <div className="space-y-1.5">
        {topChecks.map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-[10px]">
            <StatusIcon ok={item.passed} blocker={!item.passed && ['critical', 'high'].includes(item.severity)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gdpro-text-secondary truncate">{controlText(copy, item.label)}</span>
                <span className="text-[9px] text-gdpro-text-muted shrink-0">{controlText(copy, item.evidence)}</span>
              </div>
              {!item.passed && (
                <p className="text-[9px] leading-relaxed text-gdpro-danger mt-0.5 line-clamp-2">{controlText(copy, item.detail)}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {topTargets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topTargets.map((target) => (
            <span
              key={target.templateId}
              className={`px-1.5 py-[2px] rounded border text-[9px] font-semibold ${target.present ? RISK_STYLE.stable : RISK_STYLE.high}`}
            >
              {controlText(copy, target.name)}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={compileContract}
          disabled={!canCompile}
          className="gdpro-button flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <LockKeyhole className="w-3.5 h-3.5" strokeWidth={2.5} />
          {copy.briefContract.lock}
        </button>
        <button
          type="button"
          onClick={() => onAction?.('请读取需求约定书，列出缺失的品牌意图、物料目标和会导致创作结果偏离的约束缺口，并优先给出锁定约定或补齐证据的操作建议。', 'inspect_design_brief_contract')}
          className="px-3 py-[7px] rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-[12px] text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
        >
          {copy.briefContract.check}
        </button>
      </div>
    </div>
  );
}

function DesignScorecardPanel({ designScorecard, onAction, copy }) {
  if (!designScorecard) return null;

  const statusClass = SCORECARD_STATUS_STYLE[designScorecard.status] || SCORECARD_STATUS_STYLE.blocked;
  const dimensions = designScorecard.dimensions || [];
  const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  const topIssues = (designScorecard.issues || []).slice(0, 3);
  const barClass = designScorecard.passed
    ? 'bg-gdpro-success'
    : designScorecard.score >= 70
      ? 'bg-gdpro-warning'
      : 'bg-gdpro-danger';

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-gdpro-text">{panelText(copy, 'scorecard', 'title', '设计总监评分')}</div>
            <div className="text-[10px] text-gdpro-text-muted mt-0.5">
              {copy?.panels?.scorecard?.summary
                ? copy.panels.scorecard.summary(designScorecard.threshold, designScorecard.grade)
                : `通过线 ${designScorecard.threshold}/100 · 等级 ${designScorecard.grade}`}
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${statusClass}`}>
            {controlStatus(copy, designScorecard.status)}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="text-[32px] font-semibold leading-none text-gdpro-text">
            {designScorecard.score}
          </div>
          <div className="text-right text-[10px] leading-relaxed text-gdpro-text-muted">
            <div>{designScorecard.stats.critical} {panelText(copy, 'scorecard', 'critical', '严重')}</div>
            <div>{designScorecard.stats.high} {panelText(copy, 'scorecard', 'highRisk', '高风险')}</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-gdpro-bg-surface overflow-hidden">
          <div
            className={`h-full rounded-full ${barClass}`}
            style={{ width: `${Math.max(4, designScorecard.score)}%` }}
          />
        </div>
        {weakest && (
          <div className="mt-2 text-[10px] text-gdpro-text-muted">
            {panelText(copy, 'scorecard', 'weakest', '最需提升：')}<span className="text-gdpro-text-secondary">{controlText(copy, weakest.label)}</span> · {weakest.score}/100
          </div>
        )}
      </div>

      <div className="space-y-2">
        {dimensions.map((dimension) => (
          <div key={dimension.id}>
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-gdpro-text-secondary truncate">{controlText(copy, dimension.label)}</span>
              <span className="font-semibold text-gdpro-text shrink-0">{dimension.score}</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-gdpro-bg-surface overflow-hidden">
              <div
                className={`h-full rounded-full ${dimension.score >= 85 ? 'bg-gdpro-success' : dimension.score >= 70 ? 'bg-gdpro-warning' : 'bg-gdpro-danger'}`}
                style={{ width: `${Math.max(4, dimension.score)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {topIssues.length > 0 && (
        <div className="space-y-1.5">
          {topIssues.map((item) => (
            <div
              key={item.id}
              className={`rounded-md border px-2 py-1.5 ${item.severity === 'critical' ? RISK_STYLE.critical : item.severity === 'high' ? RISK_STYLE.high : RISK_STYLE.medium}`}
            >
              <div className="text-[10px] font-semibold truncate">{controlText(copy, item.title)}</div>
              <p className="text-[9px] leading-relaxed opacity-80 mt-0.5 line-clamp-2">{controlText(copy, item.fix || item.detail)}</p>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onAction?.('请读取设计总监评分，按最低分维度和阻断问题给出下一步最小修复事项，并优先返回可直接处理的建议。', 'inspect_design_scorecard')}
        className="w-full px-3 py-[7px] rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-[12px] text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
      >
        {panelText(copy, 'scorecard', 'inspect', '检查评分')}
      </button>
    </div>
  );
}

function ProductionImpactPanel({ project, productionImpact, onProjectUpdate, onAction, copy }) {
  if (!productionImpact) return null;

  const statusClass = IMPACT_STATUS_STYLE[productionImpact.status] || IMPACT_STATUS_STYLE.blocked;
  const topItems = productionImpact.items.slice(0, 4);
  const safeItems = productionImpact.items.filter((item) => item.autoRunnable && item.operation);

  const runImpactOperations = (items, label) => {
    if (!project?.id || !onProjectUpdate || !items.length) return;
    onProjectUpdate(project.id, (prev) => {
      const operations = items.map((item) => item.operation).filter(Boolean);
      const operationResult = applyAgentOperations(prev, operations, { action: 'production_impact' });
      const next = operationResult.project;
      return {
        ...next,
        control: {
          ...(next.control || {}),
          lastAction: 'gui_run_production_impact',
          lastUpdatedAt: Date.now(),
          events: [
            createGuiEvent(label, 'gui-production-impact'),
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
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-gdpro-text">{panelText(copy, 'impact', 'title', '生产影响范围')}</div>
            <div className="text-[10px] text-gdpro-text-muted mt-0.5">
              {copy?.panels?.impact?.summary
                ? copy.panels.impact.summary(productionImpact.stats.total, productionImpact.stats.safe, productionImpact.stats.blocked)
                : `${productionImpact.stats.total} 个影响 · ${productionImpact.stats.safe} 个可处理 · ${productionImpact.stats.blocked} 个阻断`}
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${statusClass}`}>
            {controlStatus(copy, productionImpact.status)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-gdpro-danger leading-none">{productionImpact.stats.critical}</div>
            <div className="text-gdpro-text-muted mt-1 truncate">{panelText(copy, 'impact', 'critical', '严重')}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-gdpro-warning leading-none">{productionImpact.stats.high}</div>
            <div className="text-gdpro-text-muted mt-1 truncate">{panelText(copy, 'impact', 'highRisk', '高风险')}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-gdpro-info leading-none">{productionImpact.stats.stale}</div>
            <div className="text-gdpro-text-muted mt-1 truncate">{panelText(copy, 'impact', 'needsUpdate', '需更新')}</div>
          </div>
        </div>
      </div>

      {topItems.length > 0 ? (
        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
          {topItems.map((item) => {
            const itemClass = RISK_STYLE[item.severity] || RISK_STYLE.info;
            return (
              <div key={item.id} className={`rounded-md border px-2 py-1.5 ${itemClass}`}>
                <div className="flex items-start gap-2">
                  <StatusIcon ok={false} blocker={item.status === 'blocked'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold truncate">{controlText(copy, item.title)}</span>
                      <span className="text-[9px] font-semibold shrink-0">{controlStatus(copy, item.status)}</span>
                    </div>
                    <p className="text-[10px] leading-relaxed opacity-85 mt-0.5 line-clamp-2">{controlText(copy, item.detail)}</p>
                    <div className="text-[9px] opacity-75 mt-1 truncate">
                      {panelText(copy, 'impact', 'impactPrefix', '影响：')}{controlText(copy, artifactLabel(item.artifact))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-gdpro-success/20 bg-gdpro-success/10 px-3 py-2">
          <div className="text-[11px] font-semibold text-gdpro-success">{panelText(copy, 'impact', 'emptyTitle', '下游产物正常')}</div>
          <p className="text-[10px] leading-relaxed text-gdpro-success/85 mt-1">{panelText(copy, 'impact', 'emptyBody', '当前没有检测到下游失效或待修复影响。')}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => runImpactOperations(safeItems, '影响修复已处理')}
          disabled={!safeItems.length}
          className="gdpro-button flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PenTool className="w-3.5 h-3.5" strokeWidth={2.5} />
          {panelText(copy, 'impact', 'run', '处理影响修复')}
        </button>
        <button
          type="button"
          onClick={() => onAction?.('请读取生产影响范围，说明当前哪些上游变更导致哪些下游产物失效，并按依赖顺序返回最小处理建议。', 'inspect_production_impact')}
          className="px-3 py-[7px] rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-[12px] text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
        >
          {panelText(copy, 'impact', 'inspect', '检查')}
        </button>
      </div>
    </div>
  );
}

function ReviewBoardPanel({ project, reviewBoard, onProjectUpdate, onAction, copy }) {
  if (!reviewBoard) return null;

  const topItems = reviewBoard.items.slice(0, 6);
  const pendingItems = reviewBoard.items.filter((item) => item.status === 'pending');
  const statusClass = REVIEW_BOARD_STATUS_STYLE[reviewBoard.status] || REVIEW_BOARD_STATUS_STYLE.blocked;

  const recordDecision = (item, decision) => {
    if (!project?.id || !onProjectUpdate || !item?.targetId) return;
    onProjectUpdate(project.id, (prev) => {
      const operationResult = applyAgentOperations(prev, [{
        id: `review_${item.id}_${decision}`,
        type: 'record_review_decision',
        params: {
          targetId: item.targetId,
          decision,
          reviewer: 'gui',
          reviewerRole: 'design-director',
          note: decision === 'approved'
            ? `已签收 ${item.label}。`
            : `已要求修改 ${item.label}。`,
        },
        reason: `界面对 ${item.label} 做出签收决定`,
      }], { action: 'review_board' });
      const next = operationResult.project;
      return {
        ...next,
        control: {
          ...(next.control || {}),
          lastAction: 'gui_record_review_decision',
          lastUpdatedAt: Date.now(),
          events: [
            createGuiEvent(`${friendlyStatus(decision)}：${item.label}`, 'gui-review-decision'),
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
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-gdpro-text">{panelText(copy, 'review', 'title', '签收看板')}</div>
            <div className="text-[10px] text-gdpro-text-muted mt-0.5">
              {copy?.panels?.review?.summary
                ? copy.panels.review.summary(reviewBoard.stats.approved, reviewBoard.stats.total, reviewBoard.stats.pending, reviewBoard.stats.blocked)
                : `${reviewBoard.stats.approved}/${reviewBoard.stats.total} 已签收 · ${reviewBoard.stats.pending} 待确认 · ${reviewBoard.stats.blocked} 需修复`}
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold shrink-0 ${statusClass}`}>
            {controlStatus(copy, reviewBoard.status)}
          </span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-gdpro-bg-surface overflow-hidden">
          <div
            className={`h-full rounded-full ${reviewBoard.signed ? 'bg-gdpro-success' : 'bg-gdpro-warning'}`}
            style={{ width: `${Math.max(4, Math.round((reviewBoard.stats.approved / Math.max(1, reviewBoard.stats.total)) * 100))}%` }}
          />
        </div>
        {pendingItems.length > 0 && (
          <button
            type="button"
            onClick={() => recordDecision(pendingItems[0], 'approved')}
            className="mt-3 w-full gdpro-button flex items-center justify-center gap-1.5 py-1.5 text-[11px]"
          >
            <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
            {panelText(copy, 'review', 'approveNext', '批准下一项')}
          </button>
        )}
      </div>

      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {topItems.map((item) => {
          const isApproved = ['approved', 'system-pass'].includes(item.status);
          const isBlocked = item.status === 'blocked';
          const itemClass = isApproved
            ? RISK_STYLE.stable
            : isBlocked
              ? RISK_STYLE.critical
              : RISK_STYLE.medium;
          return (
            <div key={item.id} className={`rounded-md border px-2 py-1.5 ${itemClass}`}>
              <div className="flex items-start gap-2">
                <StatusIcon ok={isApproved} blocker={isBlocked} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold truncate">{controlText(copy, item.label)}</span>
                    <span className="text-[9px] font-semibold shrink-0">{controlStatus(copy, item.status)}</span>
                  </div>
                  <p className="text-[10px] leading-relaxed opacity-85 mt-0.5 line-clamp-2">{controlText(copy, item.detail)}</p>
                  <div className="text-[9px] opacity-75 mt-1 truncate">{controlText(copy, reviewEvidenceLabel(item.evidence))}</div>
                  {item.decision && (
                    <div className="text-[9px] opacity-80 mt-1 truncate">
                      {controlStatus(copy, item.decision.decision)} · {panelText(copy, 'review', 'reviewer', '评审人')}
                    </div>
                  )}
                </div>
              </div>
              {item.status === 'pending' && (
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => recordDecision(item, 'approved')}
                    className="px-2 py-1 rounded-md bg-gdpro-bg-elevated/80 border border-current/20 text-[10px] font-semibold hover:bg-gdpro-bg-hover transition-colors"
                  >
                    {panelText(copy, 'review', 'approve', '批准')}
                  </button>
                  <button
                    type="button"
                    onClick={() => recordDecision(item, 'changes_requested')}
                    className="px-2 py-1 rounded-md bg-gdpro-bg-elevated/80 border border-current/20 text-[10px] font-semibold hover:bg-gdpro-bg-hover transition-colors"
                  >
                    {panelText(copy, 'review', 'changes', '需修改')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => pendingItems[0] && recordDecision(pendingItems[0], 'approved')}
          disabled={!pendingItems.length}
          className="gdpro-button flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
          {panelText(copy, 'review', 'approveNext', '批准下一项')}
        </button>
        <button
          type="button"
          onClick={() => onAction?.('请读取签收看板，列出需修复、待确认、已签收项，说明哪些可以批准，哪些必须先修复，并只在用户确认后返回签收操作。', 'inspect_review_board')}
          className="px-3 py-[7px] rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-[12px] text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
        >
          {panelText(copy, 'review', 'inspect', '检查')}
        </button>
      </div>
    </div>
  );
}

export default function DesignControlPanel({ project, contextSummary, onAction, onProjectUpdate, uiLanguage }) {
  const state = buildDesignControlState(project);
  const copy = uiText('designControl', uiLanguage);
  const requiredLocks = state.locks.filter((lock) => lock.required);
  const optionalLocks = state.locks.filter((lock) => !lock.required).slice(0, 3);
  const controlEvents = state.controlEvents || [];
  const operationResults = state.operationResults || [];
  const repairQueue = state.repairQueue;
  const designBriefContract = state.designBriefContract;
  const designScorecard = state.designScorecard;
  const productionImpact = state.productionImpact;
  const reviewBoard = state.reviewBoard;
  const brandConsistencyKit = state.brandConsistencyKit;
  const partnerTask = project?.control?.workflowRunPartnerTask || null;
  const partnerReport = project?.control?.workflowRunReport || null;
  const partnerReceipt = project?.control?.workflowRunPartnerTaskReceipt || null;
  const riskTone = state.riskLevel === 'critical'
    ? 'danger'
    : state.riskLevel === 'high'
      ? 'warning'
      : 'success';
  const riskLabel = copy.riskLabels?.[state.riskLevel] || RISK_LABELS[state.riskLevel] || state.riskLevel;

  return (
    <aside className="hidden xl:flex w-[360px] shrink-0 flex-col border-l border-gdpro-border bg-gdpro-bg-sidebar">
      <div className="px-4 py-3 border-b border-gdpro-border">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-gdpro-accent" strokeWidth={2} />
              <h2 className="text-[13px] font-semibold text-gdpro-text">{copy.title}</h2>
            </div>
            <p className="text-[10px] text-gdpro-text-muted mt-1">{copy.subtitle}</p>
          </div>
          <div className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${RISK_STYLE[state.riskLevel] || RISK_STYLE.info}`}>
            {riskLabel}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        <Section title={copy.sections.delivery} icon={Gauge}>
          <div className="grid grid-cols-3 gap-2">
            <Metric label={copy.metrics.readiness} value={`${state.readiness}%`} tone={riskTone} />
            <Metric label={copy.metrics.adoptedAssets} value={state.stats.adoptedAssets} tone="success" />
            <Metric label={copy.metrics.documents} value={state.stats.documents} />
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-gdpro-bg-surface overflow-hidden">
            <div
              className="h-full rounded-full bg-gdpro-accent"
              style={{ width: `${Math.max(4, state.readiness)}%` }}
            />
          </div>
        </Section>

        <Section title={copy.sections.partnerHandoff} icon={Route}>
          <PartnerHandoffPanel
            project={project}
            task={partnerTask}
            report={partnerReport}
            receipt={partnerReceipt}
            onProjectUpdate={onProjectUpdate}
            onAction={onAction}
            copy={copy}
          />
        </Section>

        <Section title={copy.sections.brandKit} icon={PackageCheck}>
          <GlobalBrandKitLibraryPanel
            project={project}
            onProjectUpdate={onProjectUpdate}
          />
          <BrandKitPassportPanel
            brandKit={brandConsistencyKit}
            onAction={onAction}
            copy={copy}
          />
        </Section>

        <Section title={copy.sections.brief} icon={FileText}>
          <DesignBriefContractPanel
            project={project}
            designBriefContract={designBriefContract}
            onProjectUpdate={onProjectUpdate}
            onAction={onAction}
            copy={copy}
          />
        </Section>

        <Section title={copy.sections.affected} icon={Route}>
          <ProductionImpactPanel
            project={project}
            productionImpact={productionImpact}
            onProjectUpdate={onProjectUpdate}
            onAction={onAction}
            copy={copy}
          />
        </Section>

        <Section title={copy.sections.quality} icon={Gauge}>
          <DesignScorecardPanel
            designScorecard={designScorecard}
            onAction={onAction}
            copy={copy}
          />
        </Section>

        <Section
          title={copy.sections.flow}
          icon={Route}
          action={
            <button
              type="button"
              onClick={() => onAction?.(`请基于当前 ${state.outputPath.label} 路径，列出下一步最小处理事项，并说明哪些锁定项会被读取。`, 'inspect_output_path')}
              className="ml-auto text-[10px] px-2 py-1 rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
            >
              {copy.outputPath.inspect}
            </button>
          }
        >
          <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated p-3">
            <div className="flex items-center gap-2">
              <PenTool className="w-3.5 h-3.5 text-gdpro-accent" strokeWidth={2} />
              <span className="text-[13px] font-semibold text-gdpro-text">{controlText(copy, state.outputPath.label)}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-gdpro-text-secondary mt-2">{controlText(copy, state.outputPath.description)}</p>
            {state.phaseState?.objective && (
              <p className="text-[11px] leading-relaxed text-gdpro-text-muted mt-2">
                {copy.outputPath.objective}{controlText(copy, state.phaseState.objective)}
              </p>
            )}
            {state.phaseState?.outputKeys?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {state.phaseState.outputKeys.map((key) => (
                  <span key={key} className="px-1.5 py-[2px] rounded bg-gdpro-bg-surface border border-gdpro-border text-[10px] text-gdpro-text-muted">
                    {controlText(copy, outputKeyLabel(key))}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section title={copy.sections.fixList} icon={Workflow}>
          <RepairQueuePanel
            project={project}
            repairQueue={repairQueue}
            onProjectUpdate={onProjectUpdate}
            onAction={onAction}
            copy={copy}
          />
        </Section>

        <Section title={copy.sections.signoff} icon={ShieldCheck}>
          <ReviewBoardPanel
            project={project}
            reviewBoard={reviewBoard}
            onProjectUpdate={onProjectUpdate}
            onAction={onAction}
            copy={copy}
          />
        </Section>

        {operationResults.length > 0 && (
          <Section title={copy.sections.history} icon={Workflow}>
            <OperationResultsPanel operationResults={operationResults} copy={copy} />
          </Section>
        )}

        <Section title={copy.sections.materials} icon={Workflow}>
          <MaterialProductionPanel
            project={project}
            materialPlan={state.materialPlan}
            manifest={state.manifest}
            onProjectUpdate={onProjectUpdate}
            onAction={onAction}
            copy={copy}
          />
        </Section>

        <Section title={copy.sections.finalCheck} icon={ShieldCheck}>
          <PreflightReviewPanel
            project={project}
            preflightReview={state.preflightReview}
            onProjectUpdate={onProjectUpdate}
            onAction={onAction}
            copy={copy}
          />
        </Section>

        {state.phase >= 5 && (
          <Section title={copy.sections.package} icon={Archive}>
            <DeliveryPackagePanel
              project={project}
              deliveryPackage={state.deliveryPackage}
              onProjectUpdate={onProjectUpdate}
              onAction={onAction}
              copy={copy}
            />
          </Section>
        )}

        <Section title={copy.sections.brandAssets} icon={PackageCheck}>
          <AssetManifestPanel
            project={project}
            manifest={state.manifest}
            onProjectUpdate={onProjectUpdate}
            onAction={onAction}
            copy={copy}
          />
        </Section>

        <Section title={copy.sections.brandRules} icon={Palette}>
          <BrandTokenEditor project={project} onProjectUpdate={onProjectUpdate} />
        </Section>

        <Section title={copy.sections.lockedRules} icon={LockKeyhole}>
          <div className="space-y-2">
            {requiredLocks.map((lock) => (
              <div key={lock.id} className="flex items-start gap-2 min-w-0">
                <StatusIcon ok={lock.locked} blocker />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-gdpro-text">{lock.label}</span>
                    <span className="text-[9px] text-gdpro-text-muted">P{lock.phase}</span>
                  </div>
                  <p className="text-[10px] text-gdpro-text-muted truncate" title={lock.value}>{lock.value}</p>
                </div>
              </div>
            ))}
            {optionalLocks.length > 0 && (
              <div className="pt-2 mt-2 border-t border-gdpro-border/70">
                <p className="text-[10px] text-gdpro-text-muted mb-2">{copy.lockedRules.later}</p>
                {optionalLocks.map((lock) => (
                  <div key={lock.id} className="flex items-center gap-2 text-[11px] text-gdpro-text-secondary mb-1.5">
                    <Circle className="w-3 h-3 text-gdpro-text-muted" strokeWidth={2} />
                    <span className="truncate">{lock.label}</span>
                    <span className="ml-auto text-[9px] text-gdpro-text-muted">P{lock.phase}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section
          title={copy.sections.checkpoints}
          icon={ShieldCheck}
          action={
            <button
              type="button"
              onClick={() => onAction?.('请检查当前阶段，只输出通过项、阻断项、补齐事项和是否允许推进。', 'run_phase_gate')}
              className="ml-auto text-[10px] px-2 py-1 rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
            >
              {copy.inspect}
            </button>
          }
        >
          <div className="space-y-2">
            {state.gates.map((gate) => (
              <div key={gate.id} className="flex items-start gap-2">
                <StatusIcon ok={gate.passed} blocker={gate.blocker} />
                <div className="min-w-0">
                  <p className="text-[12px] text-gdpro-text-secondary leading-snug">{gate.label}</p>
                  {!gate.passed && (
                    <p className="text-[10px] text-gdpro-text-muted mt-0.5">{gate.blocker ? copy.gateBlocked : copy.gateSuggested}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={copy.sections.worklist} icon={Workflow}>
          <PhaseTaskList project={project} phaseState={state.phaseState} onProjectUpdate={onProjectUpdate} />
        </Section>

        <Section
          title={copy.sections.risks}
          icon={AlertTriangle}
          action={
            <button
              type="button"
              onClick={() => onAction?.('请基于已采纳资产和品牌档案，做一次跨物料一致性扫描，输出风险和修复动作。', 'run_consistency_scan')}
              className="ml-auto text-[10px] px-2 py-1 rounded-md bg-gdpro-bg-elevated border border-gdpro-border text-gdpro-text-secondary hover:text-gdpro-text transition-colors"
            >
              {copy.scan}
            </button>
          }
        >
          <div className="space-y-2">
            {state.risks.map((risk) => (
              <div key={risk.id} className={`rounded-lg border px-3 py-2 ${RISK_STYLE[risk.level] || RISK_STYLE.info}`}>
                <div className="text-[12px] font-semibold">{risk.title}</div>
                <p className="text-[11px] leading-relaxed mt-1 opacity-85">{risk.detail}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title={copy.sections.context} icon={FileText}>
          <pre className="whitespace-pre-wrap text-[10px] leading-relaxed text-gdpro-text-muted font-sans">
            {contextSummary || copy.contextFallback}
          </pre>
        </Section>

        {controlEvents.length > 0 && (
          <Section title={copy.sections.decisions} icon={Workflow}>
            <div className="space-y-2">
              {controlEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-gdpro-text truncate">{event.label}</span>
                    <span className="text-[9px] text-gdpro-text-muted shrink-0">{copy.recorded}</span>
                  </div>
                  {event.detail && (
                    <p className="text-[10px] leading-relaxed text-gdpro-text-muted mt-1 line-clamp-2">{event.detail}</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gdpro-border">
        <button
          type="button"
          onClick={() => onAction?.('请给出当前项目的商用化修复清单：按控制层、UI、资产一致性、交付风险四类排序。', 'production_repair_plan')}
          className="w-full gdpro-button flex items-center justify-center gap-2"
        >
          <PackageCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
          {copy.repairPlan}
        </button>
      </div>
    </aside>
  );
}
