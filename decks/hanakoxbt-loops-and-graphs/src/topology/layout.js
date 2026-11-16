import { t } from '../i18n.js';

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function box(n) {
  if (!n) return { x: 0, y: 0, w: 0, h: 0 };
  if (n.shape === 'gate') return { x: n.cx - 14, y: n.cy - 14, w: 28, h: 28 };
  const s = {
    main: [148, 56],
    pill: [112, 30],
    human: [184, 72],
    map: [816, 200],
  }[n.shape] || [148, 56];
  return { x: n.x, y: n.y, w: n.w ?? s[0], h: n.h ?? s[1] };
}

export function anchor(b, side, tRatio = 0.5) {
  switch (side) {
    case 'l':
      return { x: b.x, y: b.y + b.h * tRatio };
    case 'r':
      return { x: b.x + b.w, y: b.y + b.h * tRatio };
    case 't':
      return { x: b.x + b.w * tRatio, y: b.y };
    case 'b':
      return { x: b.x + b.w * tRatio, y: b.y + b.h };
    default:
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
}

function towards(from, to, dist) {
  const L = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return {
    x: from.x + ((to.x - from.x) / L) * dist,
    y: from.y + ((to.y - from.y) / L) * dist,
  };
}

export function roundedPath(pts, r = 8) {
  if (!pts || pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const n = pts[i + 1];
    const d1 = Math.hypot(c.x - p.x, c.y - p.y);
    const d2 = Math.hypot(n.x - c.x, n.y - c.y);
    if (d1 < 0.5 || d2 < 0.5) {
      d += ` L${c.x},${c.y}`;
      continue;
    }
    const r1 = Math.min(r, d1 / 2, d2 / 2);
    const a = towards(c, p, r1);
    const b = towards(c, n, r1);
    d += ` L${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last.x},${last.y}`;
}

export function ortho(a, b, mode = 'hvh') {
  if (mode === 'hvh') {
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  if (mode === 'vhv') {
    const my = (a.y + b.y) / 2;
    return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
  }
  return mode === 'h' ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b];
}

export const WIDE_BREAKPOINT = 1200;

export function isWideViewport(width = typeof window !== 'undefined' ? window.innerWidth : WIDE_BREAKPOINT) {
  return width >= WIDE_BREAKPOINT;
}

export function fit(viewW, viewH, world, insetRight = 0) {
  const padX = 28;
  const padTop = 44;
  const padBot = 24;
  const W = Math.max(240, viewW - insetRight);
  const H = Math.max(200, viewH);
  const k = clamp(
    Math.min((W - 2 * padX) / world.width, (H - padTop - padBot) / world.height),
    0.4,
    1.45,
  );
  return {
    k,
    tx: (W - world.width * k) / 2,
    ty: Math.max(padTop, padTop + (H - padTop - padBot - world.height * k) / 2),
  };
}

// Fallback column layout for any YAML nodes not present in the curated topology table (§10.5)
export function layered(unknownIds, baseLayout) {
  const ids = (unknownIds || []).filter(Boolean);
  if (!ids.length) return { nodes: {}, width: baseLayout.width, height: baseLayout.height };
  const x = baseLayout.width + 40;
  const nodes = {};
  ids.forEach((id, idx) => {
    nodes[id] = { shape: 'main', x, y: 32 + idx * 80 };
  });
  const extraH = 32 + ids.length * 80 + 24;
  return {
    nodes,
    width: x + 148 + 40,
    height: Math.max(baseLayout.height, extraH),
  };
}

export function extractYamlNodeIds(yamlText) {
  const ids = new Set();
  const re = /^\s*-\s+id:\s*([^\s#]+)/gm;
  let m;
  while ((m = re.exec(String(yamlText || ''))) !== null) {
    ids.add(m[1].replace(/['"]/g, ''));
  }
  return Array.from(ids);
}

export function checkTopologyDrift(yamlText, knownIds) {
  const yamlIds = extractYamlNodeIds(yamlText);
  const known = new Set(knownIds);
  const unknown = yamlIds.filter(id => !known.has(id));
  if (unknown.length > 0 && typeof console !== 'undefined' && console.warn) {
    console.warn(`[hanakoxbt-loops-and-graphs] YAML contains unmapped node id(s): ${unknown.join(', ')}`);
  }
  return unknown;
}

export function bandTitle(key) {
  return t(key);
}
