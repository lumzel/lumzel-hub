// Bilingual UI dictionary and Agent prompt templates for the GitHub Deck.

const STRINGS = {
  en: {
    deckTitle: 'GitHub',
    tabPrs: 'Pull Requests',
    tabIssues: 'Issues',
    collapseRail: 'Toggle list sidebar',
    refresh: 'Refresh',
    deckSettings: 'Deck Settings',
    newPr: '+ New PR',
    newIssue: '+ New Issue',
    searchPlaceholderPr: 'Search pull requests…',
    searchPlaceholderIssue: 'Search issues…',
    stateOpen: 'Open',
    stateClosed: 'Closed',
    stateMerged: 'Merged',
    stateAll: 'All',
    filterAll: 'All',
    filterMine: 'Mine',
    filterReview: 'Review',
    filterBranch: 'Branch',
    filterAssigned: 'Assigned',
    filterMentioned: 'Mentioned',
    branchNoPr: 'No PR for branch',
    branchHasPr: 'PR #{n}',
    syncing: 'Syncing…',
    cachedHint: 'Cached · updating…',
    previewBanner: 'Market Preview — showing sample GitHub data (gh CLI is disabled in preview).',
    emptyPrList: 'No pull requests match the current filter.',
    emptyIssueList: 'No issues match the current filter.',
    selectItemPrompt: 'Select a Pull Request or Issue from the list to inspect details.',
    // Environment / onboarding
    envGhMissingTitle: 'GitHub CLI (gh) not found',
    envGhMissingDesc: 'Install the GitHub CLI and authenticate to use this Deck with your local repository.',
    envGhAuthTitle: 'GitHub CLI is not authenticated',
    envGhAuthDesc: 'Sign in with gh in your terminal so this Deck can reuse your local GitHub credentials.',
    envNotRepoTitle: 'No GitHub repository detected',
    envNotRepoDesc: 'Open a Git worktree with a GitHub remote, or set a Repository Override (owner/repo) in Deck Settings.',
    envPermTitle: 'Permission required',
    envPermDesc: 'Grant exec permission for gh and git in Lumzel to load live Pull Requests and Issues.',
    retryBtn: 'Retry',
    openSettingsBtn: 'Open Deck Settings',
    btnInstallGhInTerminal: 'Install gh in Terminal',
    btnAuthGhInTerminal: 'Run gh auth login in Terminal',
    btnOpenInstallGuide: 'Install Guide ↗',
    envMissingPkgManager:
      'No supported package manager (such as Homebrew) was detected. Install Homebrew first or download gh from cli.github.com.',
    envUnsupportedPlatform:
      'Automatic terminal installation is not supported on this platform. Please install gh manually from cli.github.com.',
    errTerminalUnsupported:
      'This Lumzel version does not support opening the built-in terminal from a Deck. Please run the command manually.',
    errTerminalDeclined: 'Terminal launch was cancelled. You can retry anytime or run the command manually.',
    errTerminalFailed: 'Failed to open built-in terminal: {detail}',
    // Detail tabs & metadata
    subOverview: 'Overview',
    subChecks: 'Checks',
    subFiles: 'Files',
    noDescription: 'No description provided.',
    metaReviewers: 'Reviewers',
    metaAssignees: 'Assignees',
    metaLabels: 'Labels',
    metaMilestone: 'Milestone',
    metaMergeable: 'Merge Status',
    metaChecks: 'CI Checks',
    metaBranch: 'Branch',
    metaNone: 'None',
    mergeableClean: 'Ready to merge',
    mergeableConflicting: 'Merge conflicts',
    mergeableUnknown: 'Checking…',
    statusOpen: 'Open',
    statusMerged: 'Merged',
    statusClosed: 'Closed',
    statusDraft: 'Draft',
    reviewApproved: 'Approved',
    reviewChangesRequested: 'Changes requested',
    reviewRequired: 'Review required',
    reviewPending: 'Pending',
    checksPassed: '{passed}/{total} passed',
    checksFailed: '{failed} failed · {passed}/{total} passed',
    checksPending: '{pending} pending · {passed}/{total} passed',
    checksEmpty: 'No CI status checks reported for this Pull Request.',
    filesEmpty: 'No changed files found.',
    diffLoading: 'Loading diff…',
    diffTruncated: 'Diff output exceeded the 2 MiB CLI limit and was truncated. Inspect specific files locally or open on GitHub.',
    diffBinary: 'Binary or empty diff.',
    loadingMore: 'Loading more…',
    loadMoreLines: 'Show {n} more lines',
    largeFileLines: '{n} lines',
    backToList: 'List',
    showListBtn: 'Open list',
    commentsTitle: 'Conversation',
    noComments: 'No comments yet.',
    commentPlaceholder: 'Write a comment (Markdown supported)…',
    reviewPlaceholder: 'Add review feedback (optional for Approve)…',
    postComment: 'Comment',
    submitReview: 'Submit Review',
    reviewActionComment: 'Comment',
    reviewActionApprove: 'Approve',
    reviewActionRequestChanges: 'Request changes',
    // PR & Issue Actions
    actCreateWorktree: 'New Worktree',
    actMerge: 'Merge',
    actClose: 'Close',
    actReopen: 'Reopen',
    actReady: 'Mark Ready',
    actDraft: 'Convert to Draft',
    actOpenGh: 'GitHub ↗',
    actAgentMenu: 'Agent ▾',
    actAiReview: 'AI Code Review',
    actAiFixCi: 'Diagnose & Fix CI',
    actAiAddressReview: 'Address Review Comments',
    actAiSolveIssue: 'Solve Issue with Agent',
    actSendToComposer: 'Send Context to Composer',
    // Agent picker
    agentTitle: 'Session Agent & Model',
    agentDefault: 'Default',
    agentReset: 'Reset',
    agentFieldAgent: 'Agent',
    agentFieldModel: 'Model',
    agentFieldEffort: 'Thinking',
    agentSaveDefault: 'Save as Deck Default',
    agentFollowGlobal: 'Follow Lumzel default',
    sessionRunning: 'Running',
    sessionNeedsInput: 'Needs input',
    sessionDone: 'Done',
    sessionError: 'Failed',
    sessionOpen: 'Open Session',
    // Modals
    modalNewPrTitle: 'Create Pull Request',
    modalNewIssueTitle: 'Create Issue',
    modalMergeTitle: 'Merge Pull Request #{n}',
    modalWorktreeTitle: 'Create Lumzel Worktree',
    modalConfirmTitle: 'Confirm Action',
    fieldTitle: 'Title',
    fieldBody: 'Description',
    fieldBase: 'Base branch',
    fieldBranchName: 'Worktree branch name',
    fieldWorktreeHintPr: 'Creates an isolated Lumzel Worktree and checks out PR #{n} ({head}) without disturbing your current branch.',
    fieldWorktreeHintIssue: 'Creates an isolated Lumzel Worktree from {base} for Issue #{n}.',
    fieldLabels: 'Labels (comma-separated)',
    fieldDraft: 'Create as draft Pull Request',
    fieldMergeMethod: 'Merge strategy',
    fieldDeleteBranch: 'Delete head branch after merge',
    btnAiDraftPr: 'AI Draft from Branch',
    btnAiDrafting: 'Drafting…',
    btnCancel: 'Cancel',
    btnCreatePr: 'Create Pull Request',
    btnCreateIssue: 'Create Issue',
    btnCreateWorktree: 'Create Worktree',
    btnConfirmMerge: 'Confirm Merge',
    btnConfirm: 'Confirm',
    // Feedback
    toastCopied: 'Copied to clipboard',
    toastPrCreated: 'Pull Request created',
    toastIssueCreated: 'Issue created',
    toastCommentPosted: 'Comment posted',
    toastReviewSubmitted: 'Review submitted',
    toastMerged: 'Pull Request #{n} merged',
    toastWorktreeStarted: 'Creating Worktree…',
    toastWorktreeCreated: 'Worktree created ({branch})',
    toastStateUpdated: 'Status updated',
    toastSessionStarted: 'Agent session started',
    toastComposed: 'Context added to Session Composer',
    toastPreviewReadonly: 'Disabled in Market Preview mode',
    confirmClosePr: 'Close Pull Request #{n} without merging?',
    confirmCloseIssue: 'Close Issue #{n}?',
    confirmMergeDetail: 'Merge #{n} ({head} → {base}) using {method}?',
    timeJustNow: 'just now',
    timeMinsAgo: '{n}m ago',
    timeHoursAgo: '{n}h ago',
    timeDaysAgo: '{n}d ago',
    // Agent prompts
    promptCreateWorktreePr:
      'Use the Lumzel `worktree_create` MCP tool to create a new Worktree on branch `{branch}` for GitHub Pull Request #{n} ("{title}", head branch `{head}` in {repo}). First fetch the PR head (`git fetch origin pull/{n}/head` or `origin/{head}`), then create the Worktree based on that commit so the user can inspect, run, or edit PR #{n} in isolation without touching the current Worktree.',
    promptCreateWorktreeIssue:
      'Use the Lumzel `worktree_create` MCP tool to create a new Worktree on branch `{branch}` based on `{base}` for GitHub Issue #{n} ("{title}" in {repo}). Report the created Worktree path once ready.',
    promptPrReview:
      'Review GitHub Pull Request #{n} ("{title}") in repository {repo} ({head} -> {base}). Use the github-pr-review skill to inspect the diff, CI checks, and surrounding code, then provide prioritized findings with file:line references. Do not post to GitHub unless I ask.',
    promptPrFixCi:
      'CI checks are failing on Pull Request #{n} ("{title}") in {repo} (branch `{head}`). Failing checks: {checks}. Inspect the failure logs via `gh pr checks` / `gh run view --log-failed`, identify the root cause in the codebase, fix it, and run local verification.',
    promptPrAddressReview:
      'Review feedback was left on Pull Request #{n} ("{title}") in {repo} (branch `{head}`). Read the PR reviews and comments via `gh pr view {n} --comments`, address each requested change cleanly in code, and verify with tests.',
    promptIssueSolve:
      'Analyze and solve GitHub Issue #{n} ("{title}") in repository {repo}. Use the github-issue-solve skill to inspect the full issue description and comments, explore the codebase, implement a clean verified fix with tests, and summarize the changes. Do not push or open a PR unless I ask.',
    promptDraftPr:
      'Generate a concise, high-signal Pull Request title and Markdown description for the current branch `{head}` targeting `{base}`.\n\nRecent commits:\n{commits}\n\nDiff stat:\n{stat}\n\nRespond ONLY with valid JSON: {"title": "...", "body": "..."} with no extra commentary.',
  },
  'zh-CN': {
    deckTitle: 'GitHub 工作台',
    tabPrs: 'Pull Requests',
    tabIssues: 'Issues',
    collapseRail: '折叠/展开列表栏',
    refresh: '刷新',
    deckSettings: 'Deck 设置',
    newPr: '+ 新建 PR',
    newIssue: '+ 新建 Issue',
    searchPlaceholderPr: '搜索 Pull Requests…',
    searchPlaceholderIssue: '搜索 Issues…',
    stateOpen: '开放中',
    stateClosed: '已关闭',
    stateMerged: '已合并',
    stateAll: '全部',
    filterAll: '全部',
    filterMine: '我创建的',
    filterReview: '待我审查',
    filterBranch: '当前分支',
    filterAssigned: '指派给我',
    filterMentioned: '提及我的',
    branchNoPr: '当前分支暂无 PR',
    branchHasPr: 'PR #{n}',
    syncing: '同步中…',
    cachedHint: '已加载缓存 · 后台更新中…',
    previewBanner: '市场预览模式 — 当前展示内置示例数据（预览环境不调用本机 gh CLI）。',
    emptyPrList: '当前筛选条件下暂无 Pull Request。',
    emptyIssueList: '当前筛选条件下暂无 Issue。',
    selectItemPrompt: '从左侧选择一个 Pull Request 或 Issue 查看详情。',
    // Environment / onboarding
    envGhMissingTitle: '未检测到 GitHub CLI (gh)',
    envGhMissingDesc: '请先在本机安装 gh CLI 并完成登录，即可在当前 Worktree 直接管理 PR 与 Issue。',
    envGhAuthTitle: 'GitHub CLI 尚未登录',
    envGhAuthDesc: '请在终端执行 gh auth login 完成授权，本工作台将直接复用你的本机凭据。',
    envNotRepoTitle: '未识别到 GitHub 仓库',
    envNotRepoDesc: '请在关联了 GitHub 远程仓库的 Worktree 中打开，或在 Deck 设置中手动指定 owner/repo。',
    envPermTitle: '需要执行权限',
    envPermDesc: '请在 Lumzel 授权弹窗中允许执行 gh 与 git 命令以拉取实时数据。',
    retryBtn: '重新检测',
    openSettingsBtn: '打开 Deck 设置',
    btnInstallGhInTerminal: '在内置终端安装 gh',
    btnAuthGhInTerminal: '在内置终端登录 gh',
    btnOpenInstallGuide: '查看官方安装文档 ↗',
    envMissingPkgManager:
      '未检测到可用的包管理器（如 Homebrew）。请先安装 Homebrew，或前往 cli.github.com 手动下载安装。',
    envUnsupportedPlatform: '当前平台暂不支持一键终端安装，请前往 cli.github.com 查看安装方式。',
    errTerminalUnsupported: '当前 Lumzel 宿主版本暂不支持从 Deck 打开内置终端，请复制上方命令手动执行。',
    errTerminalDeclined: '已取消在内置终端执行命令，你可以随时重试或手动运行。',
    errTerminalFailed: '无法打开内置终端：{detail}',
    // Detail tabs & metadata
    subOverview: '概览与讨论',
    subChecks: 'CI 检查',
    subFiles: '变更文件',
    noDescription: '暂无描述。',
    metaReviewers: '审查者',
    metaAssignees: '指派给',
    metaLabels: '标签',
    metaMilestone: '里程碑',
    metaMergeable: '合并状态',
    metaChecks: 'CI 检查',
    metaBranch: '分支',
    metaNone: '无',
    mergeableClean: '可以合并',
    mergeableConflicting: '存在冲突',
    mergeableUnknown: '检测中…',
    statusOpen: 'Open',
    statusMerged: 'Merged',
    statusClosed: 'Closed',
    statusDraft: 'Draft',
    reviewApproved: '已批准',
    reviewChangesRequested: '需修改',
    reviewRequired: '待审查',
    reviewPending: '等待中',
    checksPassed: '{passed}/{total} 通过',
    checksFailed: '{failed} 项失败 · {passed}/{total} 通过',
    checksPending: '{pending} 进行中 · {passed}/{total} 通过',
    checksEmpty: '该 Pull Request 暂无 CI 检查记录。',
    filesEmpty: '暂无变更文件。',
    diffLoading: '正在加载 Diff…',
    diffTruncated: 'Diff 输出超过 2 MiB 上限已截断，请在本地编辑器或 GitHub 网页查看完整变更。',
    diffBinary: '二进制文件或空 Diff。',
    loadingMore: '正在加载更多…',
    loadMoreLines: '展开其余 {n} 行',
    largeFileLines: '{n} 行',
    backToList: '列表',
    showListBtn: '打开列表',
    commentsTitle: '讨论记录',
    noComments: '暂无评论。',
    commentPlaceholder: '输入评论内容（支持 Markdown）…',
    reviewPlaceholder: '填写审查意见（Approve 时可留空）…',
    postComment: '发表评论',
    submitReview: '提交审查',
    reviewActionComment: '仅评论',
    reviewActionApprove: '批准 (Approve)',
    reviewActionRequestChanges: '要求修改',
    // PR & Issue Actions
    actCreateWorktree: '创建 Worktree',
    actMerge: '合并',
    actClose: '关闭',
    actReopen: '重新打开',
    actReady: '标记就绪',
    actDraft: '转为草稿',
    actOpenGh: 'GitHub ↗',
    actAgentMenu: 'Agent 协同 ▾',
    actAiReview: 'AI 代码审查',
    actAiFixCi: '诊断并修复 CI',
    actAiAddressReview: '按审查意见修改',
    actAiSolveIssue: '交给 Agent 解决',
    actSendToComposer: '发送上下文到输入框',
    // Agent picker
    agentTitle: '会话 Agent 与模型',
    agentDefault: '默认',
    agentReset: '重置',
    agentFieldAgent: 'Agent',
    agentFieldModel: '模型',
    agentFieldEffort: '思考强度',
    agentSaveDefault: '保存为 Deck 默认',
    agentFollowGlobal: '跟随 Lumzel 全局默认',
    sessionRunning: '运行中',
    sessionNeedsInput: '等待确认',
    sessionDone: '已完成',
    sessionError: '执行失败',
    sessionOpen: '打开会话',
    // Modals
    modalNewPrTitle: '新建 Pull Request',
    modalNewIssueTitle: '新建 Issue',
    modalMergeTitle: '合并 Pull Request #{n}',
    modalWorktreeTitle: '创建 Lumzel Worktree',
    modalConfirmTitle: '确认操作',
    fieldTitle: '标题',
    fieldBody: '描述',
    fieldBase: '目标 Base 分支',
    fieldBranchName: 'Worktree 分支名',
    fieldWorktreeHintPr: '为 PR #{n}（{head}）创建独立的 Lumzel Worktree，不会影响你当前所在分支。',
    fieldWorktreeHintIssue: '基于 {base} 为 Issue #{n} 创建独立的 Lumzel Worktree。',
    fieldLabels: '标签（逗号分隔）',
    fieldDraft: '创建为 Draft 草稿 PR',
    fieldMergeMethod: '合并策略',
    fieldDeleteBranch: '合并后删除源分支',
    btnAiDraftPr: 'AI 总结当前分支生成',
    btnAiDrafting: '生成中…',
    btnCancel: '取消',
    btnCreatePr: '创建 Pull Request',
    btnCreateIssue: '创建 Issue',
    btnCreateWorktree: '创建 Worktree',
    btnConfirmMerge: '确认合并',
    btnConfirm: '确认',
    // Feedback
    toastCopied: '已复制到剪贴板',
    toastPrCreated: 'Pull Request 创建成功',
    toastIssueCreated: 'Issue 创建成功',
    toastCommentPosted: '评论已发送',
    toastReviewSubmitted: '审查已提交',
    toastMerged: 'Pull Request #{n} 已合并',
    toastWorktreeStarted: '正在创建 Worktree…',
    toastWorktreeCreated: '已创建 Worktree（{branch}）',
    toastStateUpdated: '状态已更新',
    toastSessionStarted: '已启动 Agent 会话',
    toastComposed: '上下文已加入会话输入框',
    toastPreviewReadonly: '市场预览模式下不可执行写操作',
    confirmClosePr: '确定不合并直接关闭 Pull Request #{n}？',
    confirmCloseIssue: '确定关闭 Issue #{n}？',
    confirmMergeDetail: '确定以 {method} 方式将 #{n}（{head} → {base}）合并？',
    timeJustNow: '刚刚',
    timeMinsAgo: '{n} 分钟前',
    timeHoursAgo: '{n} 小时前',
    timeDaysAgo: '{n} 天前',
    // Agent prompts
    promptCreateWorktreePr:
      '请使用 Lumzel 内置的 `worktree_create` MCP 工具，为仓库 {repo} 的 Pull Request #{n}（"{title}"，源分支 `{head}`）创建一个新的隔离 Worktree（分支名 `{branch}`）。请先拉取该 PR 的最新提交（如 `git fetch origin pull/{n}/head` 或 `origin/{head}`），再以该提交为基准创建 Worktree，不要改动当前 Worktree 的分支。',
    promptCreateWorktreeIssue:
      '请使用 Lumzel 内置的 `worktree_create` MCP 工具，基于 `{base}` 为仓库 {repo} 的 Issue #{n}（"{title}"）创建一个新的隔离 Worktree（分支名 `{branch}`），创建完成后返回路径。',
    promptPrReview:
      '请审查仓库 {repo} 中的 GitHub Pull Request #{n}（"{title}"，分支 {head} -> {base}）。请使用 github-pr-review 技能检查 Diff、CI 状态及周边代码，按严重程度输出带 file:line 的审查意见。除非我明确要求，否则不要直接提交评论到 GitHub。',
    promptPrFixCi:
      '仓库 {repo} 的 Pull Request #{n}（"{title}"，分支 `{head}`）CI 检查失败。失败项：{checks}。请通过 `gh pr checks` 与 `gh run view --log-failed` 查看失败日志，定位根因并修复代码，最后在本地运行验证。',
    promptPrAddressReview:
      '仓库 {repo} 的 Pull Request #{n}（"{title}"，分支 `{head}`）收到了审查意见。请通过 `gh pr view {n} --comments` 阅读所有审查评论，在代码中逐项修复并补充验证。',
    promptIssueSolve:
      '请分析并解决仓库 {repo} 中的 GitHub Issue #{n}（"{title}"）。请使用 github-issue-solve 技能阅读完整 Issue 描述和评论，自主探索代码库并完成实现与测试验证。除非我明确要求，否则不要推送或创建 PR。',
    promptDraftPr:
      '请根据当前分支 `{head}` 相对 `{base}` 的提交与变更统计，生成简洁准确的 Pull Request 标题和 Markdown 正文。\n\n近期提交：\n{commits}\n\nDiff 统计：\n{stat}\n\n请只返回合法 JSON：{"title": "...", "body": "..."}，不要包含其他说明文字。',
  },
};

let currentLocale = 'en';

export function setLocale(locale) {
  if (typeof locale === 'string' && locale.toLowerCase().startsWith('zh')) {
    currentLocale = 'zh-CN';
  } else {
    currentLocale = 'en';
  }
  document.documentElement.lang = currentLocale;
  return currentLocale;
}

export function getLocale() {
  return currentLocale;
}

export function t(key, vars = null) {
  const dict = STRINGS[currentLocale] || STRINGS.en;
  let value = dict[key] ?? STRINGS.en[key] ?? key;
  if (vars && typeof value === 'string') {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replaceAll(`{${k}}`, String(v ?? ''));
    }
  }
  return value;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });
}
