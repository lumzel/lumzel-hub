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

function splitRepoSlug(repo) {
  const slug = typeof repo === 'string' ? repo.trim() : '';
  const parts = slug.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

function normalizeGqlPr(node) {
  if (!node || typeof node.number !== 'number') return null;
  const contexts = node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes || [];
  return {
    number: node.number,
    title: node.title || '',
    state: node.state || 'OPEN',
    isDraft: Boolean(node.isDraft),
    author: node.author ? { login: node.author.login } : null,
    labels: Array.isArray(node.labels?.nodes) ? node.labels.nodes : [],
    reviewDecision: node.reviewDecision || null,
    headRefName: node.headRefName || '',
    baseRefName: node.baseRefName || '',
    updatedAt: node.updatedAt || '',
    createdAt: node.createdAt || '',
    url: node.url || '',
    additions: node.additions ?? 0,
    deletions: node.deletions ?? 0,
    changedFiles: node.changedFiles ?? 0,
    comments: { totalCount: node.comments?.totalCount ?? 0 },
    statusCheckRollup: Array.isArray(contexts) ? contexts : [],
  };
}

function normalizeGqlIssue(node) {
  if (!node || typeof node.number !== 'number') return null;
  return {
    number: node.number,
    title: node.title || '',
    state: node.state || 'OPEN',
    author: node.author ? { login: node.author.login } : null,
    labels: Array.isArray(node.labels?.nodes) ? node.labels.nodes : [],
    assignees: Array.isArray(node.assignees?.nodes) ? node.assignees.nodes : [],
    milestone: node.milestone || null,
    comments: { totalCount: node.comments?.totalCount ?? 0 },
    updatedAt: node.updatedAt || '',
    createdAt: node.createdAt || '',
    url: node.url || '',
  };
}

const GQL_PR_FIELDS = `
  number title state isDraft reviewDecision headRefName baseRefName
  updatedAt createdAt url additions deletions changedFiles
  author { login }
  labels(first: 10) { nodes { name color } }
  comments { totalCount }
  commits(last: 1) {
    nodes {
      commit {
        statusCheckRollup {
          contexts(first: 25) {
            nodes {
              ... on CheckRun { name status conclusion }
              ... on StatusContext { name: context state }
            }
          }
        }
      }
    }
  }
`;

const GQL_ISSUE_FIELDS = `
  number title state updatedAt createdAt url
  author { login }
  labels(first: 10) { nodes { name color } }
  assignees(first: 5) { nodes { login } }
  milestone { title }
  comments { totalCount }
`;

export async function listPrsPage({
  repo = '',
  state = 'open',
  filter = 'all',
  search = '',
  limit = 30,
  after = null,
  branch = '',
} = {}) {
  const perPage = Math.max(10, Math.min(100, Number(limit) || 30));
  const slugParts = splitRepoSlug(repo);
  const useSearch = Boolean(search.trim() || filter !== 'all');

  if (slugParts) {
    try {
      if (!useSearch) {
        const statesClause =
          state === 'open'
            ? ', states: [OPEN]'
            : state === 'closed'
              ? ', states: [CLOSED]'
              : state === 'merged'
                ? ', states: [MERGED]'
                : '';
        const query = `query($owner:String!, $name:String!, $first:Int!, $after:String) {
          repository(owner: $owner, name: $name) {
            pullRequests(first: $first, after: $after${statesClause}, orderBy: { field: UPDATED_AT, direction: DESC }) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes { ${GQL_PR_FIELDS} }
            }
          }
        }`;
        const args = ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${slugParts.owner}`, '-f', `name=${slugParts.name}`, '-F', `first=${perPage}`];
        if (after) args.push('-f', `after=${after}`);
        const res = await execCli('gh', args, { timeoutMs: 25000 });
        const data = parseJson(res.stdout, null);
        const conn = data?.data?.repository?.pullRequests;
        if (conn && Array.isArray(conn.nodes)) {
          return {
            items: conn.nodes.map(normalizeGqlPr).filter(Boolean),
            hasMore: Boolean(conn.pageInfo?.hasNextPage),
            endCursor: conn.pageInfo?.endCursor || null,
            totalCount: typeof conn.totalCount === 'number' ? conn.totalCount : null,
          };
        }
      } else {
        const parts = [`repo:${repo}`, 'is:pr'];
        if (state === 'open') parts.push('is:open');
        else if (state === 'closed') parts.push('is:closed', 'is:unmerged');
        else if (state === 'merged') parts.push('is:merged');
        if (filter === 'mine') parts.push('author:@me');
        else if (filter === 'review') parts.push('review-requested:@me');
        else if (filter === 'branch' && branch) parts.push(`head:${branch}`);
        if (search.trim()) parts.push(search.trim());
        parts.push('sort:updated-desc');
        const query = `query($q:String!, $first:Int!, $after:String) {
          search(query: $q, type: ISSUE, first: $first, after: $after) {
            issueCount
            pageInfo { hasNextPage endCursor }
            nodes { ... on PullRequest { ${GQL_PR_FIELDS} } }
          }
        }`;
        const args = ['api', 'graphql', '-f', `query=${query}`, '-f', `q=${parts.join(' ')}`, '-F', `first=${perPage}`];
        if (after) args.push('-f', `after=${after}`);
        const res = await execCli('gh', args, { timeoutMs: 25000 });
        const data = parseJson(res.stdout, null);
        const conn = data?.data?.search;
        if (conn && Array.isArray(conn.nodes)) {
          return {
            items: conn.nodes.map(normalizeGqlPr).filter(Boolean),
            hasMore: Boolean(conn.pageInfo?.hasNextPage),
            endCursor: conn.pageInfo?.endCursor || null,
            totalCount: typeof conn.issueCount === 'number' ? conn.issueCount : null,
          };
        }
      }
    } catch {
      // Fall back to gh pr list on page 1 if GraphQL fails
      if (after) throw new GhCliError('CLI_ERROR', 'Failed to load next page of pull requests');
    }
  }

  const items = await listPrs({ repo, state, filter, search, limit: perPage, branch });
  return { items, hasMore: false, endCursor: null, totalCount: items.length };
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

export async function listIssuesPage({
  repo = '',
  state = 'open',
  filter = 'all',
  search = '',
  limit = 30,
  after = null,
} = {}) {
  const perPage = Math.max(10, Math.min(100, Number(limit) || 30));
  const slugParts = splitRepoSlug(repo);
  const useSearch = Boolean(search.trim() || filter !== 'all');

  if (slugParts) {
    try {
      if (!useSearch) {
        const statesClause =
          state === 'open' ? ', states: [OPEN]' : state === 'closed' ? ', states: [CLOSED]' : '';
        const query = `query($owner:String!, $name:String!, $first:Int!, $after:String) {
          repository(owner: $owner, name: $name) {
            issues(first: $first, after: $after${statesClause}, orderBy: { field: UPDATED_AT, direction: DESC }) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes { ${GQL_ISSUE_FIELDS} }
            }
          }
        }`;
        const args = ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${slugParts.owner}`, '-f', `name=${slugParts.name}`, '-F', `first=${perPage}`];
        if (after) args.push('-f', `after=${after}`);
        const res = await execCli('gh', args, { timeoutMs: 25000 });
        const data = parseJson(res.stdout, null);
        const conn = data?.data?.repository?.issues;
        if (conn && Array.isArray(conn.nodes)) {
          return {
            items: conn.nodes.map(normalizeGqlIssue).filter(Boolean),
            hasMore: Boolean(conn.pageInfo?.hasNextPage),
            endCursor: conn.pageInfo?.endCursor || null,
            totalCount: typeof conn.totalCount === 'number' ? conn.totalCount : null,
          };
        }
      } else {
        const parts = [`repo:${repo}`, 'is:issue'];
        if (state === 'open') parts.push('is:open');
        else if (state === 'closed') parts.push('is:closed');
        if (filter === 'mine') parts.push('author:@me');
        else if (filter === 'assigned') parts.push('assignee:@me');
        else if (filter === 'mentioned') parts.push('mentions:@me');
        if (search.trim()) parts.push(search.trim());
        parts.push('sort:updated-desc');
        const query = `query($q:String!, $first:Int!, $after:String) {
          search(query: $q, type: ISSUE, first: $first, after: $after) {
            issueCount
            pageInfo { hasNextPage endCursor }
            nodes { ... on Issue { ${GQL_ISSUE_FIELDS} } }
          }
        }`;
        const args = ['api', 'graphql', '-f', `query=${query}`, '-f', `q=${parts.join(' ')}`, '-F', `first=${perPage}`];
        if (after) args.push('-f', `after=${after}`);
        const res = await execCli('gh', args, { timeoutMs: 25000 });
        const data = parseJson(res.stdout, null);
        const conn = data?.data?.search;
        if (conn && Array.isArray(conn.nodes)) {
          return {
            items: conn.nodes.map(normalizeGqlIssue).filter(Boolean),
            hasMore: Boolean(conn.pageInfo?.hasNextPage),
            endCursor: conn.pageInfo?.endCursor || null,
            totalCount: typeof conn.issueCount === 'number' ? conn.issueCount : null,
          };
        }
      }
    } catch {
      if (after) throw new GhCliError('CLI_ERROR', 'Failed to load next page of issues');
    }
  }

  const items = await listIssues({ repo, state, filter, search, limit: perPage });
  return { items, hasMore: false, endCursor: null, totalCount: items.length };
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

function extractSignedImages(html, targetMap) {
  if (!html) return;
  const re = /<img[^>]+src="(https:\/\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const signed = m[1].replaceAll('&amp;', '&');
    const uuidMatch = signed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) targetMap.set(uuidMatch[0].toLowerCase(), signed);
    targetMap.set(signed, signed);
  }
}

export async function fetchIssueCommentsPage({ repo = '', number, page = 1, perPage = 50 }) {
  const signedImageMap = new Map();
  if (!repo || number == null) return { items: [], hasMore: false, nextPage: page + 1, signedImageMap };
  const res = await execCli(
    'gh',
    ['api', '-H', 'Accept: application/vnd.github.full+json', `repos/${repo}/issues/${number}/comments?per_page=${perPage}&page=${page}`],
    { timeoutMs: 15000, allowNonZero: true },
  );
  if (res.exitCode !== 0) return { items: [], hasMore: false, nextPage: page + 1, signedImageMap };
  const list = parseJson(res.stdout, []);
  if (!Array.isArray(list)) return { items: [], hasMore: false, nextPage: page + 1, signedImageMap };
  const items = list.map(c => {
    const bodyHtml = c?.body_html || '';
    if (bodyHtml) extractSignedImages(bodyHtml, signedImageMap);
    return {
      kind: 'comment',
      author: c?.user?.login || 'ghost',
      at: c?.created_at || '',
      body: c?.body || '',
      bodyHtml,
      url: c?.url || c?.html_url || '',
      state: '',
    };
  });
  return {
    items,
    hasMore: list.length >= perPage,
    nextPage: page + 1,
    signedImageMap,
  };
}

// Fetch GitHub's own server-rendered body_html (GFM tables, <details>, autolinks, and pre-signed private images).
export async function fetchRenderedHtmlBundle({ repo = '', number, isPr = false }) {
  const result = {
    bodyHtml: '',
    commentHtmlByKey: new Map(), // `${login}|${createdAt}` -> body_html
    reviewHtmlByKey: new Map(), // `${login}|${submittedAt}` -> body_html
    signedImageMap: new Map(),
    commentsHasMore: false,
    commentsPage: 1,
  };
  if (!repo || number == null) return result;

  const perPage = 50;
  const calls = [
    execCli('gh', ['api', '-H', 'Accept: application/vnd.github.full+json', `repos/${repo}/issues/${number}`], {
      timeoutMs: 12000,
      allowNonZero: true,
    }).catch(() => null),
    execCli(
      'gh',
      ['api', '-H', 'Accept: application/vnd.github.full+json', `repos/${repo}/issues/${number}/comments?per_page=${perPage}&page=1`],
      { timeoutMs: 12000, allowNonZero: true },
    ).catch(() => null),
    isPr
      ? execCli(
          'gh',
          ['api', '-H', 'Accept: application/vnd.github.full+json', `repos/${repo}/pulls/${number}/reviews?per_page=100`],
          { timeoutMs: 12000, allowNonZero: true },
        ).catch(() => null)
      : Promise.resolve(null),
  ];

  const [issueRes, commentsRes, reviewsRes] = await Promise.all(calls);

  if (issueRes?.exitCode === 0) {
    const data = parseJson(issueRes.stdout, null);
    if (data?.body_html) {
      result.bodyHtml = data.body_html;
      extractSignedImages(data.body_html, result.signedImageMap);
    }
  }
  if (commentsRes?.exitCode === 0) {
    const list = parseJson(commentsRes.stdout, []);
    if (Array.isArray(list)) {
      result.commentsHasMore = list.length >= perPage;
      for (const c of list) {
        if (!c?.body_html) continue;
        const login = c.user?.login || '';
        const key = `${login}|${c.created_at || ''}`;
        result.commentHtmlByKey.set(key, c.body_html);
        if (c.url) result.commentHtmlByKey.set(c.url, c.body_html);
        extractSignedImages(c.body_html, result.signedImageMap);
      }
    }
  }
  if (reviewsRes?.exitCode === 0) {
    const list = parseJson(reviewsRes.stdout, []);
    if (Array.isArray(list)) {
      for (const r of list) {
        if (!r?.body_html) continue;
        const login = r.user?.login || '';
        const key = `${login}|${r.submitted_at || ''}`;
        result.reviewHtmlByKey.set(key, r.body_html);
        extractSignedImages(r.body_html, result.signedImageMap);
      }
    }
  }
  return result;
}

const IMAGE_FETCH_PY = [
  'import sys, urllib.request, urllib.parse, base64',
  'url = sys.argv[1]',
  'u = urllib.parse.urlparse(url)',
  'allowed = ("github.com","avatars.githubusercontent.com","private-user-images.githubusercontent.com","user-images.githubusercontent.com","raw.githubusercontent.com","camo.githubusercontent.com","objects.githubusercontent.com")',
  'if u.scheme != "https" or u.hostname not in allowed: sys.exit(2)',
  'req = urllib.request.Request(url, headers={"User-Agent": "Lumzel-GitHub-Deck"})',
  'with urllib.request.urlopen(req, timeout=12) as r:',
  '  ct = (r.headers.get_content_type() or "").lower()',
  '  if not ct.startswith("image/"): sys.exit(3)',
  '  data = r.read(680001)',
  '  if len(data) > 680000: print("TOO_LARGE"); sys.exit(0)',
  '  print(f"data:{ct};base64," + base64.b64encode(data).decode("ascii"))',
].join('\n');

// Fetch an allowlisted GitHub image URL into a data:image/... URI so it renders under offline DECK_CSP.
export async function fetchImageDataUrl(url) {
  if (!url || !url.startsWith('https://')) return null;
  try {
    const res = await execCli('python3', ['-c', IMAGE_FETCH_PY, url], { timeoutMs: 15000, allowNonZero: true });
    if (res.exitCode !== 0) return null;
    const out = String(res.stdout || '').trim();
    if (out === 'TOO_LARGE') return 'TOO_LARGE';
    if (out.startsWith('data:image/')) return out;
    return null;
  } catch {
    return null;
  }
}

const DETECT_INSTALL_PY = [
  'import json, platform, shutil',
  'sysname = platform.system().lower()',
  'bins = {k: bool(shutil.which(k)) for k in ("brew","port","apt-get","dnf","pacman","winget","scoop","choco")}',
  'print(json.dumps({"system": sysname, "bins": bins}))',
].join('\n');

// Detect the current platform and available package manager so the user gets an accurate gh install command.
export async function detectGhInstallPlan() {
  const docUrl = 'https://cli.github.com';
  let system = '';
  let bins = {};
  try {
    const res = await execCli('python3', ['-c', DETECT_INSTALL_PY], { timeoutMs: 5000, allowNonZero: true });
    if (res.exitCode === 0) {
      const parsed = parseJson(res.stdout, null);
      if (parsed && typeof parsed === 'object') {
        system = String(parsed.system || '').toLowerCase();
        bins = parsed.bins && typeof parsed.bins === 'object' ? parsed.bins : {};
      }
    }
  } catch {
    // Fall back to navigator.platform below when python3 is unavailable or not yet granted.
  }

  if (!system && typeof navigator !== 'undefined') {
    const plat = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
    if (plat.includes('mac')) system = 'darwin';
    else if (plat.includes('win')) system = 'windows';
    else if (plat.includes('linux')) system = 'linux';
  }

  if (system === 'darwin') {
    if (bins.brew) {
      return { supported: true, platform: 'macos', manager: 'brew', command: 'brew install gh', docUrl, reason: '' };
    }
    if (bins.port) {
      return { supported: true, platform: 'macos', manager: 'port', command: 'sudo port install gh', docUrl, reason: '' };
    }
    // If python3 probe returned bins without brew/port, report missing package manager rather than failing blindly.
    if (Object.keys(bins).length > 0) {
      return { supported: false, platform: 'macos', manager: '', command: '', docUrl, reason: 'missing_pkg_manager' };
    }
    return { supported: true, platform: 'macos', manager: 'brew', command: 'brew install gh', docUrl, reason: '' };
  }
  if (system === 'windows') {
    if (bins.winget) {
      return { supported: true, platform: 'windows', manager: 'winget', command: 'winget install --id GitHub.cli', docUrl, reason: '' };
    }
    if (bins.scoop) {
      return { supported: true, platform: 'windows', manager: 'scoop', command: 'scoop install gh', docUrl, reason: '' };
    }
    if (bins.choco) {
      return { supported: true, platform: 'windows', manager: 'choco', command: 'choco install gh', docUrl, reason: '' };
    }
    return { supported: false, platform: 'windows', manager: '', command: '', docUrl, reason: 'missing_pkg_manager' };
  }
  if (system === 'linux') {
    if (bins['apt-get']) {
      return {
        supported: true,
        platform: 'linux',
        manager: 'apt-get',
        command: 'sudo apt-get update && sudo apt-get install -y gh',
        docUrl,
        reason: '',
      };
    }
    if (bins.dnf) {
      return { supported: true, platform: 'linux', manager: 'dnf', command: 'sudo dnf install -y gh', docUrl, reason: '' };
    }
    if (bins.pacman) {
      return { supported: true, platform: 'linux', manager: 'pacman', command: 'sudo pacman -S --needed github-cli', docUrl, reason: '' };
    }
    return { supported: false, platform: 'linux', manager: '', command: '', docUrl, reason: 'missing_pkg_manager' };
  }
  return { supported: false, platform: system || 'unknown', manager: '', command: '', docUrl, reason: 'unsupported_platform' };
}
