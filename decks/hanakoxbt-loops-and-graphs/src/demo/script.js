import { lessonId } from '../lib/constraints.js';
import { getLocale } from '../i18n.js';

const BASE_EPOCH = 1763200000;

function isZh() {
  return getLocale().startsWith('zh');
}

export function getDemoGoal(preset) {
  if (preset === 'code-review') {
    return '';
  }
  return isZh()
    ? '发票列表增加 CSV 导出与按日期筛选'
    : 'Add CSV export and date range filter to invoices';
}

export function getDemoUnits() {
  const zh = isZh();
  return [
    {
      id: 'csv-serializer',
      title: zh ? 'CSV 序列化器与字段转义' : 'RFC-4180 CSV serializer',
      goal: zh ? '实现安全的 CSV 单元格转义与 BOM 编码' : 'Escape quotes, commas, newlines, and UTF-8 BOM',
      checkFiles: ['src/export/csv.test.ts'],
      implFiles: ['src/export/csv.ts'],
      checkCmd: 'pnpm vitest run src/export/csv.test.ts',
    },
    {
      id: 'export-endpoint',
      title: zh ? '导出接口 /api/invoices/export' : 'Invoice export API endpoint',
      goal: zh ? '流式响应 CSV 并附带 Content-Disposition' : 'Stream CSV with Content-Disposition attachment header',
      checkFiles: ['src/api/routes/export.test.ts'],
      implFiles: ['src/api/routes/export.ts'],
      checkCmd: 'pnpm vitest run src/api/routes/export.test.ts',
    },
    {
      id: 'date-filter-ui',
      title: zh ? '日期范围筛选控件' : 'Date range filter control',
      goal: zh ? '支持快捷区间与非 UTC 时区边界校验' : 'Date range picker with UTC day boundary normalization',
      checkFiles: ['src/ui/date-filter.test.tsx'],
      implFiles: ['src/ui/date-filter.tsx'],
      checkCmd: 'pnpm vitest run src/ui/date-filter.test.tsx',
    },
    {
      id: 'filter-query',
      title: zh ? '列表与导出查询过滤参数' : 'Invoice query date filtering',
      goal: zh ? '按 from/to 参数过滤发票数据库查询' : 'Apply from/to UTC timestamps to invoice query builder',
      checkFiles: ['src/db/invoices.test.ts'],
      implFiles: ['src/db/invoices.ts'],
      checkCmd: 'pnpm vitest run src/db/invoices.test.ts',
    },
    {
      id: 'export-button',
      title: zh ? '导出按钮与下载状态反馈' : 'Export toolbar button',
      goal: zh ? '透传当前筛选参数触发 CSV 下载' : 'Pass active date filter params to CSV download',
      checkFiles: ['src/ui/export-button.test.tsx'],
      implFiles: ['src/ui/export-button.tsx'],
      checkCmd: 'pnpm vitest run src/ui/export-button.test.tsx',
    },
  ];
}

export function getDemoConstraints() {
  const zh = isZh();
  const c1 = zh
    ? '所有 API 路由修改必须附带 HTTP 状态码集成测试，不得仅测纯函数。'
    : 'Include HTTP status integration assertions for every new or updated API route.';
  const c2 = zh
    ? '禁止修改现有测试断言以适配实现；环境依赖错误需检查 setupCmd。'
    : 'Never relax existing test assertions to match implementation; fix setupCmd for env errors.';
  return [
    {
      id: lessonId(c1),
      text: c1,
      scope: 'check',
      status: 'active',
      evidence: 'run 7f3a · export-endpoint',
      source: { runId: '7f3a0011', workflowId: 'feature-ship' },
      hits: 2,
      createdAt: BASE_EPOCH - 86400 * 3,
      updatedAt: BASE_EPOCH - 3600,
    },
    {
      id: lessonId(c2),
      text: c2,
      scope: 'impl',
      status: 'active',
      evidence: 'run 6b12 · green_gate',
      source: { runId: '6b129004', workflowId: 'feature-ship' },
      hits: 4,
      createdAt: BASE_EPOCH - 86400 * 7,
      updatedAt: BASE_EPOCH - 7200,
    },
  ];
}

export function getDemoLessonProposal(preset) {
  const zh = isZh();
  if (preset === 'code-review') {
    const text = zh
      ? '涉及日期或金额格式化模块跨 2 个以上文件变更时，提交审查前先核对时区边界。'
      : 'Recurring correctness issue across 2 files: verify UTC boundary handling before review.';
    return {
      id: lessonId(text),
      text,
      scope: 'review',
      evidence: 'src/export/csv.ts:48, src/db/invoices.ts:91',
    };
  }
  const text = zh
    ? '日期比较一律使用 UTC 日边界，测试需覆盖非 UTC 时区。'
    : 'Compare dates on UTC day boundaries; tests must cover a non-UTC timezone.';
  return {
    id: lessonId(text),
    text,
    scope: 'impl',
    evidence: 'date-filter-ui: green×3 · sig: expected 2026-11-14 received 2026-11-15',
  };
}

export function getFeatureShipTimeline() {
  // Keyframe operations [tMs, op, args]
  return [
    [0, 'nodeStart', { id: 'preflight', iter: 1, round: 1 }],
    [1200, 'nodeOk', { id: 'preflight', iter: 1 }],
    [1300, 'nodeStart', { id: 'preflight_gate', iter: 1, round: 1 }],
    [1500, 'nodeOk', { id: 'preflight_gate', iter: 1 }],
    [1600, 'nodeStart', { id: 'split', iter: 1, round: 1 }],
    [8500, 'nodeOk', { id: 'split', iter: 1 }],
    [8600, 'nodeStart', { id: 'plan', iter: 1, round: 1 }],
    [9000, 'nodeOk', { id: 'plan', iter: 1 }],
    [10000, 'nodeStart', { id: 'units', iter: 1, round: 1 }],
    [10000, 'notice', { u: 'csv-serializer', p: 'start', s: 'info', a: 0, m: 'RFC-4180 CSV serializer' }],
    [10000, 'notice', { u: 'export-endpoint', p: 'start', s: 'info', a: 0, m: 'Invoice export API' }],
    [10000, 'notice', { u: 'date-filter-ui', p: 'start', s: 'info', a: 0, m: 'Date range filter' }],
    [14000, 'notice', { u: 'csv-serializer', p: 'red', s: 'pass', a: 1, m: '' }],
    [15000, 'notice', { u: 'export-endpoint', p: 'red', s: 'pass', a: 1, m: '' }],
    [15500, 'notice', { u: 'date-filter-ui', p: 'red', s: 'fail', a: 1, m: 'environment: TZ not configured' }],
    [18500, 'notice', { u: 'date-filter-ui', p: 'red', s: 'pass', a: 2, m: '' }],
    [20000, 'notice', { u: 'csv-serializer', p: 'green', s: 'pass', a: 1, m: '' }],
    [21500, 'notice', { u: 'csv-serializer', p: 'done', s: 'pass', a: 1, m: 'c18f2a9' }],
    [22000, 'notice', { u: 'export-endpoint', p: 'green', s: 'fail', a: 1, m: 'expected 200 received 404' }],
    [24500, 'notice', { u: 'date-filter-ui', p: 'green', s: 'fail', a: 1, m: 'expected Nov 14 received Nov 15' }],
    [26500, 'notice', { u: 'export-endpoint', p: 'green', s: 'pass', a: 2, m: '' }],
    [27500, 'notice', { u: 'date-filter-ui', p: 'green', s: 'fail', a: 2, m: 'tz offset -08:00 mismatch' }],
    [28000, 'notice', { u: 'export-endpoint', p: 'done', s: 'pass', a: 2, m: '9a4e10b' }],
    [30000, 'notice', { u: 'date-filter-ui', p: 'green', s: 'fail', a: 3, m: 'tz boundary assertion' }],
    [31000, 'notice', { u: 'filter-query', p: 'start', s: 'info', a: 0, m: 'Query builder filter' }],
    [31000, 'notice', { u: 'export-button', p: 'start', s: 'info', a: 0, m: 'Export toolbar button' }],
    [35000, 'notice', { u: 'filter-query', p: 'red', s: 'pass', a: 1, m: '' }],
    [36000, 'notice', { u: 'export-button', p: 'red', s: 'pass', a: 1, m: '' }],
    [41000, 'notice', { u: 'filter-query', p: 'green', s: 'pass', a: 1, m: '' }],
    [42000, 'notice', { u: 'export-button', p: 'green', s: 'pass', a: 1, m: '' }],
    [43500, 'notice', { u: 'filter-query', p: 'done', s: 'pass', a: 1, m: '4d20c8e' }],
    [44000, 'notice', { u: 'export-button', p: 'done', s: 'pass', a: 1, m: 'b831f02' }],
    [45000, 'nodeOk', { id: 'units', iter: 1 }],
    [45200, 'nodeStart', { id: 'integrate', iter: 1, round: 1 }],
    [52000, 'nodeOk', { id: 'integrate', iter: 1 }],
    [52200, 'nodeStart', { id: 'integrate_gate', iter: 1, round: 1 }],
    [53000, 'nodeOk', { id: 'integrate_gate', iter: 1 }],
    [53100, 'gateWait', { id: 'human_gate', iter: 1, round: 1 }],
  ];
}

export function getCodeReviewTimeline() {
  return [
    [0, 'nodeStart', { id: 'scope', iter: 1, round: 1 }],
    [1200, 'nodeOk', { id: 'scope', iter: 1 }],
    [1300, 'nodeStart', { id: 'scope_gate', iter: 1, round: 1 }],
    [1500, 'nodeOk', { id: 'scope_gate', iter: 1 }],
    [1800, 'nodeStart', { id: 'lenses', iter: 1, round: 1 }],
    [1800, 'nodeStart', { id: 'checks', iter: 1, round: 1 }],
    [2200, 'notice', { u: 'correctness', p: 'start', s: 'info', a: 0, m: '' }],
    [2200, 'notice', { u: 'security', p: 'start', s: 'info', a: 0, m: '' }],
    [2200, 'notice', { u: 'performance', p: 'start', s: 'info', a: 0, m: '' }],
    [2200, 'notice', { u: 'tests', p: 'start', s: 'info', a: 0, m: '' }],
    [5500, 'notice', { u: 'security', p: 'evidence', s: 'fail', a: 1, m: 'quote not found in src/api/routes/export.ts' }],
    [7000, 'notice', { u: 'correctness', p: 'evidence', s: 'pass', a: 1, m: '' }],
    [8200, 'notice', { u: 'performance', p: 'evidence', s: 'pass', a: 1, m: '' }],
    [9500, 'notice', { u: 'tests', p: 'evidence', s: 'pass', a: 1, m: '' }],
    [11000, 'notice', { u: 'security', p: 'evidence', s: 'pass', a: 2, m: 'dropped 1 unverifiable item' }],
    [12000, 'nodeOk', { id: 'checks', iter: 1 }],
    [12200, 'nodeOk', { id: 'lenses', iter: 1 }],
    [12400, 'nodeStart', { id: 'merge', iter: 1, round: 1 }],
    [14500, 'nodeOk', { id: 'merge', iter: 1 }],
    [14700, 'nodeStart', { id: 'learn', iter: 1, round: 1 }],
    [16000, 'nodeOk', { id: 'learn', iter: 1 }],
    [16200, 'complete', {}],
  ];
}

export function buildFeatureShipOutputs(tMs, reworks = 0, approved = false) {
  const units = getDemoUnits();
  const cList = getDemoConstraints();
  const out = {};

  if (tMs >= 1200) {
    out.preflight = {
      isGit: true,
      clean: true,
      dirty: [],
      dirtyCount: 0,
      reason: '',
      branch: 'main',
      headSha: '8c14a9b2f0e3d19a',
      constraintsText: cList.map((c, i) => `C${i + 1}. ${c.text}`).join('\n'),
      constraintCount: cList.length,
      constraintIds: cList.map(c => c.id),
      fullCheckCmd: 'pnpm test',
      setupCmd: '',
      repoHints: 'root entries: package.json pnpm-lock.yaml src tests',
      presetUnits: [],
    };
  }
  if (tMs >= 1500) {
    out.preflight_gate = { passed: true };
  }
  if (tMs >= 8500) {
    out.split = {
      fullCheckCmd: 'pnpm test',
      units: units.map(u => ({ ...u, prompt: `Implement ${u.title}` })),
    };
  }
  if (tMs >= 9000) {
    out.plan = {
      units: units.map(u => ({ ...u, prompt: `Implement ${u.title}`, commitMessage: `feat(${u.id}): ${u.title}` })),
      count: units.length,
      rejected: [],
      source: 'split',
      fullCheckCmd: 'pnpm test',
    };
  }
  if (tMs >= 45000) {
    out.units = {
      items: out.plan.units,
      passedCount: 4,
      failedCount: 1,
      retries: 4,
      results: [
        {
          index: 0,
          item: out.plan.units[0],
          ok: true,
          branch: null,
          retries: 0,
          outputs: {
            lane_start: { unit: 'csv-serializer', startedAt: BASE_EPOCH + 10 },
            red_gate: { ok: true, attempt: 1, max: 2 },
            green_gate: { ok: true, attempt: 1, max: 3 },
            unit_report: { unit: 'csv-serializer', sha: '8c14a9b', insertions: 120, deletions: 4, attempts: 1 },
          },
        },
        {
          index: 1,
          item: out.plan.units[1],
          ok: true,
          branch: null,
          retries: 1,
          outputs: {
            lane_start: { unit: 'export-endpoint', startedAt: BASE_EPOCH + 10 },
            red_gate: { ok: true, attempt: 1, max: 2 },
            green_gate: { ok: true, attempt: 2, max: 3, signature: 'expected 200 received 404' },
            verify_green: { ok: true, code: 0, stdout: 'PASS src/api/routes/export.test.ts (6 tests)', stderr: '' },
            unit_report: { unit: 'export-endpoint', sha: '8c14a9b', insertions: 108, deletions: 22, attempts: 2 },
          },
        },
        {
          index: 2,
          item: out.plan.units[2],
          ok: false,
          branch: null,
          retries: 3,
          error: "node 'green_gate' exceeded maxIterations (3)",
          outputs: {
            lane_start: { unit: 'date-filter-ui', startedAt: BASE_EPOCH + 10 },
            red_gate: { ok: true, attempt: 2, max: 2 },
            green_gate: {
              ok: false,
              attempt: 3,
              max: 3,
              reason: 'tz boundary assertion',
              signature: 'AssertionError: expected 2026-11-14 received 2026-11-15',
            },
            verify_green: {
              ok: false,
              code: 1,
              stdout: 'FAIL src/ui/date-filter.test.tsx',
              stderr: 'AssertionError: expected "2026-11-14" received "2026-11-15" (TZ=America/Los_Angeles)',
            },
          },
        },
        {
          index: 3,
          item: out.plan.units[3],
          ok: true,
          branch: null,
          retries: 0,
          outputs: {
            lane_start: { unit: 'filter-query', startedAt: BASE_EPOCH + 31 },
            red_gate: { ok: true, attempt: 1, max: 2 },
            green_gate: { ok: true, attempt: 1, max: 3 },
            unit_report: { unit: 'filter-query', sha: '8c14a9b', insertions: 96, deletions: 38, attempts: 1 },
          },
        },
        {
          index: 4,
          item: out.plan.units[4],
          ok: true,
          branch: null,
          retries: 0,
          outputs: {
            lane_start: { unit: 'export-button', startedAt: BASE_EPOCH + 31 },
            red_gate: { ok: true, attempt: 1, max: 2 },
            green_gate: { ok: true, attempt: 1, max: 3 },
            unit_report: { unit: 'export-button', sha: '8c14a9b', insertions: 88, deletions: 24, attempts: 1 },
          },
        },
      ],
    };
  }

  const candidate = {
    source: reworks > 0 ? 'rework' : 'integrate',
    round: reworks,
    branch: 'main',
    sha: '8c14a9b2f0e3d19a',
    baseSha: '8c14a9b2f0e3d19a',
    passed: 4,
    total: 5,
    checkOk: true,
    checkReason: '',
    checkCmd: 'pnpm test',
    checkTail: 'Test Files  14 passed (14)\n     Tests  86 passed (86)\n  Duration  2.14s',
    filesChanged: 17,
    insertions: 412 + reworks * 14,
    deletions: 88 + reworks * 4,
    files: [
      { path: 'src/export/csv.ts', add: 120, del: 4 },
      { path: 'src/api/routes/export.ts', add: 64, del: 10 },
      { path: 'src/db/invoices.ts', add: 58, del: 24 },
      { path: 'src/ui/export-button.tsx', add: 52, del: 12 },
      { path: 'src/export/csv.test.ts', add: 48, del: 0 },
      { path: 'src/api/routes/export.test.ts', add: 36, del: 8 },
      { path: 'src/db/invoices.test.ts', add: 22, del: 14 },
      { path: 'pnpm-lock.yaml', add: 12, del: 16 },
    ],
    risk: {
      level: 'medium',
      flags: [
        { level: 'medium', label: 'dependency lockfile changed', paths: ['pnpm-lock.yaml'] },
        { level: 'low', label: '1 unit(s) failed after bounded retries — excluded' },
      ],
    },
    mergeMessage: 'feat(loops-and-graphs): csv-export-date-filter',
  };

  if (tMs >= 52000) {
    out.integrate = {
      shippable: true,
      merged: [
        { id: 'csv-serializer' },
        { id: 'export-endpoint' },
        { id: 'filter-query' },
        { id: 'export-button' },
      ],
      conflicted: [],
      failed: [{ id: 'date-filter-ui', attempts: 3, phase: 'green' }],
      check: { ok: true, reason: '', code: 0, tail: candidate.checkTail },
      risk: candidate.risk,
      branch: candidate.branch,
      sha: candidate.sha,
    };
  }
  if (tMs >= 53000) {
    out.integrate_gate = { passed: true };
  }
  if (reworks > 0) {
    out.rework = { text: 'Applied review changes directly in current worktree.' };
    out.reverify = { ok: true, round: reworks, branch: 'main', sha: candidate.sha, check: { ok: true, code: 0 } };
  }
  if (approved) {
    out.human_gate = { decision: 'approve', payload: { by: 'deck', at: BASE_EPOCH + 57 } };
    if (tMs >= 61000) {
      out.ship = { ok: true, code: 0, stdout: 'Changes kept in working tree on main', stderr: '' };
    }
    if (tMs >= 64000) {
      out.retro = { shipped: true, stats: { units: 5, passed: 4, retries: 4, reworks } };
    }
    if (tMs >= 69000) {
      const prop = getDemoLessonProposal('feature-ship');
      out.distill = { text: JSON.stringify({ lessons: [prop] }, null, 2) };
      out.record = { lessons: [prop], shipped: true, stats: { units: 5, passed: 4, retries: 4, reworks } };
    }
    if (tMs >= 71500) {
      out.finish = { passed: true };
    }
  }

  return { outputs: out, candidate };
}

export function buildCodeReviewOutputs(tMs) {
  const zh = isZh();
  const cList = getDemoConstraints().filter(c => c.scope === 'review' || c.scope === 'general');
  const lenses = [
    { id: 'correctness', focus: 'logic errors, edge cases, error paths' },
    { id: 'security', focus: 'injection, authz gaps, secrets' },
    { id: 'performance', focus: 'hot-path cost, unbounded work' },
    { id: 'tests', focus: 'missing or weak tests' },
  ];
  const out = {};
  if (tMs >= 1200) {
    out.scope = {
      base: 'main',
      mergeBase: '8c14a9b',
      files: [
        'src/export/csv.ts',
        'src/api/routes/export.ts',
        'src/db/invoices.ts',
        'src/ui/export-button.tsx',
        'src/export/csv.test.ts',
      ],
      lenses,
      checkCmd: 'pnpm test',
      constraintsText: cList.map((c, i) => `C${i + 1}. ${c.text}`).join('\n') || '(none)',
      constraintCount: cList.length,
    };
  }
  if (tMs >= 1500) {
    out.scope_gate = { passed: true };
  }
  if (tMs >= 12000) {
    out.checks = {
      ok: true,
      code: 0,
      stdout: 'Test Files  14 passed (14)\nTests       86 passed (86)',
      stderr: '',
    };
  }
  if (tMs >= 12200) {
    out.lenses = {
      items: lenses,
      passedCount: 4,
      failedCount: 0,
      retries: 1,
      results: [
        { index: 0, item: lenses[0], ok: true, retries: 0, outputs: { evidence: { ok: true, attempt: 1, dropped: 0 } } },
        { index: 1, item: lenses[1], ok: true, retries: 1, outputs: { evidence: { ok: true, attempt: 2, dropped: 1 } } },
        { index: 2, item: lenses[2], ok: true, retries: 0, outputs: { evidence: { ok: true, attempt: 1, dropped: 0 } } },
        { index: 3, item: lenses[3], ok: true, retries: 0, outputs: { evidence: { ok: true, attempt: 1, dropped: 0 } } },
      ],
    };
  }
  if (tMs >= 14500) {
    out.merge = {
      verdict: 'attention',
      counts: { high: 0, medium: 3, low: 5 },
      files: 14,
      checks: { skipped: false, ok: true, code: 0, tail: '86 passed' },
      lensStatus: [
        { id: 'correctness', ok: true, retries: 0, dropped: 0 },
        { id: 'security', ok: true, retries: 1, dropped: 1 },
        { id: 'performance', ok: true, retries: 0, dropped: 0 },
        { id: 'tests', ok: true, retries: 0, dropped: 0 },
      ],
      findings: [
        {
          severity: 'medium',
          file: 'src/export/csv.ts',
          line: 48,
          title: zh ? '公式前缀字符 (=,+,-,@) 未转义，存在 CSV 注入风险' : 'Formula prefix chars (=,+,-,@) not neutralized in CSV cell',
          evidence: '`return `"${s.replace(/"/g, \'""\')}"`;`',
          lenses: ['security', 'correctness'],
        },
        {
          severity: 'medium',
          file: 'src/db/invoices.ts',
          line: 91,
          title: zh ? '日期区间筛选未使用 UTC 日结束边界 (23:59:59.999Z)' : 'End date filter excludes same-day timestamps after 00:00Z',
          evidence: '`where("issued_at", "<=", toDate)`',
          lenses: ['correctness'],
        },
        {
          severity: 'medium',
          file: 'src/api/routes/export.ts',
          line: 34,
          title: zh ? '大结果集一次性缓冲后返回，缺少流式分块' : 'Buffers full invoice result in memory before sending CSV',
          evidence: '`const rows = await queryInvoices(filters);`',
          lenses: ['performance'],
        },
      ],
    };
  }
  if (tMs >= 16000) {
    out.learn = {
      verdict: 'attention',
      lessons: [getDemoLessonProposal('code-review')],
    };
  }
  return out;
}
