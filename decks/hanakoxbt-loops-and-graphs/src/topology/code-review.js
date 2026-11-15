import { box, anchor, ortho } from './layout.js';
import { t } from '../i18n.js';

export const NODE = {
  main: { w: 148, h: 56 },
  pill: { w: 112, h: 30 },
  gate: { s: 28 },
  human: { w: 184, h: 72 },
};

export const LANE = {
  h: 44,
  head: 36,
  pad: 8,
  labelW: 156,
  chipW: 72,
  chipH: 20,
  chipGap: 18,
  chipX0: 168,
  meterX: 436,
};

export const PHASES = ['REVIEW', 'EVIDENCE', 'GATE'];

export const META = {
  scope: { role: 'code', kind: 'CODE', shape: 'main', max: 1 },
  scope_gate: { role: 'gate', kind: 'GATE', shape: 'gate', max: 1 },
  lenses: { role: 'worker', kind: 'MAP', shape: 'map', max: 1 },
  checks: { role: 'shell', kind: 'SHELL', shape: 'main', max: 1 },
  merge: { role: 'code', kind: 'CODE', shape: 'main', max: 1 },
  learn: { role: 'learn', kind: 'CODE', shape: 'pill', max: 1 },
};

export const CHILD_NODE_IDS = ['review', 'evidence', 'evidence_gate'];
export const ALL_YAML_KNOWN_IDS = [...Object.keys(META), ...CHILD_NODE_IDS];

export const ADJACENT = {
  scope: { r: 'scope_gate', d: 'lenses' },
  scope_gate: { l: 'scope', r: 'checks', d: 'lenses' },
  lenses: { u: 'scope_gate', r: 'checks', d: 'merge' },
  checks: { u: 'scope_gate', l: 'lenses', d: 'merge' },
  merge: { u: 'lenses', r: 'learn' },
  learn: { u: 'checks', l: 'merge' },
};

export function layout(N = 4) {
  const count = Math.max(1, Math.min(6, Number(N) || 4));
  const mapY = 128;
  const mapH = LANE.head + count * LANE.h + LANE.pad;
  const mapBottom = mapY + mapH;
  const checksY = Math.round(mapY + mapH / 2 - 28);
  const T3 = mapBottom + 64;
  const LY = T3 + 82;

  return {
    width: 960,
    height: LY + 28,
    mapY,
    mapH,
    mapBottom,
    T3,
    LY,
    nodes: {
      scope: { shape: 'main', x: 72, y: 32 },
      scope_gate: { shape: 'gate', cx: 256, cy: 60, lbl: { x: 16, y: 20, align: 'start' } },
      lenses: { shape: 'map', x: 72, y: mapY, w: 560, h: mapH },
      checks: { shape: 'main', x: 712, y: checksY },
      merge: { shape: 'main', x: 296, y: T3 },
      learn: { shape: 'pill', x: 480, y: T3 + 13 },
    },
    verdict: { x: 656, y: T3 - 16, w: 232 },
    inlet: { x: 72, y: 60 },
    bands: [
      { y: 18, key: 'bandIntake' },
      { y: mapY - 14, key: 'bandWorkers' },
      { y: T3 - 22, key: 'bandReviewMerge' },
    ],
  };
}

export function buildEdges(L, view) {
  const b = id => box(L.nodes[id]);
  const lensCount = (view && view.lanes && view.lanes.length) || 4;
  const scopeFiles = (view && view.summary && view.summary.files) || 0;

  return [
    {
      id: 'cr1',
      from: 'scope',
      to: 'scope_gate',
      kind: 'flow',
      pts: ortho(anchor(b('scope'), 'r'), anchor(b('scope_gate'), 'l'), 'hvh'),
      label: null,
    },
    {
      id: 'cr_done',
      from: 'scope_gate',
      to: null,
      kind: 'fail',
      pts: [
        anchor(b('scope_gate'), 't'),
        { x: 256, y: 22 },
        { x: 376, y: 22 },
      ],
      label: { text: '0 files · $done', x: 384, y: 25, align: 'start' },
    },
    {
      id: 'cr2',
      from: 'scope_gate',
      to: 'lenses',
      kind: 'flow',
      pts: [anchor(b('scope_gate'), 'b'), { x: 256, y: L.mapY }],
      label: {
        text: scopeFiles > 0 ? `${scopeFiles} files · ×${lensCount}` : `lenses ×${lensCount}`,
        x: 264,
        y: (74 + L.mapY) / 2 + 3,
        align: 'start',
      },
    },
    {
      id: 'cr3',
      from: 'scope_gate',
      to: 'checks',
      kind: 'flow',
      pts: [
        anchor(b('scope_gate'), 'r'),
        { x: 786, y: 60 },
        anchor(b('checks'), 't'),
      ],
      label: { text: 'parallel check', x: 528, y: 54, align: 'middle' },
    },
    {
      id: 'cr4',
      from: 'lenses',
      to: 'merge',
      kind: 'flow',
      pts: [{ x: 350, y: L.mapBottom }, anchor(b('merge'), 't', 0.36)],
      label: { text: 'join: all', x: 358, y: L.mapBottom + 20, align: 'start' },
    },
    {
      id: 'cr5',
      from: 'checks',
      to: 'merge',
      kind: 'flow',
      pts: [
        anchor(b('checks'), 'b'),
        { x: 786, y: L.mapBottom + 28 },
        { x: 414, y: L.mapBottom + 28 },
        anchor(b('merge'), 't', 0.8),
      ],
      label: null,
    },
    {
      id: 'cr6',
      from: 'merge',
      to: 'learn',
      kind: 'flow',
      pts: ortho(anchor(b('merge'), 'r'), anchor(b('learn'), 'l'), 'hvh'),
      label: null,
    },
    {
      id: 'cr7',
      from: 'learn',
      to: 'merge',
      kind: 'flow',
      pts: [anchor(b('learn'), 'r'), { x: L.verdict.x, y: L.T3 + 28 }],
      label: null,
    },
    {
      id: 'L_cr',
      from: 'learn',
      to: 'scope',
      kind: 'learn',
      pts: [
        anchor(b('learn'), 'b'),
        { x: 536, y: L.LY },
        { x: 24, y: L.LY },
        { x: 24, y: 60 },
        { x: 64, y: 60 },
      ],
      label: { text: t('learningEdgeLbl'), x: 280, y: L.LY - 7, align: 'middle' },
    },
  ];
}
