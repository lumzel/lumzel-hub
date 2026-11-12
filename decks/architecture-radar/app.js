const COPY = {
  'zh-CN': {
    title: '架构与模块雷达',
    sub: '追踪核心模块职责、调用链路与循环依赖风险',
    scanBtn: '扫描模块架构',
    scanTitle: '核心领域边界',
    scanDesc: '梳理子包与目录职责，检测分层越界与循环依赖风险。',
    scanRun: '扫描模块边界',
    dataflowTitle: '关键数据流转',
    dataflowDesc: '追踪从入口接口经领域层到持久化与外部服务的完整调用路径。',
    dataflowRun: '追踪数据流',
    refactorTitle: '演进与重构建议',
    refactorDesc: '识别高复杂度耦合热点文件，规划渐进式边界拆分方案。',
    refactorRun: '生成重构方案',
    previewHint: '预览模式：安装此 Deck 后即可在项目工作区一键运行关联技能。',
    prompts: {
      scan: '请扫描当前项目的模块职责、依赖方向、跨层耦合与循环依赖风险，输出架构健康总结。',
      dataflow: '请追踪当前项目核心业务或请求的端到端数据流转链路，并标注关键状态与信任边界。',
      refactor: '请识别当前代码库中的高复杂度或高耦合热点模块，给出保持公共边界稳定的渐进式重构方案。',
    },
  },
  en: {
    title: 'Architecture Radar',
    sub: 'Map module responsibilities, end-to-end call paths, and coupling hotspots',
    scanBtn: 'Scan Architecture',
    scanTitle: 'Module Boundaries',
    scanDesc: 'Map package responsibilities and detect layer breaches or circular dependencies.',
    scanRun: 'Scan Boundaries',
    dataflowTitle: 'End-to-End Dataflow',
    dataflowDesc: 'Trace core request and state paths from entry points to storage and external sinks.',
    dataflowRun: 'Trace Dataflow',
    refactorTitle: 'Hotspot Refactor Plan',
    refactorDesc: 'Pinpoint high-friction hotspot modules and design incremental seam-first slices.',
    refactorRun: 'Plan Refactoring',
    previewHint: 'Preview mode: install this Deck to launch its bundled architecture skills in your workspace.',
    prompts: {
      scan: 'Scan module responsibilities, dependency direction, layer violations, and circular dependency risks.',
      dataflow: 'Trace the primary end-to-end request and state dataflow paths across module boundaries.',
      refactor: 'Identify high-complexity hotspot modules and propose safe, seam-preserving refactoring slices.',
    },
  },
};

const ACTIONS = {
  scan: 'architecture-radar-scan',
  dataflow: 'architecture-radar-dataflow',
  refactor: 'architecture-radar-refactor',
};

const context = await deck.context();
document.documentElement.dataset.theme = context.theme || 'light';
const lang = String(context.locale || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
document.documentElement.lang = lang;
const copy = COPY[lang];
document.title = copy.title;

for (const node of document.querySelectorAll('[data-i18n]')) {
  const key = node.dataset.i18n;
  if (key && typeof copy[key] === 'string') node.textContent = copy[key];
}

const banner = document.getElementById('banner');
if (context.preview && banner) {
  banner.textContent = copy.previewHint;
  banner.hidden = false;
}

for (const button of document.querySelectorAll('[data-action]')) {
  if (context.preview) {
    button.disabled = true;
    continue;
  }
  button.addEventListener('click', async () => {
    const action = button.dataset.action;
    const skill = ACTIONS[action];
    if (!skill) return;
    button.disabled = true;
    try {
      await deck.agent.run({
        skill,
        actionId: `architecture-radar:${action}`,
        prompt: copy.prompts[action],
      });
    } catch (err) {
      if (banner) {
        banner.textContent = err instanceof Error ? err.message : String(err);
        banner.hidden = false;
      }
    } finally {
      button.disabled = false;
    }
  });
}
