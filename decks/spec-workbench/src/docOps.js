// Pure HTML Visual Doc helpers, sorting, and prompt builders for spec-workbench.
// Browser callers rely on global `DOMParser`; Node tests can pass `{ parseHtml }`.

const STATUS_CLASSES = ['st-planned', 'st-in-progress', 'st-done', 'st-changed', 'st-drift', 'st-dropped'];
const HERO_STATUS_CLASSES = ['s-draft', 's-confirmed', 's-done'];
const TICKET_PILL_CLASSES = ['s-planned', 's-in-progress', 's-done', 's-changed', 's-drift', 's-dropped'];

function defaultParseHtml(html) {
  if (typeof DOMParser === 'function') {
    return new DOMParser().parseFromString(String(html || ''), 'text/html');
  }
  throw new Error('DOMParser is not available; pass { parseHtml }');
}

function serializeDoc(doc) {
  const outer = doc.documentElement ? doc.documentElement.outerHTML : '';
  return `<!doctype html>\n${outer}\n`;
}

function textOf(el) {
  return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
}

function attrOf(el, name) {
  if (!el) return '';
  const direct = el.getAttribute(name);
  if (direct != null) return direct;
  const legacy = name === 'data-doc-id' ? 'data-lumzel-doc' : name.replace(/^data-doc-/, 'data-lumzel-');
  return el.getAttribute(legacy) ?? '';
}

function stripQuestionPrefix(raw) {
  return String(raw || '').replace(/^[❓✓✔?\s]+/, '').trim();
}

function stripWhyPrefix(raw) {
  return String(raw || '').replace(/^(?:为什么|原因|why)\s*[:：]\s*/i, '').trim();
}

function extractDecisionsFromDoc(doc) {
  const blocks = Array.from(doc.querySelectorAll('[data-doc-kind="decisions"], [data-lumzel-kind="decisions"]'));
  const items = [];
  for (const block of blocks) {
    const blockId = attrOf(block, 'data-doc-block') || block.id || 'decisions';
    const blockTitle = textOf(block.querySelector('h2'));
    const nodes = Array.from(block.querySelectorAll('[data-doc-node], [data-lumzel-node]'));
    for (const node of nodes) {
      const id = attrOf(node, 'data-doc-node');
      if (!id) continue;
      const labelEl = node.querySelector('[data-doc-label], [data-lumzel-label]') || node.querySelector('.q');
      const question = stripQuestionPrefix(textOf(labelEl));
      const answer = attrOf(node, 'data-doc-answer').trim();
      const recommend = attrOf(node, 'data-doc-recommend').trim();
      const adr = attrOf(node, 'data-doc-adr').trim();
      const dependsRaw = attrOf(node, 'data-doc-depends');
      const depends = dependsRaw
        ? dependsRaw
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [];
      const optEls = Array.from(node.querySelectorAll('.opts .opt'));
      const options = optEls.map(opt => ({
        label: textOf(opt),
        recommended: opt.classList?.contains('rec') || false,
        chosen: opt.classList?.contains('chosen') || false,
      })).filter(o => o.label);
      const whyEls = Array.from(node.querySelectorAll('.why'));
      const why = whyEls
        .map(w => textOf(w))
        .filter(w => w && !/^ADR\s*[:：]/i.test(w))
        .map(stripWhyPrefix)
        .filter(Boolean)
        .join('；');

      items.push({
        blockId,
        blockTitle,
        id,
        question: question || id,
        answer,
        recommend,
        adr,
        depends,
        options,
        why,
      });
    }
  }
  return items;
}

/**
 * Extract open and settled decisions from a design HTML document.
 * @returns {{ open: Array, settled: Array, all: Array, hasTicketsBlock: boolean }}
 */
export function parseDesignDocQuestions(html, options = {}) {
  const parse = options.parseHtml || defaultParseHtml;
  const doc = parse(html);
  const all = extractDecisionsFromDoc(doc);
  return {
    open: all.filter(item => !item.answer),
    settled: all.filter(item => Boolean(item.answer)),
    all,
    hasTicketsBlock: Boolean(
      doc.querySelector('[data-doc-block="tickets"], [data-lumzel-block="tickets"]'),
    ),
  };
}

/**
 * Extract open and settled choices from a ticket HTML document.
 */
export function parseTicketChoices(html, options = {}) {
  const parse = options.parseHtml || defaultParseHtml;
  const doc = parse(html);
  const all = extractDecisionsFromDoc(doc);
  return {
    open: all.filter(item => !item.answer),
    settled: all.filter(item => Boolean(item.answer)),
    all,
  };
}

function updateHeroDate(doc, todayStr) {
  if (!todayStr) return;
  const root = doc.documentElement;
  if (root) root.setAttribute('data-doc-date', todayStr);
  const pills = Array.from(doc.querySelectorAll('.lumzel-hero .pills .pill'));
  for (const pill of pills) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(textOf(pill))) {
      pill.textContent = todayStr;
      break;
    }
  }
}

/**
 * Update a design doc's top-level status (`draft` | `confirmed` | `done`) and hero status pill.
 */
export function applyDesignStatus(html, nextStatus, todayStr, options = {}) {
  if (!['draft', 'confirmed', 'done'].includes(nextStatus)) {
    throw new Error(`Unsupported design status: ${nextStatus}`);
  }
  const parse = options.parseHtml || defaultParseHtml;
  const doc = parse(html);
  const root = doc.documentElement;
  if (!root) throw new Error('Missing root <html> element');
  root.setAttribute('data-doc-status', nextStatus);
  updateHeroDate(doc, todayStr);

  const pillsContainer = doc.querySelector('.lumzel-hero .pills');
  if (pillsContainer) {
    const pills = Array.from(pillsContainer.querySelectorAll('.pill'));
    let statusPill = pills.find(p => HERO_STATUS_CLASSES.some(c => p.classList?.contains(c)));
    if (!statusPill) {
      statusPill = pills.find(p => ['draft', 'confirmed', 'done'].includes(textOf(p)));
    }
    if (statusPill) {
      for (const cls of HERO_STATUS_CLASSES) statusPill.classList.remove(cls);
      statusPill.classList.add(`s-${nextStatus}`);
      statusPill.textContent = nextStatus;
    } else {
      const span = doc.createElement('span');
      span.className = `pill s-${nextStatus}`;
      span.textContent = nextStatus;
      const kindPill = pillsContainer.querySelector('.pill.kind');
      if (kindPill && kindPill.nextSibling) {
        pillsContainer.insertBefore(span, kindPill.nextSibling);
      } else {
        pillsContainer.appendChild(span);
      }
    }
  }
  return serializeDoc(doc);
}

function applyStatusToChecklistItem(doc, item, nextStatus) {
  item.setAttribute('data-doc-status', nextStatus);
  if (item.classList) {
    item.classList.add('st');
    for (const cls of STATUS_CLASSES) item.classList.remove(cls);
    item.classList.add(`st-${nextStatus}`);
  }
  let pill = item.querySelector('.pill');
  if (!pill) {
    pill = doc.createElement('span');
    item.appendChild(pill);
  }
  if (pill.classList) {
    pill.classList.add('pill');
    for (const cls of TICKET_PILL_CLASSES) pill.classList.remove(cls);
    pill.classList.add(`s-${nextStatus}`);
  } else {
    pill.setAttribute('class', `pill s-${nextStatus}`);
  }
  pill.textContent = nextStatus;
}

/**
 * Mark all `#done-when` items in a ticket HTML as `done` (or revert to `planned`).
 * Ensures `ticketStatus()` & `lumzel check` derive the exact expected ticket status.
 */
export function applyTicketDone(ticketHtml, markDone, todayStr, options = {}) {
  const nextStatus = markDone ? 'done' : 'planned';
  const parse = options.parseHtml || defaultParseHtml;
  const doc = parse(ticketHtml);
  updateHeroDate(doc, todayStr);

  const doneBlock =
    doc.querySelector('[data-doc-block="done-when"], [data-lumzel-block="done-when"]') ||
    doc.getElementById('done-when');
  if (!doneBlock) {
    throw new Error('Ticket is missing #done-when block');
  }
  let items = Array.from(doneBlock.querySelectorAll('[data-doc-node], [data-lumzel-node]')).filter(
    el => (el.closest('[data-doc-block], [data-lumzel-block]') || doneBlock) === doneBlock,
  );
  if (items.length === 0) {
    let checkWrap = doneBlock.querySelector('.check');
    if (!checkWrap) {
      checkWrap = doc.createElement('div');
      checkWrap.className = 'check';
      doneBlock.appendChild(checkWrap);
    }
    const card = doc.createElement('div');
    card.className = `card item st st-${nextStatus}`;
    card.setAttribute('data-doc-node', 'dw-manual');
    card.setAttribute('data-doc-status', nextStatus);
    const box = doc.createElement('span');
    box.className = 'box';
    const labelWrap = doc.createElement('div');
    const label = doc.createElement('span');
    label.setAttribute('data-doc-label', '');
    label.textContent = '已完成验证';
    labelWrap.appendChild(label);
    const pill = doc.createElement('span');
    pill.className = `pill s-${nextStatus}`;
    pill.textContent = nextStatus;
    card.appendChild(box);
    card.appendChild(labelWrap);
    card.appendChild(pill);
    checkWrap.appendChild(card);
    items = [card];
  } else {
    for (const item of items) {
      applyStatusToChecklistItem(doc, item, nextStatus);
    }
  }
  return serializeDoc(doc);
}

/**
 * Sync the `[data-doc-ticket="<ticketPath>"]` checklist item inside `design.html`
 * so `lumzel check` passes after a ticket's `#done-when` status changes.
 */
export function syncDesignTicketItem(designHtml, ticketPath, nextStatus, todayStr, options = {}) {
  const parse = options.parseHtml || defaultParseHtml;
  const doc = parse(designHtml);
  updateHeroDate(doc, todayStr);

  const items = Array.from(doc.querySelectorAll('[data-doc-ticket], [data-lumzel-ticket]'));
  const target = items.find(el => attrOf(el, 'data-doc-ticket') === ticketPath);
  if (target) {
    applyStatusToChecklistItem(doc, target, nextStatus);
  }
  return serializeDoc(doc);
}

/**
 * Convert a free-form feature name into a safe kebab-case Feature id if user leaves id blank.
 */
export function slugifyFeatureId(title, existingIds = []) {
  const existing = new Set(existingIds);
  const ascii = String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let base = ascii && /^[a-z0-9]/.test(ascii) ? ascii.slice(0, 36).replace(/-+$/g, '') : '';
  if (!base) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    base = `feat-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }
  if (!existing.has(base)) return base;
  let seq = 2;
  while (existing.has(`${base}-${seq}`)) seq += 1;
  return `${base}-${seq}`;
}

export function todayIsoDate(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Compute best millisecond timestamp for a feature from disk mtime, store metadata, and doc date.
 */
export function featureSortTimestamp(feature, meta = null, fileMtimeMs = 0) {
  const updatedMs = Number(meta?.updatedAt) || 0;
  const createdMs = Number(meta?.createdAt) || 0;
  const mtime = Number(fileMtimeMs) || 0;
  let dateMs = 0;
  if (feature?.updated && /^\d{4}-\d{2}-\d{2}$/.test(feature.updated)) {
    const parsed = Date.parse(`${feature.updated}T00:00:00`);
    if (Number.isFinite(parsed)) dateMs = parsed;
  }
  return Math.max(mtime, updatedMs, createdMs, dateMs);
}

/**
 * Sort features (including pending features) in reverse chronological order (newest first).
 */
export function sortFeaturesDesc(features, metaMap = {}, fileMtimeMap = {}) {
  return [...(features || [])].sort((a, b) => {
    const ma = metaMap[a.id] || null;
    const mb = metaMap[b.id] || null;
    const ta = featureSortTimestamp(a, ma, fileMtimeMap[a.id] || 0);
    const tb = featureSortTimestamp(b, mb, fileMtimeMap[b.id] || 0);
    if (tb !== ta) return tb - ta;
    const ca = Number(ma?.createdAt) || 0;
    const cb = Number(mb?.createdAt) || 0;
    if (cb !== ca) return cb - ca;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

export function formatShortTime(tsMs, fallbackDate = '') {
  const ts = Number(tsMs);
  if (Number.isFinite(ts) && ts > 0) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return fallbackDate || '';
}

/**
 * Build prompt for replying to a design session (reusing open session or creating a new one with full context).
 */
export function buildDesignReplyPrompt({
  feature,
  answers = [],
  settled = [],
  note = '',
  isNewSession = false,
}) {
  const lines = [];
  if (isNewSession) {
    lines.push(
      `继续推进 Feature ${feature.id}「${feature.title || feature.id}」的方案设计与答疑（新开会话，附完整上下文）。`,
      `设计文档路径：${feature.design}`,
      feature.summary ? `需求概述：${feature.summary}` : '',
      feature.status ? `当前设计状态：${feature.status}` : '',
    );
    if (settled.length) {
      lines.push('', '已确定的历史决策：');
      for (const s of settled) {
        lines.push(`- ${s.id} (${s.question}): ${s.answer}`);
      }
    }
  } else {
    lines.push(`用户在方案工作台 Deck 中对 Feature ${feature.id}「${feature.title || feature.id}」(${feature.design}) 提交了答疑/补充：`);
  }

  if (answers.length) {
    lines.push('', '用户对当前待决问题的回答：');
    for (const a of answers) {
      lines.push(`- [${a.id}] ${a.question} => ${a.value}`);
    }
  }
  if (note && note.trim()) {
    lines.push('', `用户补充说明：${note.trim()}`);
  }

  lines.push(
    '',
    `请根据上述回答与说明更新 ${feature.design}：`,
    '1. 将已回答的 `decisions` 节点写上 `data-doc-answer`（去掉 `.open` 类，把 `.q` 前缀改为 `✓`，`.opts` 中选中项加 `.chosen` 并去掉 `.rec`，更新 `.a` 为 `→ <答案>`）。',
    '2. 根据新决策完善或调整对应设计块；若仍有新衍生问题则补充到 `decisions`（带 `data-doc-recommend`）。',
    '3. 若所有 `decisions` 都已有 `data-doc-answer` 且设计已完整，将 `<html data-doc-status>` 与 hero 状态胶囊（`.pill.s-*`）设为 `confirmed`；若项目配置了 `lumzel` 脚本则运行 `pnpm lumzel check` 校验。',
    '4. 不要生成任何 `docs/results/` 文件；回复简洁说明更新了哪些节点以及下一步建议。',
  );
  return lines.filter(Boolean).join('\n');
}

/**
 * Build prompt for replying to a ticket-cutting session (reusing open session or creating a new one with full context).
 */
export function buildTicketsReplyPrompt({
  feature,
  answers = [],
  tickets = [],
  note = '',
  isNewSession = false,
}) {
  const lines = [];
  if (isNewSession) {
    lines.push(
      `继续推进 Feature ${feature.id}「${feature.title || feature.id}」的工单拆分与决策调整（新开会话，附完整上下文）。`,
      `设计文档路径：${feature.design}`,
      feature.prototype ? `原型路径：${feature.prototype}` : '',
      tickets.length ? '现有工单列表：' : '当前尚无工单。',
      ...tickets.map(tk => `- ${tk.path} (${tk.title}) [${tk.status}]`),
    );
  } else {
    lines.push(`用户在方案工作台 Deck 中对 Feature ${feature.id}「${feature.title || feature.id}」的工单提交了决策/补充：`);
  }

  if (answers.length) {
    lines.push('', '用户对工单决策（choices）的回答：');
    for (const a of answers) {
      lines.push(`- ${a.ticketPath} [${a.id}] ${a.question} => ${a.value}`);
    }
  }
  if (note && note.trim()) {
    lines.push('', `用户补充要求：${note.trim()}`);
  }

  lines.push(
    '',
    '请根据上述回答与要求更新对应工单文件（写上 `data-doc-answer`、同步去掉 `.open` / 更新 `.q` `✓` / `.opts .chosen` / `.a`，调整切片或验收，增删工单时保持 `#delivers` 的 `data-doc-links="<designPath>#<nodeId>"` 并同步 `design.html` 的 `#tickets` 列表），若项目配置了 `lumzel` 脚本则运行 `pnpm lumzel check`。',
    '不要生成任何 `docs/results/` 文件；回复简洁说明改动内容。',
  );
  return lines.filter(Boolean).join('\n');
}
