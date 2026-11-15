let measureCtx = null;
const truncCache = new Map();
const MAX_CACHE = 400;

function getCtx() {
  if (!measureCtx && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    measureCtx = c.getContext('2d');
  }
  return measureCtx;
}

export function truncatePx(text, maxPx, font) {
  const str = String(text || '');
  if (!str) return '';
  const key = `${font}|${maxPx}|${str}`;
  const hit = truncCache.get(key);
  if (hit !== undefined) return hit;

  const ctx = getCtx();
  if (!ctx) {
    const est = Math.max(4, Math.floor(maxPx / 7));
    const res = str.length > est ? str.slice(0, est - 1) + '…' : str;
    return res;
  }
  ctx.font = font;
  if (ctx.measureText(str).width <= maxPx) {
    if (truncCache.size >= MAX_CACHE) truncCache.clear();
    truncCache.set(key, str);
    return str;
  }
  let lo = 0;
  let hi = str.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(str.slice(0, mid) + '…').width <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  const out = lo <= 0 ? '…' : str.slice(0, lo) + '…';
  if (truncCache.size >= MAX_CACHE) truncCache.clear();
  truncCache.set(key, out);
  return out;
}

export function fmtDuration(sec) {
  if (sec === null || sec === undefined || Number.isNaN(sec) || sec < 0) return '—';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

export function fmtRelative(epochSec, locale = 'zh-CN', nowSec = Math.floor(Date.now() / 1000)) {
  if (!epochSec) return '—';
  const sec = epochSec > 1e12 ? Math.floor(epochSec / 1000) : epochSec;
  const diff = Math.max(0, nowSec - sec);
  const zh = String(locale).startsWith('zh');
  if (diff < 10) return zh ? '刚刚' : 'just now';
  if (diff < 60) return zh ? `${diff}秒前` : `${diff}s ago`;
  const min = Math.floor(diff / 60);
  if (min < 60) return zh ? `${min}分钟前` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return zh ? `${hr}小时前` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return zh ? `${day}天前` : `${day}d ago`;
}

export function shortId(id, len = 4) {
  const s = String(id || '');
  return s ? s.slice(0, len) : '—';
}

export function parseJsonSafe(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
