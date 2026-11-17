// Built-in templates & Market Preview sample diagrams (valid Excalidraw v2 JSON).

function makeBaseScene(elements = [], appState = {}) {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'https://excalidraw.com',
    elements,
    appState: {
      viewBackgroundColor: '#ffffff',
      gridSize: 20,
      ...appState,
    },
    files: {},
  };
}

function box(id, x, y, width, height, text, { bg = '#a5d8ff', stroke = '#1971c2', fontSize = 18, type = 'rectangle', textColor = '#1e1e1e' } = {}) {
  const textId = `${id}-txt`;
  const shape = {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: stroke,
    backgroundColor: bg,
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: type === 'rectangle' ? { type: 3 } : null,
    seed: Math.abs(hashCode(id)),
    version: 1,
    versionNonce: Math.abs(hashCode(id + 'v')),
    isDeleted: false,
    boundElements: [{ id: textId, type: 'text' }],
    updated: 1,
    link: null,
    locked: false,
  };
  const label = {
    id: textId,
    type: 'text',
    x: x + 10,
    y: y + height / 2 - fontSize * 0.65,
    width: width - 20,
    height: fontSize * 1.4,
    angle: 0,
    strokeColor: textColor,
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.abs(hashCode(textId)),
    version: 1,
    versionNonce: Math.abs(hashCode(textId + 'v')),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    text,
    fontSize,
    fontFamily: 5,
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId: id,
    originalText: text,
    autoResize: true,
    lineHeight: 1.25,
  };
  return [shape, label];
}

function titleText(id, x, y, text, fontSize = 24) {
  return {
    id,
    type: 'text',
    x,
    y,
    width: Math.max(240, text.length * fontSize * 0.65),
    height: fontSize * 1.4,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.abs(hashCode(id)),
    version: 1,
    versionNonce: Math.abs(hashCode(id + 'v')),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    text,
    fontSize,
    fontFamily: 5,
    textAlign: 'left',
    verticalAlign: 'top',
    containerId: null,
    originalText: text,
    autoResize: true,
    lineHeight: 1.25,
  };
}

function arrow(id, x, y, dx, dy, { fromId = null, toId = null, stroke = '#495057', style = 'solid' } = {}) {
  return {
    id,
    type: 'arrow',
    x,
    y,
    width: Math.abs(dx) || 1,
    height: Math.abs(dy) || 1,
    angle: 0,
    strokeColor: stroke,
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: style,
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 2 },
    seed: Math.abs(hashCode(id)),
    version: 1,
    versionNonce: Math.abs(hashCode(id + 'v')),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    points: [[0, 0], [dx, dy]],
    lastCommittedPoint: null,
    startBinding: fromId ? { elementId: fromId, focus: 0, gap: 6 } : null,
    endBinding: toId ? { elementId: toId, focus: 0, gap: 6 } : null,
    startArrowhead: null,
    endArrowhead: 'arrow',
    elbowed: false,
  };
}

function bindArrow(elements, arrowEl) {
  for (const targetId of [arrowEl.startBinding?.elementId, arrowEl.endBinding?.elementId]) {
    if (!targetId) continue;
    const target = elements.find(e => e.id === targetId);
    if (target) {
      target.boundElements = [...(target.boundElements || []), { id: arrowEl.id, type: 'arrow' }];
    }
  }
  elements.push(arrowEl);
}

function hashCode(str) {
  let h = 1;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return h || 1;
}

export function buildArchitectureTemplate(locale = 'en') {
  const zh = locale === 'zh-CN';
  const els = [
    titleText('arch-title', 80, 40, zh ? '系统架构总览' : 'System Architecture Overview', 26),
    ...box('arch-client', 80, 120, 210, 82, zh ? 'Web / 桌面客户端' : 'Desktop / Web Client', { bg: '#a5d8ff', stroke: '#1971c2' }),
    ...box('arch-gw', 370, 120, 210, 82, zh ? 'API 网关与鉴权' : 'API Gateway & Auth', { bg: '#d0bfff', stroke: '#6741d9' }),
    ...box('arch-svc', 370, 270, 210, 82, zh ? '核心业务服务' : 'Core Domain Service', { bg: '#b2f2bb', stroke: '#2f9e44' }),
    ...box('arch-cache', 670, 120, 190, 82, zh ? 'Redis 缓存' : 'Redis Cache', { bg: '#ffec99', stroke: '#f08c00' }),
    ...box('arch-db', 670, 270, 190, 82, 'PostgreSQL', { bg: '#ffc9c9', stroke: '#e03131' }),
    ...box('arch-ai', 80, 270, 210, 82, zh ? 'Agent 任务队列' : 'Agent Worker Queue', { bg: '#99e9f2', stroke: '#0c8599' }),
  ];
  bindArrow(els, arrow('a1', 290, 161, 80, 0, { fromId: 'arch-client', toId: 'arch-gw' }));
  bindArrow(els, arrow('a2', 475, 202, 0, 68, { fromId: 'arch-gw', toId: 'arch-svc' }));
  bindArrow(els, arrow('a3', 580, 161, 90, 0, { fromId: 'arch-gw', toId: 'arch-cache', style: 'dashed' }));
  bindArrow(els, arrow('a4', 580, 311, 90, 0, { fromId: 'arch-svc', toId: 'arch-db' }));
  bindArrow(els, arrow('a5', 370, 311, -80, 0, { fromId: 'arch-svc', toId: 'arch-ai' }));
  return makeBaseScene(els);
}

export function buildFlowchartTemplate(locale = 'en') {
  const zh = locale === 'zh-CN';
  const els = [
    titleText('fl-title', 110, 36, zh ? '需求发布流程' : 'Feature Delivery Flow', 24),
    ...box('fl-start', 110, 105, 190, 68, zh ? '1. 接收需求描述' : '1. Receive Prompt', { type: 'ellipse', bg: '#b2f2bb', stroke: '#2f9e44' }),
    ...box('fl-plan', 110, 215, 190, 74, zh ? '2. 拆解实体与连线' : '2. Plan Nodes & Links', { bg: '#a5d8ff', stroke: '#1971c2' }),
    ...box('fl-check', 110, 335, 190, 90, zh ? '通过校验?' : 'Valid JSON?', { type: 'diamond', bg: '#ffec99', stroke: '#f08c00' }),
    ...box('fl-save', 390, 343, 200, 74, zh ? '3. 写入 .excalidraw' : '3. Save .excalidraw', { bg: '#d0bfff', stroke: '#6741d9' }),
    ...box('fl-fix', 390, 215, 200, 74, zh ? '自动修复坐标/结构' : 'Repair Layout / Schema', { bg: '#ffc9c9', stroke: '#e03131' }),
  ];
  bindArrow(els, arrow('f1', 205, 173, 0, 42, { fromId: 'fl-start', toId: 'fl-plan' }));
  bindArrow(els, arrow('f2', 205, 289, 0, 46, { fromId: 'fl-plan', toId: 'fl-check' }));
  bindArrow(els, arrow('f3', 300, 380, 90, 0, { fromId: 'fl-check', toId: 'fl-save' }));
  bindArrow(els, arrow('f4', 300, 355, 90, -100, { fromId: 'fl-check', toId: 'fl-fix', style: 'dashed' }));
  bindArrow(els, arrow('f5', 390, 252, -90, 0, { fromId: 'fl-fix', toId: 'fl-plan', style: 'dashed' }));
  return makeBaseScene(els);
}

export function buildMindmapTemplate(locale = 'en') {
  const zh = locale === 'zh-CN';
  const els = [
    ...box('mm-core', 340, 210, 210, 86, zh ? 'Excalidraw 工作台' : 'Excalidraw Studio', { bg: '#ffec99', stroke: '#f08c00', fontSize: 20 }),
    ...box('mm-1', 80, 90, 180, 68, zh ? '手动自由绘制' : 'Manual Drawing', { bg: '#a5d8ff', stroke: '#1971c2' }),
    ...box('mm-2', 630, 90, 180, 68, zh ? 'AI 智能生图' : 'AI Generation', { bg: '#b2f2bb', stroke: '#2f9e44' }),
    ...box('mm-3', 80, 340, 180, 68, zh ? '文件管理与预览' : 'File Gallery', { bg: '#d0bfff', stroke: '#6741d9' }),
    ...box('mm-4', 630, 340, 180, 68, zh ? 'PNG / SVG 导出' : 'PNG / SVG Export', { bg: '#99e9f2', stroke: '#0c8599' }),
  ];
  bindArrow(els, arrow('m1', 340, 235, -80, -110, { fromId: 'mm-core', toId: 'mm-1' }));
  bindArrow(els, arrow('m2', 550, 235, 80, -110, { fromId: 'mm-core', toId: 'mm-2' }));
  bindArrow(els, arrow('m3', 340, 275, -80, 95, { fromId: 'mm-core', toId: 'mm-3' }));
  bindArrow(els, arrow('m4', 550, 275, 80, 95, { fromId: 'mm-core', toId: 'mm-4' }));
  return makeBaseScene(els);
}

export function buildSequenceTemplate(locale = 'en') {
  const zh = locale === 'zh-CN';
  const els = [
    titleText('sq-title', 90, 32, zh ? 'AI 生成图表交互时序' : 'AI Diagram Generation Sequence', 24),
    ...box('sq-u', 90, 96, 150, 56, zh ? '用户' : 'User', { bg: '#a5d8ff', stroke: '#1971c2' }),
    ...box('sq-d', 330, 96, 170, 56, 'Excalidraw Deck', { bg: '#d0bfff', stroke: '#6741d9' }),
    ...box('sq-a', 590, 96, 170, 56, 'Lumzel Agent', { bg: '#b2f2bb', stroke: '#2f9e44' }),
    ...box('sq-s1', 90, 195, 150, 48, zh ? '输入图表需求' : 'Enter prompt', { bg: '#f8f9fa', stroke: '#868e96', fontSize: 15 }),
    ...box('sq-s2', 330, 265, 170, 54, zh ? '调用 agent.run()' : 'Call agent.run()', { bg: '#f8f9fa', stroke: '#868e96', fontSize: 15 }),
    ...box('sq-s3', 590, 340, 170, 54, zh ? '写入 .excalidraw' : 'Write .excalidraw', { bg: '#ffec99', stroke: '#f08c00', fontSize: 15 }),
    ...box('sq-s4', 330, 420, 170, 54, zh ? '刷新画布预览' : 'Reload canvas', { bg: '#99e9f2', stroke: '#0c8599', fontSize: 15 }),
  ];
  bindArrow(els, arrow('q1', 240, 220, 90, 65, { fromId: 'sq-s1', toId: 'sq-s2' }));
  bindArrow(els, arrow('q2', 500, 292, 90, 70, { fromId: 'sq-s2', toId: 'sq-s3' }));
  bindArrow(els, arrow('q3', 590, 380, -90, 65, { fromId: 'sq-s3', toId: 'sq-s4', style: 'dashed' }));
  return makeBaseScene(els);
}

export function buildErTemplate(locale = 'en') {
  const zh = locale === 'zh-CN';
  const els = [
    titleText('er-title', 90, 36, zh ? '核心实体关系图 (ER)' : 'Core Entity Relationship (ER)', 24),
    ...box('er-user', 90, 120, 200, 110, zh ? 'User\nPK id\nname, email' : 'User\nPK id\nname, email', { bg: '#a5d8ff', stroke: '#1971c2', fontSize: 16 }),
    ...box('er-proj', 370, 120, 220, 110, zh ? 'Diagram\nPK id\nFK owner_id\ntitle, path' : 'Diagram\nPK id\nFK owner_id\ntitle, path', { bg: '#b2f2bb', stroke: '#2f9e44', fontSize: 16 }),
    ...box('er-rev', 670, 120, 210, 110, zh ? 'Revision\nPK id\nFK diagram_id\nsnapshot_json' : 'Revision\nPK id\nFK diagram_id\nsnapshot_json', { bg: '#ffec99', stroke: '#f08c00', fontSize: 16 }),
  ];
  bindArrow(els, arrow('e1', 290, 175, 80, 0, { fromId: 'er-user', toId: 'er-proj' }));
  bindArrow(els, arrow('e2', 590, 175, 80, 0, { fromId: 'er-proj', toId: 'er-rev' }));
  return makeBaseScene(els);
}

export function buildTemplateScene(templateId, locale = 'en') {
  switch (templateId) {
    case 'architecture':
      return buildArchitectureTemplate(locale);
    case 'flowchart':
      return buildFlowchartTemplate(locale);
    case 'mindmap':
      return buildMindmapTemplate(locale);
    case 'sequence':
      return buildSequenceTemplate(locale);
    case 'er':
      return buildErTemplate(locale);
    case 'blank':
    default:
      return makeBaseScene([]);
  }
}

export function buildPreviewSamples(locale = 'en') {
  const zh = locale === 'zh-CN';
  return [
    {
      path: 'diagrams/system-architecture.excalidraw',
      name: 'system-architecture.excalidraw',
      size: 3840,
      modifiedAt: Date.now() - 120_000,
      scene: buildArchitectureTemplate(locale),
      fromDisk: true,
    },
    {
      path: 'diagrams/feature-delivery-flow.excalidraw',
      name: 'feature-delivery-flow.excalidraw',
      size: 2920,
      modifiedAt: Date.now() - 3600_000,
      scene: buildFlowchartTemplate(locale),
      fromDisk: true,
    },
    {
      path: 'docs/excalidraw-mindmap.excalidraw',
      name: 'excalidraw-mindmap.excalidraw',
      size: 2150,
      modifiedAt: Date.now() - 86_400_000,
      scene: buildMindmapTemplate(locale),
      fromDisk: true,
    },
  ].map(item => ({
    ...item,
    title: zh
      ? item.name.replace(/\.excalidraw$/i, '')
      : item.name.replace(/\.excalidraw$/i, ''),
  }));
}
