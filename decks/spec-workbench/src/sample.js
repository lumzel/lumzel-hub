// The project this Deck shows in a market preview, before it is installed. There `deck.context()` answers
// `preview: true` and every other call is refused, so the list below stands in for `deck.docs.index()` and
// the pages it names open from this Deck's own `sample/` folder instead of the Worktree.
const ticket = (file, n, title, status, ready, blockedBy = []) => ({
  path: `docs/features/invoice-cache/tickets/${file}`,
  n,
  title: `${n} ${title}`,
  status,
  ready,
  blockedBy: blockedBy.map(name => `docs/features/invoice-cache/tickets/${name}`),
});

const tickets = [
  ticket('01-read-path.html', '01', '读路径：命中不查库', 'done', false),
  ticket('02-miss-load.html', '02', '没命中：查库回填，并发只查一次', 'in-progress', true, ['01-read-path.html']),
  ticket('03-evict.html', '03', '写后删除', 'planned', false, ['02-miss-load.html']),
];
const [readPath, missLoad, evict] = tickets.map(row => row.path);

export const SAMPLE_INDEX = {
  features: [
    {
      id: 'invoice-cache',
      title: '发票读取缓存',
      summary: '读路径前面加一层 Redis 缓存，写后删除，目标 p95 低于 20 ms。',
      status: 'confirmed',
      updated: '2026-11-12',
      design: 'docs/features/invoice-cache/design.html',
      prototype: null,
      screens: [],
      tickets,
      nodeTickets: {
        read: [readPath],
        'get-invoice': [readPath],
        redis: [readPath],
        'miss-load': [missLoad],
        'cache-service': [missLoad],
        evict: [evict],
      },
    },
    {
      id: 'pdf-export',
      title: '发票导出 PDF',
      summary: '把一批发票打成一个 PDF。设计还在问问题。',
      status: 'draft',
      updated: '2026-11-12',
      design: 'docs/features/pdf-export/design.html',
      prototype: null,
      screens: [],
      tickets: [],
      nodeTickets: {},
    },
  ],
  docs: [
    {
      path: 'docs/features/invoice-cache/design.html',
      title: '发票读取缓存',
      summary: '读路径前面加一层 Redis 缓存，写后删除。',
      status: 'confirmed',
      updated: '2026-11-12',
      group: 'design',
    },
    {
      path: 'docs/features/pdf-export/design.html',
      title: '发票导出 PDF',
      summary: '把一批发票打成一个 PDF。',
      status: 'draft',
      updated: '2026-11-12',
      group: 'design',
    },
    {
      path: 'docs/adr/0001-cache-store.html',
      title: '缓存用 Redis，不用进程内',
      summary: '发票读取缓存放在 Redis。',
      status: 'confirmed',
      updated: '2026-11-12',
      group: 'adr',
    },
  ],
};
