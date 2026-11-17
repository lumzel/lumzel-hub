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
    const isZh = String(options.locale || 'en').toLowerCase().startsWith('zh');
    label.textContent = isZh ? '已完成验证' : 'Verified';
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
 * Remove a deleted ticket's checklist item from `design.html` and clean up
 * any `data-doc-blocked-by` or `data-doc-links` references to it.
 */
export function removeDesignTicketItem(designHtml, ticketPath, todayStr, options = {}) {
  const parse = options.parseHtml || defaultParseHtml;
  const doc = parse(designHtml);
  updateHeroDate(doc, todayStr);

  const items = Array.from(doc.querySelectorAll('[data-doc-ticket], [data-lumzel-ticket]'));
  const target = items.find(el => attrOf(el, 'data-doc-ticket') === ticketPath);
  const removedNodeId = target ? attrOf(target, 'data-doc-node').trim() : '';
  if (target) {
    target.remove();
  }

  if (removedNodeId) {
    const remaining = Array.from(doc.querySelectorAll('[data-doc-ticket], [data-lumzel-ticket]'));
    for (const item of remaining) {
      for (const attrName of ['data-doc-blocked-by', 'data-lumzel-blocked-by']) {
        const raw = item.getAttribute(attrName);
        if (!raw) continue;
        const nextList = raw
          .split(',')
          .map(s => s.trim())
          .filter(id => id && id !== removedNodeId);
        if (nextList.length) item.setAttribute(attrName, nextList.join(','));
        else item.removeAttribute(attrName);
      }
    }
  }

  for (const node of Array.from(doc.querySelectorAll('[data-doc-links], [data-lumzel-links]'))) {
    for (const attrName of ['data-doc-links', 'data-lumzel-links']) {
      const raw = node.getAttribute(attrName);
      if (!raw) continue;
      const nextLinks = raw
        .split(/\s+/)
        .map(s => s.trim())
        .filter(link => link && link !== ticketPath && !link.startsWith(`${ticketPath}#`));
      if (nextLinks.length) node.setAttribute(attrName, nextLinks.join(' '));
      else node.removeAttribute(attrName);
    }
  }

  return serializeDoc(doc);
}

/**
 * Derive a concise preliminary feature title from a free-form requirement brief.
 */
export function deriveFeatureTitle(brief, maxLen = 30) {
  const firstLine = String(brief || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*•]+|\d+[.)、])\s*/, '').replace(/\s+/g, ' ').trim())
    .find(Boolean);
  if (!firstLine) return '';
  if (firstLine.length <= maxLen) return firstLine;
  return `${firstLine.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

/**
 * Generate a safe unique kebab-case Feature id from a free-form requirement brief.
 */
export function generateFeatureId(brief, existingIds = [], now = new Date()) {
  const existing = new Set(existingIds);
  const firstLine = String(brief || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*•]+|\d+[.)、])\s*/, '').trim())
    .find(Boolean) || '';
  const sample = firstLine.slice(0, 80);
  const nonWs = sample.replace(/\s+/g, '');
  const asciiCount = (nonWs.match(/[A-Za-z0-9\-_./]/g) || []).length;
  const mostlyAscii = nonWs.length > 0 && asciiCount / nonWs.length >= 0.5;

  let base = '';
  if (mostlyAscii) {
    const ascii = sample
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (ascii.length >= 3 && /^[a-z]/.test(ascii)) {
      if (ascii.length <= 32) {
        base = ascii;
      } else {
        const cut = ascii.slice(0, 32);
        const lastDash = cut.lastIndexOf('-');
        base = (lastDash >= 12 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, '');
      }
    }
  }

  if (!base) {
    const pad = n => String(n).padStart(2, '0');
    base = `feat-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  if (!existing.has(base)) return base;
  let seq = 2;
  while (existing.has(`${base}-${seq}`)) seq += 1;
  return `${base}-${seq}`;
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

export function extractDocCreatedAttr(html) {
  if (!html) return '';
  const rootMatch = String(html).match(/<html\b[^>]*>/i);
  if (!rootMatch) return '';
  const attrMatch = rootMatch[0].match(/\bdata-(?:doc|lumzel)-created\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return String(attrMatch?.[1] ?? attrMatch?.[2] ?? '').trim();
}

export function parseDocTimestamp(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { ms: 0, hasTime: false };
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = Date.parse(`${trimmed}T00:00:00`);
    return Number.isFinite(parsed) ? { ms: parsed, hasTime: false } : { ms: 0, hasTime: false };
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? { ms: parsed, hasTime: true } : { ms: 0, hasTime: false };
  }
  return { ms: 0, hasTime: false };
}

function isTrustedCreatedMeta(meta, docCreatedInfo, docDateInfo) {
  const createdMs = Number(meta?.createdAt) || 0;
  if (createdMs <= 0) return false;
  if (meta && ('pending' in meta || Boolean(meta.brief) || meta.createdSource === 'ui')) {
    return true;
  }
  const refMs = docCreatedInfo.ms || docDateInfo.ms;
  if (refMs > 0 && createdMs > refMs + 86400000) {
    return false;
  }
  return true;
}

export function featureCreatedInfo(feature, meta = null, docCreated = '') {
  const docCreatedValue = docCreated || meta?.docCreated || feature?.created || '';
  const docCreatedInfo = parseDocTimestamp(docCreatedValue);
  const docDateInfo = parseDocTimestamp(feature?.updated);
  const createdMs = Number(meta?.createdAt) || 0;
  const trustedMeta = isTrustedCreatedMeta(meta, docCreatedInfo, docDateInfo);

  if (docCreatedInfo.ms > 0) {
    if (docCreatedInfo.hasTime) {
      return { ms: docCreatedInfo.ms, hasTime: true };
    }
    if (
      trustedMeta &&
      createdMs >= docCreatedInfo.ms - 86400000 &&
      createdMs < docCreatedInfo.ms + 86400000
    ) {
      return { ms: createdMs, hasTime: true };
    }
    return docCreatedInfo;
  }

  if (trustedMeta) {
    if (docDateInfo.ms > 0) {
      const createdInUi = Boolean(meta && ('pending' in meta || meta.brief || meta.createdSource === 'ui'));
      if (createdInUi || createdMs >= docDateInfo.ms) {
        return { ms: createdMs, hasTime: true };
      }
      return docDateInfo;
    }
    return { ms: createdMs, hasTime: true };
  }

  if (docDateInfo.ms > 0) return docDateInfo;
  return { ms: 0, hasTime: false };
}

export function featureUpdatedInfo(feature, meta = null, fileMtimeMs = 0) {
  const updatedMs = Number(meta?.updatedAt) || 0;
  const createdMs = Number(meta?.createdAt) || 0;
  const mtime = Number(fileMtimeMs) || 0;
  const docDateInfo = parseDocTimestamp(feature?.updated);
  const bestExact = Math.max(mtime, updatedMs, createdMs);
  if (docDateInfo.ms > bestExact) {
    return docDateInfo;
  }
  if (bestExact > 0) {
    return { ms: bestExact, hasTime: true };
  }
  return { ms: 0, hasTime: false };
}

export function featureTimeInfo(feature, meta = null, fileMtimeMs = 0, options = {}) {
  const sortBy = options?.sortBy === 'updated' ? 'updated' : 'created';
  if (sortBy === 'updated') {
    return featureUpdatedInfo(feature, meta, fileMtimeMs);
  }
  return featureCreatedInfo(feature, meta, options?.docCreated || '');
}

/**
 * Compute best millisecond timestamp for a feature according to `sortBy` ('created' | 'updated').
 */
export function featureSortTimestamp(feature, meta = null, fileMtimeMs = 0, options = {}) {
  return featureTimeInfo(feature, meta, fileMtimeMs, options).ms;
}

/**
 * Sort features (including pending features) in reverse chronological order (newest first).
 */
export function sortFeaturesDesc(features, metaMap = {}, fileMtimeMap = {}, options = {}) {
  const sortBy = options?.sortBy === 'updated' ? 'updated' : 'created';
  const docCreatedMap = options?.docCreatedMap || {};
  return [...(features || [])].sort((a, b) => {
    const ma = metaMap[a.id] || null;
    const mb = metaMap[b.id] || null;
    const ta = featureSortTimestamp(a, ma, fileMtimeMap[a.id] || 0, {
      sortBy,
      docCreated: docCreatedMap[a.id] || '',
    });
    const tb = featureSortTimestamp(b, mb, fileMtimeMap[b.id] || 0, {
      sortBy,
      docCreated: docCreatedMap[b.id] || '',
    });
    if (tb !== ta) return tb - ta;
    const ca = Number(ma?.createdAt) || 0;
    const cb = Number(mb?.createdAt) || 0;
    if (cb !== ca) return cb - ca;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

export function formatShortTime(tsMs, fallbackDate = '', options = {}) {
  const ts = Number(tsMs);
  const hasTime = options?.hasTime !== false;
  if (Number.isFinite(ts) && ts > 0) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return hasTime ? `${datePart} ${pad(d.getHours())}:${pad(d.getMinutes())}` : datePart;
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
  locale = 'en',
}) {
  const isZh = String(locale || 'en').toLowerCase().startsWith('zh');
  const lines = [];
  if (isZh) {
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
  } else {
    if (isNewSession) {
      lines.push(
        `Continue designing Feature ${feature.id} "${feature.title || feature.id}" (new session with full context).`,
        `Design doc path: ${feature.design}`,
        feature.summary ? `Summary: ${feature.summary}` : '',
        feature.status ? `Current design status: ${feature.status}` : '',
      );
      if (settled.length) {
        lines.push('', 'Previously settled decisions:');
        for (const s of settled) {
          lines.push(`- ${s.id} (${s.question}): ${s.answer}`);
        }
      }
    } else {
      lines.push(`The user submitted answers/notes in Spec Workbench for Feature ${feature.id} "${feature.title || feature.id}" (${feature.design}):`);
    }

    if (answers.length) {
      lines.push('', 'Answers to open questions:');
      for (const a of answers) {
        lines.push(`- [${a.id}] ${a.question} => ${a.value}`);
      }
    }
    if (note && note.trim()) {
      lines.push('', `Additional notes: ${note.trim()}`);
    }

    lines.push(
      '',
      `Update ${feature.design} based on the answers and notes above:`,
      '1. For each answered `decisions` node, set `data-doc-answer` (remove `.open`, change the `.q` prefix to `✓`, add `.chosen` and remove `.rec` on the selected `.opts` item, and update `.a` to `→ <answer>`).',
      '2. Refine or adjust the affected design blocks accordingly; if follow-up questions arise, add them to `decisions` (with `data-doc-recommend`).',
      '3. If every `decisions` node now has `data-doc-answer` and the design is complete, set `<html data-doc-status>` and the hero status pill (`.pill.s-*`) to `confirmed`; run `pnpm lumzel check` if the project defines a `lumzel` script.',
      '4. Do not generate any `docs/results/` files; reply concisely with the updated nodes and recommended next step.',
    );
  }
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
  locale = 'en',
}) {
  const isZh = String(locale || 'en').toLowerCase().startsWith('zh');
  const lines = [];
  if (isZh) {
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
  } else {
    if (isNewSession) {
      lines.push(
        `Continue ticket slicing and decision updates for Feature ${feature.id} "${feature.title || feature.id}" (new session with full context).`,
        `Design doc path: ${feature.design}`,
        feature.prototype ? `Prototype path: ${feature.prototype}` : '',
        tickets.length ? 'Existing tickets:' : 'No tickets yet.',
        ...tickets.map(tk => `- ${tk.path} (${tk.title}) [${tk.status}]`),
      );
    } else {
      lines.push(`The user submitted ticket decisions/notes in Spec Workbench for Feature ${feature.id} "${feature.title || feature.id}":`);
    }

    if (answers.length) {
      lines.push('', 'Answers to ticket choices:');
      for (const a of answers) {
        lines.push(`- ${a.ticketPath} [${a.id}] ${a.question} => ${a.value}`);
      }
    }
    if (note && note.trim()) {
      lines.push('', `Additional instructions: ${note.trim()}`);
    }

    lines.push(
      '',
      'Update the corresponding ticket files based on the answers and notes above (set `data-doc-answer`, remove `.open`, update `.q` with `✓` / `.opts .chosen` / `.a`, adjust slices or acceptance criteria, keep `#delivers` `data-doc-links="<designPath>#<nodeId>"` and `design.html` `#tickets` list in sync when adding/removing tickets), and run `pnpm lumzel check` if the project defines a `lumzel` script.',
      'Do not generate any `docs/results/` files; reply concisely summarizing the changes.',
    );
  }
  return lines.filter(Boolean).join('\n');
}
