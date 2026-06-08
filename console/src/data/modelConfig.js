// 语言大模型预设（检测成功后会替换为用户实际可用的）
export const LANGUAGE_MODELS_PRESET = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', icon: 'GPT', desc: '通用最强，适合复杂设计推理' },
  { id: 'claude-sonnet', name: 'Claude 3.7 Sonnet', provider: 'Anthropic', icon: 'CL', desc: '审美理解强，适合设计分析' },
  { id: 'claude-opus', name: 'Claude 3.7 Opus', provider: 'Anthropic', icon: 'OP', desc: '深度推理，适合品牌战略' },
  { id: 'gemini-pro', name: 'Gemini 2.5 Pro', provider: 'Google', icon: 'GM', desc: '多模态强，适合图文分析' },
  { id: 'deepseek', name: 'DeepSeek-V3', provider: 'DeepSeek', icon: 'DS', desc: '中文理解强，性价比高' },
  { id: 'kimi', name: 'Kimi k1.5', provider: 'Moonshot', icon: 'KM', desc: '长上下文，适合文档分析' },
];

export const IMAGE_MODEL_CONFIG_SCHEMA_VERSION = 'gdpro.image-model-config.v1';

const IMAGE_CONNECTION_STORAGE_KEY = 'gdpro_image_model_connections';

function secretField(key, label, placeholder, help = '') {
  return { key, label, placeholder, help, type: 'password', required: true, secret: true };
}

function textField(key, label, placeholder, help = '', patch = {}) {
  return { key, label, placeholder, help, type: 'text', required: false, ...patch };
}

function capabilityProfile({
  role,
  outputs,
  strengths,
  guidanceZh,
  guidanceEn,
  handoffZh,
  handoffEn,
  editableSource = false,
  vectorOutput = false,
  finalDelivery = false,
  textReliability = 'medium',
}) {
  return {
    role,
    outputs,
    strengths,
    guidance: { zh: guidanceZh, en: guidanceEn },
    handoffRule: { zh: handoffZh, en: handoffEn },
    editableSource,
    vectorOutput,
    finalDelivery,
    textReliability,
  };
}

function buildDeliveryRoute(provider) {
  const capabilities = getImageProviderCapabilities(provider) || {};
  const finalDeliveryAllowed = Boolean(capabilities.finalDelivery);
  const editableSource = Boolean(capabilities.editableSource);
  const vectorOutput = Boolean(capabilities.vectorOutput);
  return {
    conceptAllowed: true,
    editableSource,
    vectorOutput,
    finalDeliveryAllowed,
    commercialUse: finalDeliveryAllowed ? 'source-candidate' : 'concept-only',
    finalAssetRule: capabilities.handoffRule || {
      zh: finalDeliveryAllowed
        ? '可作为源稿候选，但交付前仍需检查路径、色值、字体和授权记录。'
        : '只能作为概念预览或参考图，最终交付必须重建为可编辑源稿。',
      en: finalDeliveryAllowed
        ? 'Can be treated as a source candidate, but paths, colors, type, and rights still need final checks.'
        : 'Use this for concepts or references only. Final delivery must be rebuilt as editable source files.',
    },
  };
}

function buildCustomImageProvider(model = {}) {
  return {
    id: model.id,
    name: model.provider || model.name || '自定义工具',
    modelId: model.id,
    modelName: model.name || model.model || '自定义图片工具',
    provider: model.provider || '自定义工具',
    icon: model.icon || 'CU',
    region: '自定义',
    desc: model.desc || '团队自建或第三方图片工具',
    adapter: model.adapter || 'openai-compatible-images',
    protocol: model.protocol || 'openai-compatible',
    docsUrl: model.docsUrl || '',
    keyUrl: model.keyUrl || '',
    defaultValues: {
      apiKey: model.apiKey || '',
      baseUrl: model.baseUrl || '',
      model: model.model || model.name || '',
      size: model.size || '1024x1024',
    },
    fields: [
      secretField('apiKey', '授权码', '粘贴授权码'),
      textField('baseUrl', '服务地址（高级）', 'https://your-studio.example/v1', '没有特殊要求时保持默认'),
      textField('model', '模型名称', 'provider/model-id'),
      textField('size', '默认画幅', '1024x1024'),
    ],
    capabilities: capabilityProfile({
      role: 'custom',
      outputs: [{ zh: '团队定义', en: 'Team-defined' }],
      strengths: [
        { zh: '自定义工具', en: 'Custom tool' },
        { zh: '团队入口', en: 'Team entry point' },
      ],
      guidanceZh: '能力取决于团队工具配置。交付前必须由源稿检查确认格式与授权。',
      guidanceEn: 'Capabilities depend on the team tool. Confirm format and rights before delivery.',
      handoffZh: '默认按概念图处理，除非团队适配器明确返回可编辑源文件。',
      handoffEn: 'Treat as concept output unless the team adapter explicitly returns editable source files.',
    }),
  };
}

// 图像服务连接预设。字段以 GUI 配置为主，Gateway/Hermes/OpenClaw 可按 adapter 做实际调用。
export const IMAGE_PROVIDER_PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    modelId: 'gpt-image',
    modelName: 'GPT Image 2',
    provider: 'OpenAI',
    icon: 'OI',
    region: 'Global',
    desc: '指令跟随和图像编辑强，适合概念探索与精修',
    adapter: 'openai-images',
    protocol: 'openai-compatible',
    docsUrl: 'https://platform.openai.com/docs/guides/image-generation/',
    keyUrl: 'https://platform.openai.com/api-keys',
    defaultValues: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-image-2',
      size: '1024x1024',
    },
    fields: [
      secretField('apiKey', '访问密钥', 'sk-...', 'OpenAI Platform 中创建的访问密钥'),
      textField('baseUrl', '连接地址', 'https://api.openai.com/v1'),
      textField('model', '模型名称', 'gpt-image-2'),
      textField('size', '默认尺寸', '1024x1024'),
    ],
  },
  {
    id: 'recraft',
    name: 'Recraft',
    modelId: 'recraft-vector',
    modelName: 'Recraft Vector',
    provider: 'Recraft',
    icon: 'RC',
    region: 'Global',
    desc: '支持矢量、图标和品牌风格图形，适合可交付视觉资产',
    adapter: 'recraft-images',
    protocol: 'recraft-rest',
    docsUrl: 'https://www.recraft.ai/docs/api-reference/endpoints',
    keyUrl: 'https://www.recraft.ai/api',
    defaultValues: {
      baseUrl: 'https://external.api.recraft.ai/v1',
      model: 'recraftv4',
      style: 'vector_illustration',
      outputFormat: 'svg',
      size: '1024x1024',
    },
    fields: [
      secretField('apiKey', '访问密钥', '粘贴 Recraft 访问密钥', 'Recraft API 控制台创建的访问密钥'),
      textField('baseUrl', '连接地址', 'https://external.api.recraft.ai/v1'),
      textField('model', '模型名称', 'recraftv4'),
      textField('style', '视觉类型', 'vector_illustration', '例如 vector_illustration、icon、digital_illustration'),
      textField('outputFormat', '输出格式', 'svg'),
      textField('size', '默认尺寸', '1024x1024'),
    ],
  },
  {
    id: 'fal',
    name: 'fal.ai',
    modelId: 'fal-media',
    modelName: 'fal Multi-model',
    provider: 'fal.ai',
    icon: 'FA',
    region: 'Global',
    desc: '统一接入 FLUX、Recraft、Nano Banana 等媒体模型，适合团队快速切换',
    adapter: 'fal-model-api',
    protocol: 'fal',
    docsUrl: 'https://fal.ai/docs/model-api-reference',
    keyUrl: 'https://fal.ai/dashboard/keys',
    defaultValues: {
      baseUrl: 'https://fal.run',
      model: 'fal-ai/recraft-v3',
      size: '1024x1024',
      outputFormat: 'png',
    },
    fields: [
      secretField('apiKey', '访问密钥', '粘贴 fal 访问密钥', 'fal Dashboard 中创建的访问密钥'),
      textField('baseUrl', '连接地址', 'https://fal.run'),
      textField('model', '模型路径', 'fal-ai/recraft-v3', '可换成 fal-ai/nano-banana-2、fal-ai/flux-2 等模型路径'),
      textField('size', '默认尺寸', '1024x1024'),
      textField('outputFormat', '输出格式', 'png'),
    ],
  },
  {
    id: 'black-forest-labs',
    name: 'Black Forest Labs',
    modelId: 'flux-2',
    modelName: 'FLUX.2',
    provider: 'Black Forest Labs',
    icon: 'FL',
    region: 'Global',
    desc: '高质量开放模型体系，适合多参考图编辑和高控制度视觉探索',
    adapter: 'bfl-flux',
    protocol: 'bfl',
    docsUrl: 'https://docs.bfl.ai/flux_2/flux2_overview',
    keyUrl: 'https://api.bfl.ai',
    defaultValues: {
      baseUrl: 'https://api.bfl.ai/v1',
      model: 'flux-2-pro',
      size: '1024x1024',
      outputFormat: 'png',
    },
    fields: [
      secretField('apiKey', '访问密钥', '粘贴 BFL 访问密钥'),
      textField('baseUrl', '连接地址', 'https://api.bfl.ai/v1'),
      textField('model', '模型名称', 'flux-2-pro'),
      textField('size', '默认尺寸', '1024x1024'),
      textField('outputFormat', '输出格式', 'png'),
    ],
  },
  {
    id: 'volcengine',
    name: '火山引擎方舟',
    modelId: 'seedream',
    modelName: 'Seedream',
    provider: 'ByteDance / Volcengine',
    icon: 'SD',
    region: 'China',
    desc: '中文理解和多图参考能力强，适合品牌视觉探索',
    adapter: 'volcengine-ark-images',
    protocol: 'openai-compatible',
    docsUrl: 'https://www.volcengine.com/docs/6791/1541523',
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apikey',
    defaultValues: {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-seedream-5-0-260128',
      size: '2K',
      outputFormat: 'png',
    },
    fields: [
      secretField('apiKey', '访问密钥', '粘贴方舟访问密钥', '方舟控制台创建的长效访问密钥'),
      textField('baseUrl', '连接地址', 'https://ark.cn-beijing.volces.com/api/v3'),
      textField('model', '模型 ID', 'doubao-seedream-5-0-260128'),
      textField('size', '默认尺寸', '2K'),
      textField('outputFormat', '输出格式', 'png'),
    ],
  },
  {
    id: 'alibaba-dashscope',
    name: '阿里云百炼',
    modelId: 'wanxiang',
    modelName: '万相 2.7',
    provider: 'Alibaba Cloud DashScope',
    icon: 'WX',
    region: 'China / Global',
    desc: '中文物料和电商场景友好，支持生成、编辑和多参考图',
    adapter: 'dashscope-wanxiang',
    protocol: 'dashscope',
    docsUrl: 'https://www.alibabacloud.com/help/en/model-studio/wan-image-generation-and-editing-api-reference',
    keyUrl: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key',
    defaultValues: {
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
      model: 'wanx2.7-t2i',
      size: '1024*1024',
    },
    fields: [
      secretField('apiKey', '访问密钥', '粘贴百炼访问密钥', '百炼控制台创建的访问密钥'),
      textField('baseUrl', '连接地址', 'https://dashscope.aliyuncs.com/api/v1'),
      textField('model', '模型名称', 'wanx2.7-t2i'),
      textField('size', '默认尺寸', '1024*1024'),
    ],
  },
  {
    id: 'liblib-xingliu',
    name: 'LiblibAI 星流',
    modelId: 'liblib-star',
    modelName: '星流图像',
    provider: 'LiblibAI',
    icon: 'LL',
    region: 'China',
    desc: '国内创作社区与星流开放平台，适合本地设计师常用创作生态',
    adapter: 'liblib-xingliu',
    protocol: 'liblib-signed',
    docsUrl: 'https://www.liblib.art/apis?originSource=xingliu',
    keyUrl: 'https://www.liblib.art/apis?originSource=xingliu',
    defaultValues: {
      baseUrl: 'https://openapi.liblibai.cloud',
      model: 'Star-3 Alpha',
      templateUuid: '5d7e67009b344550bc1aa6ccbfa1d7f4',
      size: '1024x1024',
    },
    fields: [
      secretField('accessKey', '官网授权码', '粘贴官网授权码', 'LiblibAI 开放平台生成的授权码'),
      secretField('secretKey', '安全码', '粘贴安全码', 'LiblibAI 开放平台生成的安全码'),
      textField('baseUrl', '连接地址', 'https://openapi.liblibai.cloud'),
      textField('templateUuid', '创作模板', '5d7e67009b344550bc1aa6ccbfa1d7f4', '默认是星流文生图模板，可替换为自己的工作流模板'),
      textField('model', '模型名称', 'Star-3 Alpha'),
      textField('size', '默认尺寸', '1024x1024'),
    ],
  },
  {
    id: 'tencent-hunyuan',
    name: '腾讯混元',
    modelId: 'hunyuan',
    modelName: '混元生图',
    provider: 'Tencent Cloud',
    icon: 'HY',
    region: 'China',
    desc: '中文审美和东方风格较强，可走兼容服务或官方服务',
    adapter: 'tencent-hunyuan-image',
    protocol: 'openai-compatible-or-tencent-cloud',
    docsUrl: 'https://cloud.tencent.com/document/product/1668/129429',
    keyUrl: 'https://cloud.tencent.com/document/product/1668/129430',
    defaultValues: {
      baseUrl: 'https://api.cloudai.tencent.com',
      model: 'hunyuan-image',
      region: 'ap-guangzhou',
    },
    fields: [
      secretField('apiKey', '访问密钥', '混元接入管理访问密钥', '兼容接口优先使用这个字段'),
      textField('baseUrl', '连接地址', 'https://api.cloudai.tencent.com'),
      textField('model', '模型名称', 'hunyuan-image'),
      textField('region', '地域', 'ap-guangzhou'),
      textField('secretId', '账号 ID（可选）', 'AKID...', '使用腾讯云标准接口时填写'),
      textField('secretKey', '账号密钥（可选）', '粘贴账号密钥', '使用腾讯云标准接口时填写', { type: 'password', secret: true }),
    ],
  },
  {
    id: 'stability',
    name: 'Stability AI',
    modelId: 'stable-image',
    modelName: 'Stable Image',
    provider: 'Stability AI',
    icon: 'ST',
    region: 'Global',
    desc: '风格覆盖广，适合 moodboard 与视觉方向探索',
    adapter: 'stability-image',
    protocol: 'stability-rest',
    docsUrl: 'https://platform.stability.ai/docs/getting-started/stable-image',
    keyUrl: 'https://platform.stability.ai/account/keys',
    defaultValues: {
      baseUrl: 'https://api.stability.ai',
      service: 'stable-image-ultra',
      outputFormat: 'png',
    },
    fields: [
      secretField('apiKey', '访问密钥', 'sk-...', 'Stability Platform 中创建的访问密钥'),
      textField('baseUrl', '连接地址', 'https://api.stability.ai'),
      textField('service', '服务/模型', 'stable-image-ultra'),
      textField('outputFormat', '输出格式', 'png'),
    ],
  },
  {
    id: 'replicate',
    name: 'Replicate',
    modelId: 'flux',
    modelName: 'FLUX',
    provider: 'Replicate / Black Forest Labs',
    icon: 'FX',
    region: 'Global',
    desc: '适合接入 FLUX 等开放模型，便于团队替换版本',
    adapter: 'replicate-predictions',
    protocol: 'replicate',
    docsUrl: 'https://replicate.com/docs/topics/predictions/create-a-prediction',
    keyUrl: 'https://replicate.com/account/api-tokens',
    defaultValues: {
      baseUrl: 'https://api.replicate.com/v1',
      model: 'black-forest-labs/flux-1.1-pro',
      size: '1024x1024',
    },
    fields: [
      secretField('apiToken', '访问令牌', 'r8_...', 'Replicate Account 中创建的访问令牌'),
      textField('baseUrl', '连接地址', 'https://api.replicate.com/v1'),
      textField('model', '模型路径', 'black-forest-labs/flux-1.1-pro'),
      textField('size', '默认尺寸', '1024x1024'),
    ],
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    modelId: 'ideogram',
    modelName: 'Ideogram',
    provider: 'Ideogram',
    icon: 'ID',
    region: 'Global',
    desc: '文字渲染和海报方向探索友好',
    adapter: 'ideogram-image',
    protocol: 'ideogram',
    docsUrl: 'https://developer.ideogram.ai/',
    keyUrl: 'https://developer.ideogram.ai/',
    defaultValues: {
      baseUrl: 'https://api.ideogram.ai',
      model: 'ideogram-v3',
      aspectRatio: '1:1',
    },
    fields: [
      secretField('apiKey', '访问密钥', 'Ideogram 访问密钥'),
      textField('baseUrl', '连接地址', 'https://api.ideogram.ai'),
      textField('model', '模型名称', 'ideogram-v3'),
      textField('aspectRatio', '默认比例', '1:1'),
    ],
  },
  {
    id: 'google',
    name: 'Google',
    modelId: 'imagen',
    modelName: 'Imagen 4',
    provider: 'Google',
    icon: 'IM',
    region: 'Global',
    desc: '自然图像质量稳定，适合参考图与概念视觉',
    adapter: 'google-imagen',
    protocol: 'google',
    docsUrl: 'https://ai.google.dev/',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    defaultValues: {
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'imagen-4.0-generate-001',
      aspectRatio: '1:1',
    },
    fields: [
      secretField('apiKey', '访问密钥', 'Google AI Studio 访问密钥'),
      textField('baseUrl', '连接地址', 'https://generativelanguage.googleapis.com'),
      textField('model', '模型名称', 'imagen-4.0-generate-001'),
      textField('aspectRatio', '默认比例', '1:1'),
    ],
  },
  {
    id: 'zhipu',
    name: '智谱',
    modelId: 'cogview',
    modelName: 'CogView',
    provider: 'Zhipu AI',
    icon: 'CV',
    region: 'China',
    desc: '中文描述友好，适合快速视觉探索',
    adapter: 'zhipu-cogview',
    protocol: 'openai-compatible',
    docsUrl: 'https://open.bigmodel.cn/dev/api/image-model/cogview',
    keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    defaultValues: {
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'cogview-3-flash',
      size: '1024x1024',
    },
    fields: [
      secretField('apiKey', '访问密钥', '智谱访问密钥'),
      textField('baseUrl', '连接地址', 'https://open.bigmodel.cn/api/paas/v4'),
      textField('model', '模型名称', 'cogview-3-flash'),
      textField('size', '默认尺寸', '1024x1024'),
    ],
  },
  {
    id: 'custom-openai-compatible',
    name: '通用连接',
    modelId: 'custom-image-endpoint',
    modelName: '自定义图像服务',
    provider: '通用连接',
    icon: '连',
    region: '自定义',
    desc: '适配本机伙伴或团队自建图片工具',
    adapter: 'openai-compatible-images',
    protocol: 'openai-compatible',
    docsUrl: '',
    keyUrl: '',
    defaultValues: {
      baseUrl: '',
      model: '',
      size: '1024x1024',
    },
    fields: [
      secretField('apiKey', '官网授权码', '粘贴官网授权码'),
      textField('baseUrl', '服务地址（高级）', 'https://your-studio.example/v1', '没有特殊要求时保持默认'),
      textField('model', '模型名称', 'provider/model-id'),
      textField('size', '默认画幅', '1024x1024'),
    ],
  },
];

const IMAGE_PROVIDER_CAPABILITY_PRESETS = {
  openai: capabilityProfile({
    role: 'concept-edit',
    outputs: [{ zh: 'PNG/JPG 预览图', en: 'PNG/JPG preview' }],
    strengths: [
      { zh: '概念探索', en: 'Concept direction' },
      { zh: '图像编辑', en: 'Image editing' },
      { zh: '风格精修', en: 'Style refinement' },
    ],
    guidanceZh: '适合概念探索、参考图编辑和风格精修；最终 Logo、版式或印刷物仍需重建为可编辑源稿。',
    guidanceEn: 'Best for concepts, reference editing, and style refinement. Logos, layouts, and print files still need editable source reconstruction.',
    handoffZh: '不要把一次性位图当作最终交付物；采纳后进入源稿制作与品牌套件检查。',
    handoffEn: 'Do not treat a one-shot raster as final delivery. Accepted work moves into source production and brand-kit checks.',
  }),
  recraft: capabilityProfile({
    role: 'vector-ready',
    outputs: [
      { zh: 'SVG 矢量', en: 'SVG vector' },
      { zh: 'PNG 预览图', en: 'PNG preview' },
    ],
    strengths: [
      { zh: '矢量图形', en: 'Vector graphics' },
      { zh: '图标系统', en: 'Icon systems' },
      { zh: '品牌风格', en: 'Brand style' },
    ],
    guidanceZh: '适合作为 Logo、图标和品牌图形的矢量候选；交付前仍要检查路径、色值、字体和授权。',
    guidanceEn: 'Good as a vector candidate for logos, icons, and brand graphics. Paths, colors, type, and rights still need final checks.',
    handoffZh: '可进入矢量源稿候选区，但必须通过源稿质量、品牌套件和交付包检查。',
    handoffEn: 'Can enter the vector-source candidate lane, but must pass source QA, brand-kit, and package checks.',
    editableSource: true,
    vectorOutput: true,
    finalDelivery: true,
    textReliability: 'medium-high',
  }),
  fal: capabilityProfile({
    role: 'gateway',
    outputs: [{ zh: '随所选工具变化', en: 'Depends on selected tool' }],
    strengths: [
      { zh: '快速切换', en: 'Fast switching' },
      { zh: '多个工具汇聚', en: 'Multi-tool access' },
    ],
    guidanceZh: '能力取决于你在 fal 中选择的具体生成器。默认按概念图处理，除非目标生成器明确返回 SVG 或源文件。',
    guidanceEn: 'Capabilities depend on the selected fal generator. Treat as concept output unless the target generator explicitly returns SVG or source files.',
    handoffZh: '交付格式按具体生成器复查，未声明可编辑源稿时不得直接进入最终交付。',
    handoffEn: 'Review the selected generator before delivery. If editable source is not declared, it cannot go straight to final handoff.',
  }),
  'black-forest-labs': capabilityProfile({
    role: 'concept-raster',
    outputs: [{ zh: 'PNG/JPG 预览图', en: 'PNG/JPG preview' }],
    strengths: [
      { zh: '高质量视觉探索', en: 'High-quality exploration' },
      { zh: '参考图控制', en: 'Reference control' },
    ],
    guidanceZh: '适合生成高质量方向稿和品牌氛围图；最终交付需要转为可编辑矢量或版式源文件。',
    guidanceEn: 'Strong for high-quality directions and brand mood visuals. Final delivery needs editable vector or layout source files.',
    handoffZh: '采纳后进入源稿重建，不直接作为 Logo、VI 手册或印刷文件交付。',
    handoffEn: 'After acceptance, rebuild as source files. Do not deliver directly as logo, VI guide, or print artwork.',
  }),
  volcengine: capabilityProfile({
    role: 'concept-edit',
    outputs: [{ zh: 'PNG/JPG 预览图', en: 'PNG/JPG preview' }],
    strengths: [
      { zh: '中文语义', en: 'Chinese briefs' },
      { zh: '多参考图', en: 'Multi-reference work' },
    ],
    guidanceZh: '适合中文品牌探索、多参考图方向和概念视觉；最终交付仍需源稿制作。',
    guidanceEn: 'Useful for Chinese brand exploration, multi-reference directions, and concept visuals. Delivery still needs source production.',
    handoffZh: '用于方向确认和物料预览，交付前必须转入源稿与品牌一致性检查。',
    handoffEn: 'Use for direction sign-off and material previews. Move to source and consistency checks before handoff.',
  }),
  'alibaba-dashscope': capabilityProfile({
    role: 'concept-edit',
    outputs: [{ zh: 'PNG/JPG 预览图', en: 'PNG/JPG preview' }],
    strengths: [
      { zh: '中文商业物料', en: 'Chinese commercial materials' },
      { zh: '电商场景', en: 'Ecommerce scenes' },
    ],
    guidanceZh: '适合中文商业物料和场景预览；最终字体、Logo 与印刷规范需要在源文件中落地。',
    guidanceEn: 'Good for Chinese commercial materials and scene previews. Type, logos, and print specs must be finalized in source files.',
    handoffZh: '作为物料预览使用，最终交付前重建为可编辑版式或矢量源稿。',
    handoffEn: 'Use as material preview, then rebuild as editable layout or vector sources before handoff.',
  }),
  'liblib-xingliu': capabilityProfile({
    role: 'workflow-raster',
    outputs: [{ zh: '工作流生成结果', en: 'Workflow output' }],
    strengths: [
      { zh: '本土创作生态', en: 'China creator ecosystem' },
      { zh: '模板工作流', en: 'Template workflows' },
    ],
    guidanceZh: '适合接入国内设计师常用模板和星流工作流；交付属性取决于模板输出，默认按预览图处理。',
    guidanceEn: 'Useful for domestic creator templates and Star workflows. Delivery quality depends on the template output, so default to preview-only.',
    handoffZh: '除非模板明确输出可编辑源稿，否则只进入概念预览或物料预览。',
    handoffEn: 'Unless the template returns editable source files, route output to concept or material preview only.',
  }),
  'tencent-hunyuan': capabilityProfile({
    role: 'concept-raster',
    outputs: [{ zh: 'PNG/JPG 预览图', en: 'PNG/JPG preview' }],
    strengths: [
      { zh: '中文审美', en: 'Chinese aesthetics' },
      { zh: '风格探索', en: 'Style exploration' },
    ],
    guidanceZh: '适合中文审美方向和风格探索；最终交付需源稿化并通过版权与字体检查。',
    guidanceEn: 'Good for Chinese visual directions and style exploration. Final delivery needs source reconstruction plus rights and type checks.',
    handoffZh: '只作为概念或参考，不直接进入最终交付包。',
    handoffEn: 'Use as concept or reference output, not a direct final package asset.',
  }),
  stability: capabilityProfile({
    role: 'concept-raster',
    outputs: [{ zh: 'PNG/JPG 预览图', en: 'PNG/JPG preview' }],
    strengths: [
      { zh: 'Moodboard', en: 'Moodboards' },
      { zh: '风格覆盖', en: 'Style range' },
    ],
    guidanceZh: '适合 moodboard、方向图和风格探索；最终交付必须由源稿工具重建。',
    guidanceEn: 'Best for moodboards, direction images, and style exploration. Final files must be rebuilt in source tools.',
    handoffZh: '只作为参考和方向素材，不能直接作为可交付 VI 源文件。',
    handoffEn: 'Use as reference or direction material, not as deliverable VI source files.',
  }),
  replicate: capabilityProfile({
    role: 'gateway',
    outputs: [{ zh: '随所选工具变化', en: 'Depends on selected tool' }],
    strengths: [
      { zh: '开放生成器', en: 'Open generators' },
      { zh: '版本替换', en: 'Version switching' },
    ],
    guidanceZh: '适合团队接入开放生成器并快速替换版本；交付能力以具体生成器输出为准。',
    guidanceEn: 'Good for open-generator access and version switching. Delivery capability depends on the selected generator.',
    handoffZh: '默认按概念图处理，源稿交付前必须复查输出格式。',
    handoffEn: 'Default to concept output. Check output format before any source handoff.',
  }),
  ideogram: capabilityProfile({
    role: 'concept-raster',
    outputs: [{ zh: 'PNG/JPG 预览图', en: 'PNG/JPG preview' }],
    strengths: [
      { zh: '海报方向', en: 'Poster directions' },
      { zh: '文字画面探索', en: 'Text-image exploration' },
    ],
    guidanceZh: '适合海报方向和带字画面的探索；最终文案、字体和版式必须在源文件中重排。',
    guidanceEn: 'Good for poster and text-image exploration. Final copy, type, and layout must be rebuilt in source files.',
    handoffZh: '不要把生成文字当作最终文字稿；需在源稿中重新排版和校对。',
    handoffEn: 'Do not treat generated text as final copy. Re-typeset and proof it in source files.',
    textReliability: 'medium-high',
  }),
  google: capabilityProfile({
    role: 'concept-raster',
    outputs: [{ zh: 'PNG/JPG 预览图', en: 'PNG/JPG preview' }],
    strengths: [
      { zh: '自然图像', en: 'Natural images' },
      { zh: '参考图', en: 'Reference visuals' },
    ],
    guidanceZh: '适合自然图像、场景和参考图；品牌标识、手册和印刷物需要源稿化。',
    guidanceEn: 'Good for natural images, scenes, and references. Brand marks, guides, and print materials need source reconstruction.',
    handoffZh: '作为参考视觉使用，最终交付需进入源稿制作和交付检查。',
    handoffEn: 'Use as reference visuals. Final handoff needs source production and delivery checks.',
  }),
  zhipu: capabilityProfile({
    role: 'concept-raster',
    outputs: [{ zh: 'PNG/JPG 预览图', en: 'PNG/JPG preview' }],
    strengths: [
      { zh: '中文描述', en: 'Chinese prompts' },
      { zh: '快速探索', en: 'Fast exploration' },
    ],
    guidanceZh: '适合中文描述下的快速视觉探索；最终交付需重建为可编辑源稿。',
    guidanceEn: 'Good for fast visual exploration from Chinese prompts. Final delivery needs editable source reconstruction.',
    handoffZh: '只进入概念预览，不直接进入最终交付包。',
    handoffEn: 'Route to concept preview only, not directly to the final delivery package.',
  }),
  'custom-openai-compatible': capabilityProfile({
    role: 'custom',
    outputs: [{ zh: '团队定义', en: 'Team-defined' }],
    strengths: [
      { zh: '本机创作伙伴', en: 'Local studio partner' },
      { zh: '团队入口', en: 'Team entry point' },
    ],
    guidanceZh: '能力取决于本机伙伴或团队图片工具。默认按概念图处理，除非工具返回可编辑源文件。',
    guidanceEn: 'Capabilities depend on the local studio partner or team channel. Treat as concept output unless the channel returns editable source files.',
    handoffZh: '交付前必须确认输出格式，并通过源稿与品牌套件检查。',
    handoffEn: 'Before handoff, the channel must declare format and pass source plus brand-kit checks.',
  }),
};

export function getImageProviderCapabilities(provider) {
  if (!provider) return null;
  return provider.capabilities || IMAGE_PROVIDER_CAPABILITY_PRESETS[provider.id] || IMAGE_PROVIDER_CAPABILITY_PRESETS['custom-openai-compatible'];
}

// 生图大模型预设
export const IMAGE_MODELS_PRESET = IMAGE_PROVIDER_PRESETS.map((provider) => ({
  id: provider.modelId,
  name: provider.modelName,
  provider: provider.provider,
  icon: provider.icon,
  desc: provider.desc,
  providerId: provider.id,
  adapter: provider.adapter,
  protocol: provider.protocol,
  capabilities: getImageProviderCapabilities(provider),
  deliveryRoute: buildDeliveryRoute(provider),
}));

// 示例占位模型（未检测到配置时显示）
export const EXAMPLE_LLM = { id: 'example', name: '预览模型', provider: '未配置', icon: 'CFG', desc: '连接本地创作服务或填写访问密钥后可使用' };
export const EXAMPLE_IMAGE_MODEL = { id: 'example', name: '预览模型', provider: '未配置', icon: 'CFG', desc: '连接本地创作服务或填写访问密钥后可使用' };

// ── Detected models from Agent config (injected by launch_console.py) ──

const DETECTED_MODELS_STORAGE_KEY = 'gdpro_detected_models';
let runtimeDetectedModels = null;

function normalizeDetectedModels(models) {
  if (!models || typeof models !== 'object') return null;
  return {
    llm: Array.isArray(models.llm) ? models.llm : [],
    image: Array.isArray(models.image) ? models.image : [],
    defaults: models.defaults && typeof models.defaults === 'object' ? models.defaults : {},
    source: models.source || 'local-agent',
    updatedAt: models.updatedAt || Date.now(),
  };
}

export function setDetectedModels(models) {
  const normalized = normalizeDetectedModels(models);
  if (!normalized) return null;
  runtimeDetectedModels = normalized;
  if (typeof window !== 'undefined') {
    window.__MODELS__ = normalized;
    try {
      window.localStorage.setItem(DETECTED_MODELS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage failures in restricted embeds.
    }
  }
  return normalized;
}

function getDetectedModels() {
  if (runtimeDetectedModels) return runtimeDetectedModels;
  if (typeof window !== 'undefined' && window.__MODELS__) {
    return setDetectedModels(window.__MODELS__) || window.__MODELS__;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(DETECTED_MODELS_STORAGE_KEY);
      if (stored) return setDetectedModels(JSON.parse(stored));
    } catch {
      // Ignore invalid cached model data.
    }
  }
  return null;
}

export function getDetectedLanguageModels() {
  const detected = getDetectedModels();
  return detected?.llm || null;
}

export function getDetectedImageModels() {
  const detected = getDetectedModels();
  return detected?.image || null;
}

export function getDetectedDefaults() {
  const detected = getDetectedModels();
  return detected?.defaults || null;
}

// 获取动态模型列表（优先使用 Agent 实际配置的模型）
export function getLanguageModels(detected) {
  // Priority 1: actual models from Agent config
  const actual = getDetectedLanguageModels();
  if (actual && actual.length > 0) {
    const custom = getCustomModels().llm || [];
    return [...actual, ...custom];
  }
  // Priority 2: preset list if detected flag is set
  const custom = getCustomModels().llm || [];
  const base = detected ? LANGUAGE_MODELS_PRESET : [EXAMPLE_LLM];
  return [...base, ...custom];
}

export function getImageModels(detected) {
  // Priority 1: actual models from Agent config
  const actual = getDetectedImageModels();
  if (actual && actual.length > 0) {
    const custom = getCustomModels().image || [];
    return [...actual, ...custom];
  }
  // Image presets are always visible so users can paste their own access key before connecting Gateway.
  const custom = getCustomModels().image || [];
  return [...IMAGE_MODELS_PRESET, ...custom];
}

// 用户自定义模型存储
export function getCustomModels() {
  try {
    return JSON.parse(localStorage.getItem('gdpro_custom_models') || '{"llm":[],"image":[]}');
  } catch {
    return { llm: [], image: [] };
  }
}

export function saveCustomModels(models) {
  localStorage.setItem('gdpro_custom_models', JSON.stringify(models));
}

export function addCustomModel(type, model) {
  const current = getCustomModels();
  current[type] = [...(current[type] || []), { ...model, id: model.id || `custom_${Date.now()}` }];
  saveCustomModels(current);
  return current;
}

export function removeCustomModel(type, id) {
  const current = getCustomModels();
  current[type] = (current[type] || []).filter((m) => m.id !== id);
  saveCustomModels(current);
  return current;
}

// 向后兼容
export const LANGUAGE_MODELS = getLanguageModels(true);
export const IMAGE_MODELS = getImageModels(true);

export function getConfiguredModels() {
  try {
    return JSON.parse(localStorage.getItem('gdpro_model_config') || '{}');
  } catch {
    return {};
  }
}

export function saveModelConfig(config) {
  localStorage.setItem('gdpro_model_config', JSON.stringify(config));
}

export function getImageProviderPreset(providerId) {
  return IMAGE_PROVIDER_PRESETS.find((provider) => provider.id === providerId) || null;
}

export function getImageProviderById(providerId) {
  const preset = getImageProviderPreset(providerId);
  if (preset) return preset;

  const custom = (getCustomModels().image || []).find((item) => item.id === providerId || item.providerId === providerId);
  return custom ? buildCustomImageProvider(custom) : null;
}

export function getImageProviderForModel(modelId) {
  const model = IMAGE_MODELS_PRESET.find((item) => item.id === modelId);
  if (model?.providerId) return getImageProviderPreset(model.providerId);

  const custom = (getCustomModels().image || []).find((item) => item.id === modelId);
  if (custom?.providerId) return getImageProviderPreset(custom.providerId) || buildCustomImageProvider(custom);
  if (custom) return buildCustomImageProvider(custom);

  return IMAGE_PROVIDER_PRESETS.find((provider) => provider.modelId === modelId) || null;
}

export function getImageModelConnections() {
  try {
    return JSON.parse(localStorage.getItem(IMAGE_CONNECTION_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function getImageModelConnection(providerId) {
  return getImageModelConnections()[providerId] || {};
}

export function saveImageModelConnection(providerId, values) {
  const current = getImageModelConnections();
  const provider = getImageProviderById(providerId);
  const nextValues = {
    ...(provider?.defaultValues || {}),
    ...(values || {}),
    updatedAt: Date.now(),
  };
  const next = {
    ...current,
    [providerId]: nextValues,
  };
  localStorage.setItem(IMAGE_CONNECTION_STORAGE_KEY, JSON.stringify(next));
  return nextValues;
}

export function removeImageModelConnection(providerId) {
  const current = getImageModelConnections();
  if (!current[providerId]) return current;
  const next = { ...current };
  delete next[providerId];
  localStorage.setItem(IMAGE_CONNECTION_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function pickCredentialValues(provider, values) {
  return (provider?.fields || [])
    .filter((field) => field.secret)
    .reduce((acc, field) => {
      if (values[field.key]) acc[field.key] = values[field.key];
      return acc;
    }, {});
}

function pickAdapterParams(provider, values) {
  const reserved = new Set(['apiKey', 'apiToken', 'accessKey', 'secretKey', 'baseUrl', 'model', 'size', 'aspectRatio', 'outputFormat', 'region', 'service']);
  return (provider?.fields || [])
    .filter((field) => !field.secret && !reserved.has(field.key))
    .reduce((acc, field) => {
      const value = values[field.key];
      if (value !== undefined && value !== null && String(value).trim()) {
        acc[field.key] = value;
      }
      return acc;
    }, {});
}

export function isImageProviderConfigured(providerId) {
  const provider = getImageProviderById(providerId);
  if (!provider) return false;
  const values = {
    ...(provider.defaultValues || {}),
    ...getImageModelConnection(providerId),
  };
  return provider.fields
    .filter((field) => field.required)
    .every((field) => String(values[field.key] || '').trim());
}

export function buildImageModelRuntimeConfig(modelId) {
  const provider = getImageProviderForModel(modelId);
  if (!provider) {
    return {
      schemaVersion: IMAGE_MODEL_CONFIG_SCHEMA_VERSION,
      id: modelId,
      configured: false,
      missingFields: ['provider'],
      capabilities: null,
      deliveryRoute: buildDeliveryRoute(null),
    };
  }

  const values = {
    ...(provider.defaultValues || {}),
    ...getImageModelConnection(provider.id),
  };
  const missingFields = provider.fields
    .filter((field) => field.required && !String(values[field.key] || '').trim())
    .map((field) => field.key);

  return {
    schemaVersion: IMAGE_MODEL_CONFIG_SCHEMA_VERSION,
    id: modelId,
    providerId: provider.id,
    provider: provider.provider,
    displayName: provider.modelName,
    adapter: provider.adapter,
    protocol: provider.protocol,
    capabilities: getImageProviderCapabilities(provider),
    deliveryRoute: buildDeliveryRoute(provider),
    configured: missingFields.length === 0,
    missingFields,
    endpoint: {
      baseUrl: values.baseUrl || provider.defaultValues?.baseUrl || '',
      service: values.service || '',
    },
    model: values.model || provider.defaultValues?.model || modelId,
    defaults: {
      size: values.size || provider.defaultValues?.size || '1024x1024',
      aspectRatio: values.aspectRatio || provider.defaultValues?.aspectRatio || '',
      outputFormat: values.outputFormat || provider.defaultValues?.outputFormat || '',
      region: values.region || provider.defaultValues?.region || '',
    },
    credentials: pickCredentialValues(provider, values),
    adapterParams: pickAdapterParams(provider, values),
    gatewayHints: {
      target: 'hermes-openclaw-image-adapter',
      passThrough: true,
      authStyle: provider.protocol,
    },
  };
}
