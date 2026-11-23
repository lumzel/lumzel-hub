// High-fidelity bilingual sample data used exclusively when ctx.preview === true
// (Lumzel Market Preview & automated cover-light/cover-dark screenshot rendering).

export function getSampleData(locale = 'en') {
  const zh = typeof locale === 'string' && locale.toLowerCase().startsWith('zh');
  const now = Date.now();
  const mins = n => new Date(now - n * 60_000).toISOString();
  const hrs = n => new Date(now - n * 3_600_000).toISOString();

  const env = {
    viewer: 'alex-chen',
    repo: 'lumzel/lumzel-hub',
    defaultBranch: 'main',
    repoUrl: 'https://github.com/lumzel/lumzel-hub',
    branch: 'feat/github-deck-cli',
    dirtyCount: 2,
  };

  const prs = [
    {
      number: 142,
      title: zh
        ? 'feat(github-deck): 新增基于 gh CLI 的 PR 与 Issue 本地工作台'
        : 'feat(github-deck): add local-first PR & Issue workbench powered by gh CLI',
      state: 'OPEN',
      isDraft: false,
      author: { login: 'alex-chen' },
      labels: [
        { name: 'deck', color: '0070e3' },
        { name: 'enhancement', color: '1c882d' },
      ],
      assignees: [{ login: 'alex-chen' }],
      reviewRequests: [{ login: 'maya-lin' }],
      reviewDecision: 'APPROVED',
      mergeable: 'MERGEABLE',
      headRefName: 'feat/github-deck-cli',
      baseRefName: 'main',
      createdAt: hrs(5),
      updatedAt: mins(14),
      url: 'https://github.com/lumzel/lumzel-hub/pull/142',
      additions: 486,
      deletions: 42,
      changedFiles: 4,
      milestone: { title: 'v1.4' },
      body: zh
        ? `## 变更说明\n\n- 封装纯 argv 的 \`gh\` 与 \`git\` CLI 调用层，复用本机 \`gh auth\` 登录态\n- 支持 PR 列表筛选、Overview / CI Checks / Unified Diff 同屏审查\n- 接入 Lumzel Agent 协同：一键 AI Code Review、诊断修复 CI、从当前分支自动生成 PR 描述\n\n## 验证\n\n- [x] 通过 \`node tools/sync-upstreams.mjs --verify\`\n- [x] 验证 Light / Dark 双主题与中英双语切换`
        : `## Summary\n\n- Adds a shell-free \`gh\` and \`git\` CLI adapter reusing local \`gh auth\` credentials\n- Supports PR filtering, Overview, CI Checks, and Unified Diff review in one workspace\n- Integrates Lumzel Agent workflows: one-click AI Code Review, CI failure diagnosis, and AI PR drafting\n\n## Verification\n\n- [x] Passed \`node tools/sync-upstreams.mjs --verify\`\n- [x] Verified Light/Dark themes and en/zh-CN locales`,
      statusCheckRollup: [
        { name: 'verify-manifests', state: 'SUCCESS', bucket: 'pass', workflow: 'CI' },
        { name: 'render-previews', state: 'SUCCESS', bucket: 'pass', workflow: 'CI' },
        { name: 'lint-and-format', state: 'SUCCESS', bucket: 'pass', workflow: 'CI' },
      ],
      reviews: [
        {
          author: { login: 'maya-lin' },
          state: 'APPROVED',
          submittedAt: mins(22),
          body: zh
            ? 'CLI 参数传递均走 `--body-file -` 与 stdin，安全性很好。Diff 截断提示也很清晰，LGTM。'
            : 'Clean argv handling with `--body-file -` via stdin and clear truncation handling for large diffs. LGTM!',
        },
      ],
      comments: [
        {
          author: { login: 'sam-wu' },
          createdAt: hrs(2),
          body: zh
            ? '在 Market Preview 模式下确认没有触发任何 `deck.exec.run`，离线封面渲染很稳。'
            : 'Confirmed Market Preview stays 100% offline with zero `deck.exec.run` calls.',
        },
      ],
      files: [
        { path: 'decks/github/deck.json', additions: 96, deletions: 0 },
        { path: 'decks/github/src/gh.js', additions: 214, deletions: 0 },
        { path: 'decks/github/src/app.js', additions: 148, deletions: 34 },
        { path: 'marketplace.json', additions: 28, deletions: 8 },
      ],
      diff: `diff --git a/decks/github/src/gh.js b/decks/github/src/gh.js
index 0000000..8f4c12a 100644
--- a/decks/github/src/gh.js
+++ b/decks/github/src/gh.js
@@ -1,9 +1,14 @@
+export async function commentPr({ repo = '', number, body }) {
+  const args = ['pr', 'comment', String(number), ...repoFlags(repo), '--body-file', '-'];
+  await execCli('gh', args, { stdin: body, timeoutMs: 20000 });
+}
+
+export async function mergePr({ repo = '', number, method = 'squash', deleteBranch = false }) {
+  const args = ['pr', 'merge', String(number), ...repoFlags(repo), \`--\${method}\`];
+  if (deleteBranch) args.push('--delete-branch');
+  await execCli('gh', args, { timeoutMs: 30000 });
+}`,
    },
    {
      number: 139,
      title: zh
        ? 'fix(sync): 修复多语言 params.options 的缺失校验'
        : 'fix(sync): enforce i18n checks on deck params option labels',
      state: 'OPEN',
      isDraft: false,
      author: { login: 'maya-lin' },
      labels: [{ name: 'bug', color: 'e7000b' }],
      assignees: [{ login: 'maya-lin' }],
      reviewRequests: [{ login: 'alex-chen' }],
      reviewDecision: 'CHANGES_REQUESTED',
      mergeable: 'MERGEABLE',
      headRefName: 'fix/params-i18n-check',
      baseRefName: 'main',
      createdAt: hrs(18),
      updatedAt: hrs(1),
      url: 'https://github.com/lumzel/lumzel-hub/pull/139',
      additions: 64,
      deletions: 19,
      changedFiles: 2,
      milestone: null,
      body: zh
        ? '补齐 `sync-upstreams.mjs` 对 `params[].options[].i18n` 的检查，避免中文默认值漏入英文 manifest。'
        : 'Ensures `sync-upstreams.mjs` validates `params[].options[].i18n` so non-English labels stay inside localized blocks.',
      statusCheckRollup: [
        { name: 'verify-manifests', state: 'SUCCESS', bucket: 'pass', workflow: 'CI' },
        { name: 'unit-tests', state: 'FAILURE', bucket: 'fail', workflow: 'CI' },
      ],
      reviews: [
        {
          author: { login: 'alex-chen' },
          state: 'CHANGES_REQUESTED',
          submittedAt: hrs(1),
          body: zh
            ? '请补充一个针对缺失 `zh-CN` 选项标签的回归测试用例。'
            : 'Please add a regression test covering a missing localized option label.',
        },
      ],
      comments: [],
      files: [
        { path: 'tools/sync-upstreams.mjs', additions: 52, deletions: 19 },
        { path: 'tools/sync-upstreams.test.mjs', additions: 12, deletions: 0 },
      ],
      diff: `diff --git a/tools/sync-upstreams.mjs b/tools/sync-upstreams.mjs
index 4b120e1..a93d41c 100644
--- a/tools/sync-upstreams.mjs
+++ b/tools/sync-upstreams.mjs
@@ -2348,6 +2348,9 @@ function verifyDeckManifest(entry, deckDir, deckJsonPath, errors) {
   for (const opt of param.options || []) {
+    if (containsCjk(opt.label)) {
+      errors.push(\`[deck:\${entry.id}] option label must default to English\`);
+    }
   }`,
    },
    {
      number: 136,
      title: zh
        ? 'chore(opendesign): 升级反套路质检规则到 v1.3.2'
        : 'chore(opendesign): refine anti-slop craft checks to v1.3.2',
      state: 'MERGED',
      isDraft: false,
      author: { login: 'sam-wu' },
      labels: [{ name: 'deck', color: '0070e3' }],
      assignees: [],
      reviewRequests: [],
      reviewDecision: 'APPROVED',
      mergeable: 'UNKNOWN',
      headRefName: 'chore/opendesign-1.3.2',
      baseRefName: 'main',
      createdAt: hrs(42),
      updatedAt: hrs(20),
      url: 'https://github.com/lumzel/lumzel-hub/pull/136',
      additions: 38,
      deletions: 11,
      changedFiles: 2,
      milestone: { title: 'v1.3' },
      body: zh ? '优化暗色模式下的对比度检查阈值。' : 'Refines dark-mode contrast thresholds for generated prototypes.',
      statusCheckRollup: [{ name: 'verify-manifests', state: 'SUCCESS', bucket: 'pass', workflow: 'CI' }],
      reviews: [],
      comments: [],
      files: [{ path: 'decks/opendesign/skills/opendesign-critique/SKILL.md', additions: 38, deletions: 11 }],
      diff: '',
    },
  ];

  const issues = [
    {
      number: 141,
      title: zh
        ? '在 GitHub Deck 中支持按当前分支一键草拟 PR 标题与正文'
        : 'Support one-click AI PR drafting from the active Worktree branch',
      state: 'OPEN',
      author: { login: 'maya-lin' },
      labels: [
        { name: 'enhancement', color: '1c882d' },
        { name: 'agent', color: '7f22fe' },
      ],
      assignees: [{ login: 'alex-chen' }],
      milestone: { title: 'v1.4' },
      createdAt: hrs(12),
      updatedAt: mins(40),
      url: 'https://github.com/lumzel/lumzel-hub/issues/141',
      body: zh
        ? '希望在新建 PR 弹窗中直接读取当前分支的 `git log` 与 `git diff --stat`，由当前选中的 Agent 生成 PR 标题和 Markdown 描述，减少手工整理成本。'
        : 'In the Create PR modal, read `git log` and `git diff --stat` for the active branch and let the selected Agent draft a concise title and Markdown summary.',
      comments: [
        {
          author: { login: 'alex-chen' },
          createdAt: mins(40),
          body: zh ? '已在 #142 中实现，欢迎试用反馈！' : 'Implemented in #142 — ready for testing!',
        },
      ],
    },
    {
      number: 138,
      title: zh
        ? '超大 PR Diff 超过 2 MiB 时的友好截断与单文件提示'
        : 'Graceful truncation banner when PR diff exceeds 2 MiB exec cap',
      state: 'OPEN',
      author: { login: 'sam-wu' },
      labels: [
        { name: 'bug', color: 'e7000b' },
        { name: 'performance', color: 'd08700' },
      ],
      assignees: [{ login: 'sam-wu' }],
      milestone: null,
      createdAt: hrs(30),
      updatedAt: hrs(6),
      url: 'https://github.com/lumzel/lumzel-hub/issues/138',
      body: zh
        ? '当单个 PR 包含大量锁文件或静态资源变更时，`gh pr diff` 可能触发 `deck.exec.run` 的 2 MiB 截断限制，需要清晰提示并提供「在 GitHub 打开」入口。'
        : 'When a PR modifies lockfiles or large assets, `gh pr diff` can hit the 2 MiB `deck.exec.run` cap. Show an inline warning banner with a link to inspect on GitHub.',
      comments: [],
    },
  ];

  return { env, prs, issues };
}
