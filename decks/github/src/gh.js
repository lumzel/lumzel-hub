// Shell-free GitHub CLI (gh) and Git CLI adapter over window.deck.exec.run.

const PR_LIST_FIELDS = [
  'number',
  'title',
  'state',
  'isDraft',
  'author',
  'labels',
  'reviewDecision',
  'headRefName',
  'baseRefName',
  'updatedAt',
  'createdAt',
  'url',
  'additions',
  'deletions',
  'changedFiles',
  'comments',
  'statusCheckRollup',
].join(',');

const PR_VIEW_FIELDS = [
  'number',
  'title',
  'body',
  'state',
  'isDraft',
  'author',
  'labels',
  'assignees',
  'reviewRequests',
  'reviews',
  'reviewDecision',
  'mergeable',
  'mergeStateStatus',
  'headRefName',
  'baseRefName',
  'updatedAt',
  'createdAt',
  'mergedAt',
  'url',
  'additions',
  'deletions',
  'changedFiles',
  'files',
  'comments',
  'milestone',
  'statusCheckRollup',
].join(',');

const ISSUE_LIST_FIELDS = [
  'number',
  'title',
  'state',
  'author',
  'labels',
  'assignees',
  'milestone',
  'comments',
  'updatedAt',
  'createdAt',
  'url',
].join(',');

const ISSUE_VIEW_FIELDS = [
  'number',
  'title',
  'body',
  'state',
  'author',
  'labels',
  'assignees',
  'milestone',
  'comments',
  'updatedAt',
  'createdAt',
  'closedAt',
  'url',
].join(',');

export class GhCliError extends Error {
  constructor(code, message, detail = '') {
    super(message);
    this.name = 'GhCliError';
    this.code = code;
    this.detail = detail;
  }
}

function classifyError(errOrStderr, program = 'gh') {
  const raw = String(errOrStderr?.message || errOrStderr || '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('permissiondenied') || lower.includes('permission denied')) {
    return new GhCliError('PERMISSION_DENIED', 'Permission denied', raw);
  }
  if (
    lower.includes('no such file') ||
    lower.includes('enoent') ||
    lower.includes('not found') ||
    lower.includes('os error 2')
  ) {
    return new GhCliError('GH_NOT_FOUND', `${program} CLI not found`, raw);
  }
  if (
    lower.includes('not logged into any github') ||
    lower.includes('gh auth login') ||
    lower.includes('authentication') ||
    lower.includes('to get started with github cli')
  ) {
    return new GhCliError('GH_NOT_AUTHED', 'GitHub CLI is not authenticated', raw);
  }
  if (
    lower.includes('not a git repository') ||
    lower.includes('none of the git remotes') ||
    lower.includes('could not resolve to a repository') ||
    lower.includes('no git remotes found')
  ) {
    return new GhCliError('NOT_GITHUB_REPO', 'No GitHub repository detected', raw);
  }
  return new GhCliError('CLI_ERROR', raw || `${program} command failed`, raw);
}

async function execCli(program, args, opts = {}) {
  if (!window.deck?.exec?.run) {
    throw new GhCliError('PERMISSION_DENIED', 'deck.exec.run unavailable');
  }
  let res;
  try {
    res = await window.deck.exec.run(program, args, {
      timeoutMs: opts.timeoutMs ?? 25000,
      ...(opts.stdin !== undefined ? { stdin: opts.stdin } : {}),
    });
  } catch (err) {
    throw classifyError(err, program);
  }
  if (res.timedOut) {
    throw new GhCliError('CLI_ERROR', `${program} ${args[0] || ''} timed out`, res.stderr || '');
  }
  if (res.exitCode !== 0 && !opts.allowNonZero) {
    throw classifyError(res.stderr || res.stdout || `exit code ${res.exitCode}`, program);
  }
  return res;
}

function repoFlags(repo) {
  const slug = typeof repo === 'string' ? repo.trim() : '';
  return slug ? ['-R', slug] : [];
}

function parseJson(stdout, fallback = null) {
  const text = String(stdout || '').trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export async function probeEnvironment(repoOverride = '') {
  // 1. Check gh binary
  await execCli('gh', ['--version'], { timeoutMs: 8000 });

  // 2. Check auth status
  const auth = await execCli('gh', ['auth', 'status'], { timeoutMs: 10000, allowNonZero: true });
  const authText = `${auth.stdout || ''}\n${auth.stderr || ''}`;
  if (auth.exitCode !== 0) {
    throw classifyError(authText, 'gh');
  }
  const userMatch = authText.match(/Logged in to [^\s]+ account ([^\s(]+)/i) || authText.match(/as ([^\s(]+)/i);
  const viewer = userMatch ? userMatch[1].trim() : '';

  // 3. Resolve repo
  const repoArgs = ['repo', 'view'];
  if (repoOverride.trim()) repoArgs.push(repoOverride.trim());
  repoArgs.push('--json', 'nameWithOwner,defaultBranchRef,url,viewerPermission');
  const repoRes = await execCli('gh', repoArgs, { timeoutMs: 15000 });
  const repoInfo = parseJson(repoRes.stdout, {});

  // 4. Local git branch (best-effort; ok if not in a repo when repoOverride is set)
  let branch = '';
  let dirtyCount = 0;
  try {
    const br = await execCli('git', ['branch', '--show-current'], { timeoutMs: 5000, allowNonZero: true });
    if (br.exitCode === 0) branch = String(br.stdout || '').trim();
    const st = await execCli('git', ['status', '--porcelain'], { timeoutMs: 5000, allowNonZero: true });
    if (st.exitCode === 0) {
      dirtyCount = String(st.stdout || '')
        .split('\n')
        .filter(Boolean).length;
    }
  } catch {
    // ignore local git errors when repo override is used
  }

  return {
    viewer,
    repo: repoInfo?.nameWithOwner || repoOverride.trim(),
    defaultBranch: repoInfo?.defaultBranchRef?.name || 'main',
    repoUrl: repoInfo?.url || '',
    branch,
    dirtyCount,
  };
}

export async function listPrs({ repo = '', state = 'open', filter = 'all', search = '', limit = 30, branch = '' } = {}) {
  const args = ['pr', 'list', ...repoFlags(repo), '--state', state, '--limit', String(limit), '--json', PR_LIST_FIELDS];
  if (filter === 'mine') {
    args.push('--author', '@me');
  } else if (filter === 'branch' && branch) {
    args.push('--head', branch);
  }
  const searchParts = [];
  if (filter === 'review') searchParts.push('review-requested:@me');
  if (search.trim()) searchParts.push(search.trim());
  if (searchParts.length > 0) {
    args.push('--search', searchParts.join(' '));
  }
  const res = await execCli('gh', args, { timeoutMs: 25000 });
  const items = parseJson(res.stdout, []);
  return Array.isArray(items) ? items : [];
}

export async function getPrDetail({ repo = '', number }) {
  const args = ['pr', 'view', String(number), ...repoFlags(repo), '--json', PR_VIEW_FIELDS];
  const res = await execCli('gh', args, { timeoutMs: 25000 });
  return parseJson(res.stdout, null);
}

export async function getPrChecks({ repo = '', number }) {
  const args = [
    'pr',
    'checks',
    String(number),
    ...repoFlags(repo),
    '--json',
    'name,state,bucket,workflow,description,link,startedAt,completedAt',
  ];
  const res = await execCli('gh', args, { timeoutMs: 20000, allowNonZero: true });
  const items = parseJson(res.stdout, null);
  if (Array.isArray(items)) return items;
  return [];
}

export async function getPrDiff({ repo = '', number }) {
  const args = ['pr', 'diff', String(number), ...repoFlags(repo), '--color=never'];
  const res = await execCli('gh', args, { timeoutMs: 30000 });
  return {
    diff: res.stdout || '',
    truncated: Boolean(res.truncated),
  };
}

export async function commentPr({ repo = '', number, body }) {
  const args = ['pr', 'comment', String(number), ...repoFlags(repo), '--body-file', '-'];
  await execCli('gh', args, { stdin: body, timeoutMs: 20000 });
}

export async function reviewPr({ repo = '', number, event = 'comment', body = '' }) {
  const args = ['pr', 'review', String(number), ...repoFlags(repo)];
  if (event === 'approve') args.push('--approve');
  else if (event === 'request-changes') args.push('--request-changes');
  else args.push('--comment');
  if (body.trim() || event !== 'approve') {
    args.push('--body-file', '-');
    await execCli('gh', args, { stdin: body, timeoutMs: 20000 });
  } else {
    await execCli('gh', args, { timeoutMs: 20000 });
  }
}

export async function mergePr({ repo = '', number, method = 'squash', deleteBranch = false }) {
  const args = ['pr', 'merge', String(number), ...repoFlags(repo)];
  if (method === 'merge') args.push('--merge');
  else if (method === 'rebase') args.push('--rebase');
  else args.push('--squash');
  if (deleteBranch) args.push('--delete-branch');
  await execCli('gh', args, { timeoutMs: 30000 });
}

export async function setPrState({ repo = '', number, action }) {
  if (action === 'close') {
    await execCli('gh', ['pr', 'close', String(number), ...repoFlags(repo)], { timeoutMs: 20000 });
  } else if (action === 'reopen') {
    await execCli('gh', ['pr', 'reopen', String(number), ...repoFlags(repo)], { timeoutMs: 20000 });
  } else if (action === 'ready') {
    await execCli('gh', ['pr', 'ready', String(number), ...repoFlags(repo)], { timeoutMs: 20000 });
  } else if (action === 'draft') {
    await execCli('gh', ['pr', 'ready', String(number), '--undo', ...repoFlags(repo)], { timeoutMs: 20000 });
  }
}

export async function checkoutPr({ repo = '', number }) {
  await execCli('gh', ['pr', 'checkout', String(number), ...repoFlags(repo)], { timeoutMs: 30000 });
}

export async function createPr({ repo = '', title, body = '', base = '', draft = false }) {
  const args = ['pr', 'create', ...repoFlags(repo), '--title', title, '--body-file', '-'];
  if (base.trim()) args.push('--base', base.trim());
  if (draft) args.push('--draft');
  const res = await execCli('gh', args, { stdin: body, timeoutMs: 30000 });
  return String(res.stdout || '').trim();
}

export async function getBranchDraftContext({ base = 'main' } = {}) {
  const ref = base.trim() || 'main';
  let commits = '';
  let stat = '';
  try {
    const logRes = await execCli('git', ['log', `${ref}..HEAD`, '--oneline', '-n', '20'], {
      timeoutMs: 8000,
      allowNonZero: true,
    });
    commits = String(logRes.stdout || '').trim();
  } catch {
    // fallback below
  }
  if (!commits) {
    try {
      const logRes = await execCli('git', ['log', '-n', '8', '--oneline'], {
        timeoutMs: 8000,
        allowNonZero: true,
      });
      commits = String(logRes.stdout || '').trim();
    } catch {
      commits = '';
    }
  }
  try {
    const diffRes = await execCli('git', ['diff', '--stat', `${ref}...HEAD`], {
      timeoutMs: 8000,
      allowNonZero: true,
    });
    stat = String(diffRes.stdout || '').trim();
  } catch {
    stat = '';
  }
  return { commits, stat };
}

export async function listIssues({ repo = '', state = 'open', filter = 'all', search = '', limit = 30 } = {}) {
  const args = [
    'issue',
    'list',
    ...repoFlags(repo),
    '--state',
    state,
    '--limit',
    String(limit),
    '--json',
    ISSUE_LIST_FIELDS,
  ];
  if (filter === 'mine') args.push('--author', '@me');
  else if (filter === 'assigned') args.push('--assignee', '@me');
  else if (filter === 'mentioned') args.push('--mention', '@me');
  if (search.trim()) args.push('--search', search.trim());
  const res = await execCli('gh', args, { timeoutMs: 25000 });
  const items = parseJson(res.stdout, []);
  return Array.isArray(items) ? items : [];
}

export async function getIssueDetail({ repo = '', number }) {
  const args = ['issue', 'view', String(number), ...repoFlags(repo), '--json', ISSUE_VIEW_FIELDS];
  const res = await execCli('gh', args, { timeoutMs: 25000 });
  return parseJson(res.stdout, null);
}

export async function commentIssue({ repo = '', number, body }) {
  const args = ['issue', 'comment', String(number), ...repoFlags(repo), '--body-file', '-'];
  await execCli('gh', args, { stdin: body, timeoutMs: 20000 });
}

export async function setIssueState({ repo = '', number, action }) {
  const verb = action === 'reopen' ? 'reopen' : 'close';
  await execCli('gh', ['issue', verb, String(number), ...repoFlags(repo)], { timeoutMs: 20000 });
}

export async function createIssue({ repo = '', title, body = '', labels = [] }) {
  const args = ['issue', 'create', ...repoFlags(repo), '--title', title, '--body-file', '-'];
  for (const label of labels) {
    if (label.trim()) args.push('--label', label.trim());
  }
  const res = await execCli('gh', args, { stdin: body, timeoutMs: 25000 });
  return String(res.stdout || '').trim();
}
