// Safe HTML rendering helpers: Markdown, Unified Diff, CI checks, status badges, and relative time.
import { t } from './i18n.js';

export function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatRelTime(iso) {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return t('timeJustNow');
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return t('timeMinsAgo', { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('timeHoursAgo', { n: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t('timeDaysAgo', { n: days });
  return new Date(ts).toISOString().slice(0, 10);
}

export function initials(login) {
  const s = String(login || '?').replace(/^@/, '');
  return s.slice(0, 2).toUpperCase();
}

export function renderAvatar(login, avatarCache = null) {
  const clean = String(login || '').replace(/^@/, '').trim();
  const cached = clean && avatarCache ? avatarCache.get(clean) : null;
  if (cached && cached.startsWith('data:image/')) {
    return `<span class="avatar" data-avatar-login="${esc(clean)}"><img class="avatar-img" src="${cached}" alt="${esc(clean)}" /></span>`;
  }
  return `<span class="avatar" data-avatar-login="${esc(clean)}">${esc(initials(clean || '?'))}</span>`;
}

export function summarizeChecks(rollup) {
  const list = Array.isArray(rollup) ? rollup : [];
  let passed = 0;
  let failed = 0;
  let pending = 0;
  const failedNames = [];
  for (const item of list) {
    const bucket = String(item?.bucket || '').toLowerCase();
    const state = String(item?.state || item?.conclusion || item?.status || '').toUpperCase();
    if (
      bucket === 'pass' ||
      state === 'SUCCESS' ||
      state === 'SKIPPED' ||
      state === 'NEUTRAL'
    ) {
      passed++;
    } else if (
      bucket === 'fail' ||
      bucket === 'cancel' ||
      state === 'FAILURE' ||
      state === 'ERROR' ||
      state === 'TIMED_OUT' ||
      state === 'CANCELLED' ||
      state === 'ACTION_REQUIRED'
    ) {
      failed++;
      if (item?.name) failedNames.push(item.name);
    } else {
      pending++;
    }
  }
  const total = list.length;
  let tone = 'none';
  if (failed > 0) tone = 'fail';
  else if (pending > 0) tone = 'pending';
  else if (total > 0) tone = 'pass';
  return { total, passed, failed, pending, tone, failedNames };
}

export function prStatusInfo(pr) {
  const st = String(pr?.state || 'OPEN').toUpperCase();
  if (st === 'MERGED') return { cls: 'merged', label: t('statusMerged') };
  if (st === 'CLOSED') return { cls: 'closed', label: t('statusClosed') };
  if (pr?.isDraft) return { cls: 'draft', label: t('statusDraft') };
  return { cls: 'open', label: t('statusOpen') };
}

export function issueStatusInfo(issue) {
  const st = String(issue?.state || 'OPEN').toUpperCase();
  if (st === 'CLOSED') return { cls: 'closed', label: t('statusClosed') };
  return { cls: 'open', label: t('statusOpen') };
}

export function reviewDecisionInfo(decision) {
  const d = String(decision || '').toUpperCase();
  if (d === 'APPROVED') return { cls: 'done', label: t('reviewApproved') };
  if (d === 'CHANGES_REQUESTED') return { cls: 'drift', label: t('reviewChangesRequested') };
  if (d === 'REVIEW_REQUIRED') return { cls: 'gate', label: t('reviewRequired') };
  return null;
}

export function renderLabelChip(label) {
  const name = typeof label === 'string' ? label : label?.name || '';
  if (!name) return '';
  const hex = typeof label === 'object' && /^[0-9a-fA-F]{6}$/.test(label?.color || '') ? `#${label.color}` : '';
  const dotStyle = hex ? ` style="background:${hex}"` : '';
  return `<span class="label-chip"><span class="label-dot"${dotStyle}></span>${esc(name)}</span>`;
}

function renderImageBlock(url, alt = 'Image', imageCache = null) {
  const cleanUrl = String(url || '').replaceAll('&amp;', '&').trim();
  if (!cleanUrl.startsWith('https://')) return '';
  const cached = imageCache ? imageCache.get(cleanUrl) : null;
  if (cached && cached.startsWith('data:image/')) {
    return `<figure class="md-img-wrap"><img class="md-img" src="${cached}" alt="${esc(alt)}" data-open-url="${esc(cleanUrl)}" /></figure>`;
  }
  if (cached === 'TOO_LARGE' || cached === 'ERROR') {
    return `<div class="md-img-fallback"><button type="button" class="md-link" data-open-url="${esc(cleanUrl)}">🖼 ${esc(alt || 'Image')} ↗</button></div>`;
  }
  return `<div class="md-img-placeholder" data-gh-img="${esc(cleanUrl)}" data-gh-alt="${esc(alt)}"><span>🖼 ${esc(alt || 'Image')}…</span><button type="button" class="link-btn" data-open-url="${esc(cleanUrl)}">↗</button></div>`;
}

const SAFE_HTML_TAGS = new Set([
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'del',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'details',
  'summary',
  'a',
  'img',
  'div',
  'span',
  'sub',
  'sup',
  'input',
]);

// Sanitize GitHub's server-rendered body_html using browser DOMParser with a strict allowlist.
export function sanitizeGitHubHtml(html, imageCache = null) {
  const raw = String(html || '').trim();
  if (!raw) return `<p class="md-empty">${esc(t('noDescription'))}</p>`;
  if (typeof DOMParser === 'undefined') return renderMarkdown(raw, imageCache);

  const doc = new DOMParser().parseFromString(raw, 'text/html');

  const serializeNode = node => {
    if (node.nodeType === 3) return esc(node.nodeValue || '');
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();

    if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'svg') {
      return '';
    }
    if (tag === 'relative-time' || tag === 'time') {
      const dt = node.getAttribute('datetime') || node.textContent || '';
      const label = formatRelTime(dt) || dt.trim();
      return `<span class="md-reltime mono" title="${esc(dt)}">${esc(label)}</span>`;
    }
    if (tag === 'img') {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || 'Image';
      return renderImageBlock(src, alt, imageCache);
    }
    if (tag === 'input') {
      if ((node.getAttribute('type') || '').toLowerCase() !== 'checkbox') return '';
      const checked = node.hasAttribute('checked');
      return `<span class="md-check ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</span>`;
    }
    if (tag === 'a') {
      const href = node.getAttribute('href') || '';
      const inner = [...node.childNodes].map(serializeNode).join('');
      if (href.startsWith('https://') || href.startsWith('http://')) {
        return `<a class="md-link" href="#" data-open-url="${esc(href)}">${inner}</a>`;
      }
      return inner;
    }

    const inner = [...node.childNodes].map(serializeNode).join('');
    if (!SAFE_HTML_TAGS.has(tag)) return inner;
    if (tag === 'br' || tag === 'hr') return `<${tag} />`;
    if (tag === 'details') {
      return `<details class="md-details"${node.hasAttribute('open') ? ' open' : ''}>${inner}</details>`;
    }
    if (tag === 'summary') return `<summary class="md-summary">${inner}</summary>`;
    if (tag === 'table') return `<div class="md-table-wrap"><table class="md-table">${inner}</table></div>`;
    if (tag === 'pre') return `<pre class="md-pre">${inner}</pre>`;
    if (tag === 'blockquote') return `<blockquote class="md-quote">${inner}</blockquote>`;
    return `<${tag}>${inner}</${tag}>`;
  };

  const out = [...doc.body.childNodes].map(serializeNode).join('').trim();
  return `<div class="md-body">${out || `<p class="md-empty">${esc(t('noDescription'))}</p>`}</div>`;
}

export function renderRichBody(markdown, bodyHtml = '', imageCache = null) {
  if (bodyHtml && String(bodyHtml).trim()) {
    return sanitizeGitHubHtml(bodyHtml, imageCache);
  }
  return renderMarkdown(markdown, imageCache);
}

// Lightweight, XSS-safe offline Markdown renderer (headings, tables, details, code blocks, images, lists, tasks, quotes, inline code/bold/links).
export function renderMarkdown(src, imageCache = null) {
  let raw = String(src || '').replace(/\r\n/g, '\n');
  // Strip HTML comments (e.g. bot metadata like <!-- codex-review-state:v1 ... -->)
  raw = raw.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!raw) return `<p class="md-empty">${esc(t('noDescription'))}</p>`;

  // Normalize multi-line GitHub HTML <img ... /> tags into single lines.
  raw = raw.replace(/<img\b[^>]*>/gi, tag => tag.replace(/\s*\n\s*/g, ' '));

  const lines = raw.split('\n');
  const out = [];
  let inCode = false;
  let codeLines = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  const inline = text => {
    const tokens = [];
    const put = html => {
      const id = `@@TOK_${tokens.length}@@`;
      tokens.push(html);
      return id;
    };

    let work = String(text || '')
      .replace(/<img\b([^>]*)>/gi, (_, attrs) => {
        const srcM = attrs.match(/\bsrc\s*=\s*["'](https:\/\/[^"']+)["']/i);
        if (!srcM) return '';
        const altM = attrs.match(/\balt\s*=\s*["']([^"']*)["']/i);
        return put(renderImageBlock(srcM[1], altM ? altM[1] : 'Image', imageCache));
      })
      .replace(/!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g, (_, alt, url) =>
        put(renderImageBlock(url, alt || 'Image', imageCache)),
      )
      .replace(/<relative-time\b[^>]*datetime=["']([^"']+)["'][^>]*>[\s\S]*?<\/relative-time>/gi, (_, dt) =>
        put(`<span class="md-reltime mono" title="${esc(dt)}">${esc(formatRelTime(dt) || dt)}</span>`),
      )
      .replace(/<br\s*\/?>/gi, () => put('<br />'))
      .replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, label) =>
        put(`<a class="md-link" href="#" data-open-url="${esc(url)}">${esc(label.replace(/<[^>]+>/g, ''))}</a>`),
      )
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_, _t, inner) => put(`<strong>${esc(inner)}</strong>`))
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (_, _t, inner) => put(`<em>${esc(inner)}</em>`))
      .replace(/<(del|s)>([\s\S]*?)<\/\1>/gi, (_, _t, inner) => put(`<del>${esc(inner)}</del>`))
      .replace(/<code>([\s\S]*?)<\/code>/gi, (_, inner) => put(`<code>${esc(inner)}</code>`));

    let s = esc(work);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      return `<a class="md-link" href="#" data-open-url="${esc(url)}">${label}</a>`;
    });
    for (let i = 0; i < tokens.length; i++) {
      s = s.replace(`@@TOK_${i}@@`, tokens[i]);
    }
    return s;
  };

  const splitTableRow = line =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim());

  const isTableSep = line => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      flushList();
      if (inCode) {
        out.push(`<pre class="md-pre"><code>${esc(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    // Handle <details> and <summary> tags cleanly
    if (/^<details\b[^>]*>$/i.test(trimmed)) {
      flushList();
      out.push('<details class="md-details">');
      continue;
    }
    if (/^<\/details>$/i.test(trimmed)) {
      flushList();
      out.push('</details>');
      continue;
    }
    const detailsInline = trimmed.match(/^<details\b[^>]*>\s*<summary>([\s\S]*?)<\/summary>$/i);
    if (detailsInline) {
      flushList();
      out.push(`<details class="md-details"><summary class="md-summary">${inline(detailsInline[1])}</summary>`);
      continue;
    }
    const summaryMatch = trimmed.match(/^<summary>([\s\S]*?)<\/summary>$/i);
    if (summaryMatch) {
      flushList();
      out.push(`<summary class="md-summary">${inline(summaryMatch[1])}</summary>`);
      continue;
    }

    // GFM Table
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushList();
      const headers = splitTableRow(trimmed);
      i++; // skip separator
      const rows = [];
      while (i + 1 < lines.length && lines[i + 1].trim().includes('|') && lines[i + 1].trim() !== '') {
        i++;
        rows.push(splitTableRow(lines[i]));
      }
      const thead = `<thead><tr>${headers.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      out.push(`<div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div>`);
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      flushList();
      const lvl = Math.min(4, hMatch[1].length + 1);
      out.push(`<h${lvl} class="md-h">${inline(hMatch[2])}</h${lvl}>`);
      continue;
    }
    if (/^([-*_]){3,}$/.test(trimmed) || /^<hr\s*\/?>$/i.test(trimmed)) {
      flushList();
      out.push('<hr class="md-hr" />');
      continue;
    }
    if (trimmed.startsWith('> ')) {
      flushList();
      out.push(`<blockquote class="md-quote">${inline(trimmed.slice(2))}</blockquote>`);
      continue;
    }
    const taskMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      if (!inList) {
        out.push('<ul class="md-list">');
        inList = true;
      }
      const checked = taskMatch[1].toLowerCase() === 'x';
      out.push(
        `<li class="md-task"><span class="md-check ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</span><span>${inline(taskMatch[2])}</span></li>`,
      );
      continue;
    }
    const liMatch = trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
    if (liMatch) {
      if (!inList) {
        out.push('<ul class="md-list">');
        inList = true;
      }
      out.push(`<li>${inline(liMatch[1])}</li>`);
      continue;
    }
    flushList();
    out.push(`<p class="md-p">${inline(trimmed)}</p>`);
  }
  if (inCode) {
    out.push(`<pre class="md-pre"><code>${esc(codeLines.join('\n'))}</code></pre>`);
  }
  flushList();
  return `<div class="md-body">${out.join('')}</div>`;
}

// Parse unified diff text into per-file sections.
export function parseUnifiedDiff(diffText) {
  const text = String(diffText || '');
  if (!text.trim()) return [];
  const files = [];
  let current = null;
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of text.split('\n')) {
    if (rawLine.startsWith('diff --git ')) {
      const m = rawLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
      current = {
        path: m ? m[2] : rawLine.slice(11),
        additions: 0,
        deletions: 0,
        lines: [],
      };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (
      rawLine.startsWith('index ') ||
      rawLine.startsWith('--- ') ||
      rawLine.startsWith('+++ ') ||
      rawLine.startsWith('new file mode') ||
      rawLine.startsWith('deleted file mode')
    ) {
      continue;
    }
    if (rawLine.startsWith('@@')) {
      const m = rawLine.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLine = m ? Number(m[1]) : 0;
      newLine = m ? Number(m[2]) : 0;
      current.lines.push({ kind: 'hunk', text: rawLine, oldNum: '', newNum: '' });
      continue;
    }
    if (rawLine.startsWith('+')) {
      current.additions++;
      current.lines.push({ kind: 'add', text: rawLine.slice(1), oldNum: '', newNum: newLine++ });
    } else if (rawLine.startsWith('-')) {
      current.deletions++;
      current.lines.push({ kind: 'del', text: rawLine.slice(1), oldNum: oldLine++, newNum: '' });
    } else if (rawLine.startsWith(' ')) {
      current.lines.push({ kind: 'ctx', text: rawLine.slice(1), oldNum: oldLine++, newNum: newLine++ });
    }
  }
  return files;
}

export const DIFF_LARGE_FILE_LINES = 150;
export const DIFF_INITIAL_LINES = 120;
export const DIFF_MORE_LINES = 300;

export function renderDiffLinesSlice(lines, start = 0, count = lines.length) {
  return lines
    .slice(start, start + count)
    .map(ln => {
      if (ln.kind === 'hunk') {
        return `<div class="dl hunk"><span class="ln"></span><span class="ln"></span><span class="lc mono">${esc(ln.text)}</span></div>`;
      }
      const sig = ln.kind === 'add' ? '+' : ln.kind === 'del' ? '-' : ' ';
      return `<div class="dl ${ln.kind}"><span class="ln mono">${ln.oldNum}</span><span class="ln mono">${ln.newNum}</span><span class="lc mono">${sig}${esc(ln.text)}</span></div>`;
    })
    .join('');
}

export function renderDiffFileCard(file, fileIndex) {
  const totalLines = file.lines.length;
  const isLarge = totalLines > DIFF_LARGE_FILE_LINES;
  const initialCount = isLarge ? DIFF_INITIAL_LINES : totalLines;
  const remaining = Math.max(0, totalLines - initialCount);
  const lineRows = renderDiffLinesSlice(file.lines, 0, initialCount);
  const moreBtn =
    remaining > 0
      ? `<div class="diff-more-wrap"><button type="button" class="btn sm" data-diff-more="${fileIndex}" data-diff-offset="${initialCount}">${esc(
          t('loadMoreLines', { n: remaining }),
        )}</button></div>`
      : '';

  return `
    <details class="diff-card"${isLarge ? '' : ' open'} data-diff-file="${fileIndex}">
      <summary class="diff-card-head">
        <span class="mono diff-path">${esc(file.path)}</span>
        <span class="diff-head-right">
          ${isLarge ? `<span class="diff-lines-badge mono">${esc(t('largeFileLines', { n: totalLines }))}</span>` : ''}
          <span class="mono diff-stat"><span class="add">+${file.additions}</span> <span class="del">-${file.deletions}</span></span>
        </span>
      </summary>
      <div class="diff-body">${lineRows || `<p class="empty-inline">${esc(t('diffBinary'))}</p>`}${moreBtn}</div>
    </details>
  `;
}

export function renderDiffFiles(diffFiles, fallbackFiles = [], truncated = false, { limit = 12 } = {}) {
  const parts = [];
  if (truncated) {
    parts.push(`<div class="inote warn" role="status">${esc(t('diffTruncated'))}</div>`);
  }
  if (diffFiles.length === 0 && fallbackFiles.length === 0) {
    parts.push(`<p class="empty-inline">${esc(t('filesEmpty'))}</p>`);
    return parts.join('');
  }
  if (diffFiles.length === 0) {
    parts.push('<div class="file-list-only">');
    for (const f of fallbackFiles) {
      parts.push(
        `<div class="file-stat-row"><span class="mono file-stat-path">${esc(f.path)}</span><span class="mono diff-stat"><span class="add">+${f.additions ?? 0}</span> <span class="del">-${f.deletions ?? 0}</span></span></div>`,
      );
    }
    parts.push('</div>');
    return parts.join('');
  }

  const initialFiles = diffFiles.slice(0, limit);
  parts.push('<div id="diff-files-list">');
  for (let i = 0; i < initialFiles.length; i++) {
    parts.push(renderDiffFileCard(initialFiles[i], i));
  }
  parts.push('</div>');
  if (diffFiles.length > initialFiles.length) {
    parts.push(`<div class="lazy-sentinel" id="diff-sentinel">${esc(t('loadingMore'))}</div>`);
  }
  return parts.join('');
}

export function renderChecksList(checks) {
  const list = Array.isArray(checks) ? checks : [];
  if (list.length === 0) {
    return `<p class="empty-inline">${esc(t('checksEmpty'))}</p>`;
  }
  return `<div class="checks-list">${list
    .map(c => {
      const sum = summarizeChecks([c]);
      const dotCls = sum.tone === 'pass' ? 'done' : sum.tone === 'fail' ? 'drift' : 'gate';
      const stateText = c.state || c.conclusion || c.bucket || '';
      const linkBtn = c.link
        ? `<button type="button" class="link-btn" data-open-url="${esc(c.link)}">↗</button>`
        : '';
      return `
        <div class="check-row">
          <span class="sdot ${dotCls}"></span>
          <div class="check-main">
            <span class="check-name">${esc(c.name || 'check')}</span>
            ${c.workflow ? `<span class="check-wf mono">${esc(c.workflow)}</span>` : ''}
          </div>
          <span class="check-state mono ${dotCls}">${esc(stateText)}</span>
          ${linkBtn}
        </div>
      `;
    })
    .join('')}</div>`;
}
