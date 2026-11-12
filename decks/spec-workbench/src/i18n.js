// Strings of the 方案工作台 Deck. Chinese for a zh browser locale, English for every other one.
const STRINGS = {
  zh: {
    hub: "文档中心",
    refresh: "刷新",
    newFeaturePlus: "＋ 新建 Feature",
    newFeature: "新建 Feature",
    prototypeAct: "做原型",
    ticketsAct: "切工单",
    implementAct: "实现下一张",
    reviewAct: "评审改动",
    prototypeHint: "让 Agent 画可点击原型",
    ticketsHint: "让 Agent 把设计切成工单",
    implementHint: "让 Agent 测试先行实现下一张可开始的工单",
    reviewHint: "让 Agent 按设计 Node 评审当前改动",
    needsConfirmed: "设计确认后才能切工单、做原型",
    implementBlocked: "没有可开始的工单",
    design: "设计",
    tickets: "工单",
    prototype: "原型",
    prototypeScreens: "原型屏",
    emptyTitle: "还没有 Feature",
    emptyHint: "一个 Feature 是一份设计文档（docs/features/<id>/design.html），之后切成工单、画成原型。",
    idHelp: "小写字母、数字和 -，也是文件夹名 docs/features/<id>/",
    nameLabel: "名称",
    briefLabel: "要做什么",
    briefPlaceholder: "一两句话说明要解决的问题",
    cancel: "取消",
    startDesign: "开会话设计",
    done: "完成",
    inProgress: "进行中",
    planned: "未开始",
    ready: "可开始",
    all: "全部",
    confirmed: "已确认",
    draft: "草稿",
    hubCount: "{n} 份设计 / ADR",
    ticketProgress: "工单 {done} / {all}",
    noTicketsYet: "还没有工单",
    screens: "{n} 屏",
    noPrototype: "还没有原型",
    waitingFor: "等 工单 {list}",
    ticketTotal: "共 {n} 张",
    noTicketsConfirmed: "还没有工单。点上方「切工单」让 Agent 切。",
    noTicketsDraft: "还没有工单。设计确认后再切。",
    noTicketsInFilter: "这一栏没有工单",
    docCount: "{n} 份",
    hubEmpty: "docs/ 下还没有设计或 ADR",
    loadFailed: "读不到文档：{reason}",
    previewOnly: "这是市场里的预览，用的是样例项目。安装后才能开会话。",
    sessionOpened: "已开会话 {id}，在左侧会话里看进度",
    sessionFocused: "该任务仍在运行，已定位到会话 {id}",
    idInvalid: "Feature id 只能是小写字母、数字和 -，且不能以 - 开头",
    idTaken: "Feature {id} 已经有了",
  },
  en: {
    hub: "Docs",
    refresh: "Refresh",
    newFeaturePlus: "+ New Feature",
    newFeature: "New Feature",
    prototypeAct: "Prototype",
    ticketsAct: "Cut tickets",
    implementAct: "Implement next",
    reviewAct: "Review changes",
    prototypeHint: "Have an Agent draw a clickable prototype",
    ticketsHint: "Have an Agent cut the design into tickets",
    implementHint: "Have an Agent build the next ready ticket test-first",
    reviewHint: "Have an Agent review the current changes by design Node",
    needsConfirmed: "Confirm the design before cutting tickets or prototyping",
    implementBlocked: "No ticket is ready",
    design: "Design",
    tickets: "Tickets",
    prototype: "Prototype",
    prototypeScreens: "Prototype screens",
    emptyTitle: "No Feature yet",
    emptyHint: "A Feature is one design doc (docs/features/<id>/design.html), later cut into tickets and drawn as a prototype.",
    idHelp: "Lowercase letters, digits and -. Also the folder name docs/features/<id>/",
    nameLabel: "Name",
    briefLabel: "What it is for",
    briefPlaceholder: "One or two sentences on the problem to solve",
    cancel: "Cancel",
    startDesign: "Start a design Session",
    done: "Done",
    inProgress: "In progress",
    planned: "Not started",
    ready: "Ready",
    all: "All",
    confirmed: "Confirmed",
    draft: "Draft",
    hubCount: "{n} designs / ADRs",
    ticketProgress: "Tickets {done} / {all}",
    noTicketsYet: "No tickets yet",
    screens: "{n} screens",
    noPrototype: "No prototype yet",
    waitingFor: "Waiting for {list}",
    ticketTotal: "{n} in total",
    noTicketsConfirmed: "No tickets yet. Press \"Cut tickets\" above to have an Agent cut them.",
    noTicketsDraft: "No tickets yet. Confirm the design first.",
    noTicketsInFilter: "No ticket in this filter",
    docCount: "{n}",
    hubEmpty: "No design or ADR under docs/ yet",
    loadFailed: "Cannot read the docs: {reason}",
    previewOnly: "This is a market preview on a sample project. Install the Deck to open a Session.",
    sessionOpened: "Session {id} opened; follow it in the Session list",
    sessionFocused: "Session {id} is still running; switched to it",
    idInvalid: "A Feature id uses lowercase letters, digits and -, and does not start with -",
    idTaken: "Feature {id} already exists",
  },
};

let locale = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';

export function setLocale(next) {
  if (!next || typeof next !== 'string') return false;
  const resolved = next.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  if (resolved === locale) return false;
  locale = resolved;
  return true;
}

/** `t('ticketTotal', { n: 3 })`: the string for the current locale, with `{name}` filled in. */
export function t(key, vars = {}) {
  const text = STRINGS[locale][key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (raw, name) => (name in vars ? String(vars[name]) : raw));
}

/** Fills every `data-i18n` (text), `data-i18n-title`, `data-i18n-aria` and `data-i18n-placeholder` element. */
export function applyI18n(root = document) {
  document.documentElement.lang = locale;
  document.title = locale === 'zh' ? '方案工作台' : 'Spec Workbench';
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle);
  for (const node of root.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', t(node.dataset.i18nAria));
  for (const node of root.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
}
