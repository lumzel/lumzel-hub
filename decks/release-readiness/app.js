const COPY = {
  'zh-CN': {
    title: '发版就绪看板',
    sub: '核对测试构建、变更说明与安全门禁状态',
    auditBtn: '执行全量发版核验',
    auditTitle: '自动化测试与构建门禁',
    auditDesc: '核查未提交改动、测试套件、生产构建与兼容性状态，给出门禁结论。',
    auditRun: '运行核验',
    changelogTitle: '变更摘要与迁移说明',
    changelogDesc: '汇总最近标签以来的功能、修复与破坏性变更，生成可发布的 Changelog。',
    changelogRun: '生成变更日志',
    securityTitle: '安全与凭据扫描',
    securityDesc: '排查硬编码密钥、依赖供应链变更与新增权限边界风险。',
    securityRun: '执行安全扫描',
    previewHint: '预览模式：安装此 Deck 后即可在项目工作区一键运行关联技能。',
    prompts: {
      audit: '请检查当前工作区的未提交变更、最近提交记录、测试与构建状态，输出发版就绪门禁报告。',
      changelog: '请对比最近一个发版标签或主分支，整理结构化 Changelog 与迁移注意事项。',
      security: '请对本次待发布改动执行密钥暴露、依赖风险与权限边界安全审计。',
    },
  },
  en: {
    title: 'Release Readiness',
    sub: 'Verify tests, build health, changelog notes, and security gates before shipping',
    auditBtn: 'Run Full Release Audit',
    auditTitle: 'Test & Build Gate',
    auditDesc: 'Check uncommitted changes, test suites, build output, and compatibility gates.',
    auditRun: 'Run Audit',
    changelogTitle: 'Changelog & Migration Notes',
    changelogDesc: 'Summarize features, fixes, and breaking changes since the last release tag.',
    changelogRun: 'Draft Changelog',
    securityTitle: 'Security & Credential Scan',
    securityDesc: 'Audit diffs and manifests for leaked secrets, dependency risks, and permission changes.',
    securityRun: 'Run Security Scan',
    previewHint: 'Preview mode: install this Deck to launch its bundled release skills in your workspace.',
    prompts: {
      audit: 'Audit uncommitted changes, recent commits, build health, and test suites for release readiness.',
      changelog: 'Generate structured release notes and migration instructions since the latest tag or base branch.',
      security: 'Run a pre-release security, secret exposure, and permission boundary audit on pending changes.',
    },
  },
};

const ACTIONS = {
  audit: 'release-readiness-audit',
  changelog: 'release-readiness-changelog',
  security: 'release-readiness-security',
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
        actionId: `release-readiness:${action}`,
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
