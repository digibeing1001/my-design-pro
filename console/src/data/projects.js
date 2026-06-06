import { createWorkflowSeed } from '../lib/phaseStateMachine';

export const ASSET_CATEGORIES = [
  { id: 'logo', name: 'Logo / 品牌标识', icon: '标', color: '#E8A838' },
  { id: 'product', name: '产品图', icon: '品', color: '#5AE88A' },
  { id: 'scene', name: '场景照片', icon: '景', color: '#5A9EE8' },
  { id: 'reference', name: '参考图', icon: '参', color: '#E85AE8' },
  { id: 'draft', name: '设计稿', icon: '稿', color: '#E8E838' },
  { id: 'deliverable', name: '交付物', icon: '交', color: '#E85A5A' },
  { id: 'report', name: '审查报告', icon: '审', color: '#8A8A95' },
];

export const PHASES = [
  { id: 1, name: '需求追问', nameEn: 'Clarify', icon: '需' },
  { id: 2, name: '竞品分析', nameEn: 'Strategy', icon: '策' },
  { id: 3, name: '样稿方向', nameEn: 'Concept', icon: '稿' },
  { id: 4, name: '物料扩展', nameEn: 'Extend', icon: '物' },
  { id: 5, name: '合规审查', nameEn: 'Review', icon: '审' },
  { id: 6, name: '落地交付', nameEn: 'Deliver', icon: '交' },
];

export function createProject(name, brandName = '') {
  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name || '未命名项目',
    brandName: brandName || name || '',
    status: 'active',
    currentPhase: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    documents: {},
    assets: {},
    brandKit: {
      colors: [],
      typography: {},
      philosophy: '',
      slogan: '',
    },
    workflow: createWorkflowSeed(1, { mode: 'medium', approvalPolicy: 'phase-gated' }),
  };
}

export const DEMO_PROJECTS = [
  {
    id: 'demo_nebula',
    name: '星云咖啡',
    brandName: '星云咖啡 Nebula Coffee',
    status: 'active',
    currentPhase: 3,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 3600000,
    brandKit: {
      slogan: '每一杯都是星空',
      philosophy: '宇宙中最温暖的角落',
      colors: [
        { name: '深空蓝', hex: '#14213D', usage: '主色 60%' },
        { name: '星云金', hex: '#D6A94A', usage: '辅助色 30%' },
        { name: '暖白', hex: '#F7F3EA', usage: '留白 10%' },
      ],
      typography: {
        display: '思源宋体 SemiBold',
        body: '思源黑体 Regular',
      },
    },
    workflow: createWorkflowSeed(3, { mode: 'deep', approvalPolicy: 'phase-gated' }),
    documents: {
      brief: {
        title: '需求简报',
        content: '# 星云咖啡 设计需求简报\n\n## 品牌信息\n- **品牌名**：星云咖啡 Nebula Coffee\n- **行业**：餐饮/咖啡\n- **目标受众**：25-35岁一线城市白领，注重生活品质\n\n## 设计方向\n- **调性关键词**：极简克制 / 温暖亲和 / 专业可信\n- **应用场景**：Logo、名片、招牌、社交媒体图、包装\n\n## 参考与约束\n- **竞品参考**：% Arabica、Blue Bottle、Manner\n- **硬性约束**：必须使用真实 Logo，禁用模型重绘',
        phase: 1,
        adoptedAt: Date.now() - 86400000 * 3,
      },
      philosophy: {
        title: '设计哲学',
        content: '# 星云咖啡 设计哲学\n\n## 核心主张\n「宇宙中最温暖的角落」\n\n## 视觉 DNA\n- 色彩比例：深空蓝 60% + 星云金 30% + 暖白 10%\n- 字体层级：思源宋体 Display / 思源黑体 Body\n- 图形规则：圆角几何 + 星点纹理\n\n## 情绪关键词\n静谧、深邃、温暖、精致\n\n## 禁忌\n- 不使用直角尖锐图形\n- 不使用高饱和度色彩\n- 不使用装饰性无意义元素',
        phase: 2,
        adoptedAt: Date.now() - 86400000 * 2,
      },
    },
    assets: {
      logo: [
        { id: 'a1', name: 'logo-primary-v1.svg', category: 'logo', status: 'adopted', phase: 3, type: 'svg', size: 12400, adoptedAt: Date.now() - 86400000 },
        { id: 'a2', name: 'logo-mono-v1.png', category: 'logo', status: 'adopted', phase: 3, type: 'image', size: 45000, adoptedAt: Date.now() - 86400000 },
      ],
      draft: [
        { id: 'a3', name: 'business-card-v1.png', category: 'draft', status: 'adopted', phase: 4, type: 'image', size: 320000, adoptedAt: Date.now() - 3600000 },
        { id: 'a4', name: 'poster-v1.png', category: 'draft', status: 'pending', phase: 4, type: 'image', size: 580000, adoptedAt: null },
      ],
      reference: [
        { id: 'a5', name: 'arabica-ref.jpg', category: 'reference', status: 'adopted', phase: 2, type: 'image', size: 210000, adoptedAt: Date.now() - 86400000 * 2 },
      ],
    },
  },
  {
    id: 'demo_tech',
    name: '极客科技官网',
    brandName: '极客科技 GeekTech',
    status: 'active',
    currentPhase: 2,
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 7200000,
    brandKit: {
      slogan: '',
      philosophy: '',
      colors: [],
      typography: {},
    },
    workflow: createWorkflowSeed(2, { mode: 'medium', approvalPolicy: 'phase-gated' }),
    documents: {
      brief: {
        title: '需求简报',
        content: '# 极客科技官网设计需求\n\n## 品牌信息\n- **品牌名**：极客科技 GeekTech\n- **行业**：科技/互联网\n- **目标受众**：B2B 企业客户、开发者',
        phase: 1,
        adoptedAt: Date.now() - 172800000,
      },
    },
    assets: {},
  },
];
