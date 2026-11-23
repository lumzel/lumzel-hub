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

// Lightweight, XSS-safe offline Markdown renderer (headings, code blocks, lists, tasks, quotes, inline code/bold/links).
export function renderMarkdown(src) {
  const raw = String(src || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return `<p class="md-empty">${esc(t('noDescription'))}</p>`;

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
    let s = esc(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      return `<a class="md-link" href="#" data-open-url="${esc(url)}">${label}</a>`;
    });
    return s;
  };

  for (const line of lines) {
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
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      flushList();
      const lvl = Math.min(4, hMatch[1].length + 1);
      out.push(`<h${lvl} class="md-h">${inline(hMatch[2])}</h${lvl}>`);
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

export function renderDiffFiles(diffFiles, fallbackFiles = [], truncated = false) {
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

  for (const file of diffFiles) {
    const lineRows = file.lines
      .slice(0, 400)
      .map(ln => {
        if (ln.kind === 'hunk') {
          return `<div class="dl hunk"><span class="ln"></span><span class="ln"></span><span class="lc mono">${esc(ln.text)}</span></div>`;
        }
        const sig = ln.kind === 'add' ? '+' : ln.kind === 'del' ? '-' : ' ';
        return `<div class="dl ${ln.kind}"><span class="ln mono">${ln.oldNum}</span><span class="ln mono">${ln.newNum}</span><span class="lc mono">${sig}${esc(ln.text)}</span></div>`;
      })
      .join('');
    parts.push(`
      <details class="diff-card" open>
        <summary class="diff-card-head">
          <span class="mono diff-path">${esc(file.path)}</span>
          <span class="mono diff-stat"><span class="add">+${file.additions}</span> <span class="del">-${file.deletions}</span></span>
        </summary>
        <div class="diff-body">${lineRows || `<p class="empty-inline">${esc(t('diffBinary'))}</p>`}</div>
      </details>
    `);
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
