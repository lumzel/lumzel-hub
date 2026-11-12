const COPY = {
  'zh-CN': {
    title: '代码审查面板',
    sub: '按编码规范（Standards）与功能规格（Spec）双轴审查当前分支变更',
    reviewBtn: '启动双轴审查',
    reviewTitle: '双轴全量审查',
    reviewDesc: '同时对照项目编码规范与需求规格审查当前分支与工作区改动，分级输出问题。',
    reviewRun: '运行双轴审查',
    standardsTitle: 'Standards（工程规范）',
    standardsDesc: '检查命名清晰度、重复逻辑、边界异常处理与项目约定遵循情况。',
    standardsRun: '仅查工程规范',
    specTitle: 'Spec（需求契合度）',
    specDesc: '核对功能实现完整性、边界条件覆盖率与非预期范围蔓延（Scope Creep）。',
    specRun: '仅查需求规格',
    previewHint: '预览模式：安装此 Deck 后即可在项目工作区一键运行关联技能。',
    prompts: {
      review: '请对当前工作区相对于主分支的改动执行 Standards 与 Spec 双轴代码审查。',
      standards: '请对照当前仓库的工程规范、分层边界与异常处理准则审查当前分支改动。',
      spec: '请对照相关需求规格、工单或提交目标审查当前改动的功能完整性、边界条件与范围蔓延。',
    },
  },
  en: {
    title: 'PR Review Board',
    sub: 'Review current branch changes along Coding Standards and Spec Compliance',
    reviewBtn: 'Start Dual-Axis Review',
    reviewTitle: 'Dual-Axis Full Review',
    reviewDesc: 'Audit branch and working tree changes along both Standards and Spec axes.',
    reviewRun: 'Run Full Review',
    standardsTitle: 'Standards (Conventions)',
    standardsDesc: 'Check repository rules, architectural layers, error handling, and code smells.',
    standardsRun: 'Audit Standards',
    specTitle: 'Spec (Requirements)',
    specDesc: 'Verify requirement completeness, edge-case handling, and unintended scope creep.',
    specRun: 'Audit Spec',
    previewHint: 'Preview mode: install this Deck to launch its bundled code review skills in your workspace.',
    prompts: {
      review: 'Run a dual-axis code review (Standards and Spec) on the current branch and working tree changes.',
      standards: 'Audit the current diff against repository coding standards, architectural boundaries, and error safety.',
      spec: 'Verify the current diff against specs, tickets, or commit intent for missing edge cases and scope creep.',
    },
  },
};

const ACTIONS = {
  review: 'pr-review-board-review',
  standards: 'pr-review-board-standards',
  spec: 'pr-review-board-spec',
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
        actionId: `pr-review-board:${action}`,
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
