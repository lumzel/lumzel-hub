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
  labelW: 200,
  chipW: 92,
  chipH: 20,
  chipGap: 24,
  chipX0: 216,
  meterX: 692,
};

export const PHASES = ['CHECK', 'RED', 'IMPL', 'GREEN'];

export const META = {
  preflight: { role: 'code', kind: 'CODE', shape: 'main', max: 1 },
  preflight_gate: { role: 'gate', kind: 'GATE', shape: 'gate', max: 1 },
  split: { role: 'split', kind: 'AGENT', shape: 'main', max: 1 },
  plan: { role: 'code', kind: 'CODE', shape: 'pill', max: 1 },
  units: { role: 'worker', kind: 'MAP', shape: 'map', max: 1 },
  integrate: { role: 'code', kind: 'CODE', shape: 'main', max: 1 },
  integrate_gate: { role: 'gate', kind: 'GATE', shape: 'gate', max: 1 },
  human_gate: { role: 'human', kind: 'GATE', shape: 'human', max: 1 },
  ship: { role: 'shell', kind: 'SHELL', shape: 'main', max: 1 },
  rework: { role: 'worker', kind: 'AGENT', shape: 'pill', max: 3 },
  reverify: { role: 'code', kind: 'CODE', shape: 'pill', max: 3 },
  retro: { role: 'code', kind: 'CODE', shape: 'pill', max: 1 },
  distill: { role: 'learn', kind: 'AGENT', shape: 'main', max: 1 },
  record: { role: 'code', kind: 'CODE', shape: 'pill', max: 1 },
  finish: { role: 'gate', kind: 'GATE', shape: 'gate', max: 1 },
};

// Child node ids nested under map 'units' in feature-ship/workflow.yaml
export const CHILD_NODE_IDS = [
  'lane_start',
  'setup',
  'write_check',
  'verify_red',
  'red_gate',
  'impl',
  'verify_green',
  'green_gate',
  'unit_report',
];

export const ALL_YAML_KNOWN_IDS = [...Object.keys(META), ...CHILD_NODE_IDS];

export const ADJACENT = {
  preflight: { r: 'preflight_gate', d: 'units' },
  preflight_gate: { l: 'preflight', r: 'split', d: 'units' },
  split: { l: 'preflight_gate', r: 'plan', d: 'units' },
  plan: { l: 'split', d: 'units' },
  units: { u: 'plan', d: 'integrate' },
  integrate: { u: 'units', r: 'integrate_gate', d: 'rework' },
  integrate_gate: { u: 'units', l: 'integrate', r: 'human_gate', d: 'retro' },
  human_gate: { u: 'units', l: 'integrate_gate', r: 'ship', d: 'rework' },
  ship: { u: 'units', l: 'human_gate', d: 'retro' },
  rework: { u: 'human_gate', r: 'reverify' },
  reverify: { u: 'human_gate', l: 'rework', r: 'retro' },
  retro: { u: 'ship', l: 'reverify', r: 'distill' },
  distill: { u: 'ship', l: 'retro', r: 'record' },
  record: { l: 'distill', d: 'finish' },
  finish: { u: 'record', l: 'distill' },
};

export function layout(N = 3) {
  const count = Math.max(1, Math.min(6, Number(N) || 3));
  const mapY = 128;
  const mapH = LANE.head + count * LANE.h + LANE.pad;
  const mapBottom = mapY + mapH;
  const T3 = mapBottom + 68;
  const T4 = T3 + 104;
  const LY = T4 + 86;

  return {
    width: 960,
    height: LY + 28,
    mapY,
    mapH,
    mapBottom,
    T3,
    T4,
    LY,
    nodes: {
      preflight: { shape: 'main', x: 72, y: 32 },
      preflight_gate: { shape: 'gate', cx: 256, cy: 60 },
      split: { shape: 'main', x: 296, y: 32 },
      plan: { shape: 'pill', x: 480, y: 45 },
      units: { shape: 'map', x: 72, y: mapY, w: 816, h: mapH },
      integrate: { shape: 'main', x: 72, y: T3 },
      integrate_gate: { shape: 'gate', cx: 256, cy: T3 + 28 },
      human_gate: { shape: 'human', x: 296, y: T3 - 8 },
      ship: { shape: 'main', x: 520, y: T3 },
      rework: { shape: 'pill', x: 296, y: T4 },
      reverify: { shape: 'pill', x: 424, y: T4 },
      retro: { shape: 'pill', x: 560, y: T4 },
      distill: { shape: 'main', x: 688, y: T4 - 13 },
      record: { shape: 'pill', x: 840, y: T4 },
      finish: { shape: 'gate', cx: 896, cy: T4 + 60 },
    },
    inlet: { x: 72, y: 60 },
    bands: [
      { y: 18, key: 'bandIntake' },
      { y: mapY - 14, key: 'bandWorkers' },
      { y: T3 - 14, key: 'bandMerge' },
      { y: T4 - 22, key: 'bandLearn' },
    ],
  };
}

export function buildEdges(L, view) {
  const b = id => box(L.nodes[id]);
  const unitCount = (view && view.lanes && view.lanes.length) || 3;
  const passedCount = (view && view.summary && view.summary.passed) || 0;

  return [
    {
      id: 'e1',
      from: 'preflight',
      to: 'preflight_gate',
      kind: 'flow',
      pts: ortho(anchor(b('preflight'), 'r'), anchor(b('preflight_gate'), 'l'), 'hvh'),
      label: null,
    },
    {
      id: 'e2',
      from: 'preflight_gate',
      to: 'split',
      kind: 'flow',
      pts: ortho(anchor(b('preflight_gate'), 'r'), anchor(b('split'), 'l'), 'hvh'),
      label: null,
    },
    {
      id: 'e2b',
      from: 'preflight_gate',
      to: 'plan',
      kind: 'flow',
      routeBranch: true,
      pts: [
        anchor(b('preflight_gate'), 't'),
        { x: 256, y: 20 },
        { x: 536, y: 20 },
        anchor(b('plan'), 't'),
      ],
      label: { text: t('presetUnitsEdge'), x: 396, y: 15, align: 'middle' },
    },
    {
      id: 'e3',
      from: 'split',
      to: 'plan',
      kind: 'flow',
      pts: ortho(anchor(b('split'), 'r'), anchor(b('plan'), 'l'), 'hvh'),
      label: null,
    },
    {
      id: 'e4',
      from: 'plan',
      to: 'units',
      kind: 'flow',
      pts: [anchor(b('plan'), 'b'), { x: 536, y: L.mapY }],
      label: { text: `units[] ×${unitCount}`, x: 544, y: (75 + L.mapY) / 2 + 3, align: 'start' },
    },
    {
      id: 'e5',
      from: 'units',
      to: 'integrate',
      kind: 'flow',
      pts: [
        { x: 480, y: L.mapBottom },
        { x: 480, y: L.mapBottom + 20 },
        { x: 146, y: L.mapBottom + 20 },
        anchor(b('integrate'), 't'),
      ],
      label: {
        text: passedCount > 0 ? `join · ${passedCount} passed` : 'join · results',
        x: 313,
        y: L.mapBottom + 14,
        align: 'middle',
      },
    },
    {
      id: 'e6',
      from: 'integrate',
      to: 'integrate_gate',
      kind: 'flow',
      pts: ortho(anchor(b('integrate'), 'r'), anchor(b('integrate_gate'), 'l'), 'hvh'),
      label: null,
    },
    {
      id: 'e7',
      from: 'integrate_gate',
      to: 'human_gate',
      kind: 'flow',
      pts: ortho(anchor(b('integrate_gate'), 'r'), anchor(b('human_gate'), 'l'), 'hvh'),
      label: null,
    },
    {
      id: 'e8',
      from: 'integrate_gate',
      to: 'retro',
      kind: 'fail',
      routeBranch: true,
      pts: [
        anchor(b('integrate_gate'), 'b'),
        { x: 256, y: L.T4 + 46 },
        { x: 616, y: L.T4 + 46 },
        anchor(b('retro'), 'b'),
      ],
      label: { text: 'not shippable', x: 436, y: L.T4 + 60, align: 'middle' },
    },
    {
      id: 'e9',
      from: 'human_gate',
      to: 'ship',
      kind: 'flow',
      pts: ortho(anchor(b('human_gate'), 'r'), anchor(b('ship'), 'l'), 'hvh'),
      label: { text: t('approveAction'), x: 500, y: L.T3 + 21, align: 'middle' },
    },
    {
      id: 'e10',
      from: 'human_gate',
      to: 'rework',
      kind: 'correct',
      pts: ortho(anchor(b('human_gate'), 'b', 0.3), anchor(b('rework'), 't'), 'v'),
      label: { text: t('rejectNoteEdge'), x: 344, y: (L.T3 + 64 + L.T4) / 2 + 3, align: 'end' },
    },
    {
      id: 'e11',
      from: 'rework',
      to: 'reverify',
      kind: 'correct',
      pts: ortho(anchor(b('rework'), 'r'), anchor(b('reverify'), 'l'), 'hvh'),
      label: null,
    },
    {
      id: 'e12',
      from: 'reverify',
      to: 'human_gate',
      kind: 'correct',
      pts: [
        anchor(b('reverify'), 't'),
        { x: 480, y: L.T3 + 80 },
        { x: 434, y: L.T3 + 80 },
        anchor(b('human_gate'), 'b', 0.75),
      ],
      label: { text: '≤2', x: 457, y: L.T3 + 74, align: 'middle' },
    },
    {
      id: 'e13',
      from: 'ship',
      to: 'retro',
      kind: 'flow',
      pts: [
        anchor(b('ship'), 'b'),
        { x: 594, y: L.T3 + 80 },
        { x: 616, y: L.T3 + 80 },
        anchor(b('retro'), 't'),
      ],
      label: null,
    },
    {
      id: 'e14',
      from: 'retro',
      to: 'distill',
      kind: 'flow',
      pts: ortho(anchor(b('retro'), 'r'), anchor(b('distill'), 'l'), 'hvh'),
      label: null,
    },
    {
      id: 'e15',
      from: 'distill',
      to: 'record',
      kind: 'flow',
      pts: ortho(anchor(b('distill'), 'r'), anchor(b('record'), 'l'), 'hvh'),
      label: null,
    },
    {
      id: 'e16',
      from: 'record',
      to: 'finish',
      kind: 'flow',
      pts: ortho(anchor(b('record'), 'b'), anchor(b('finish'), 't'), 'v'),
      label: null,
    },
    {
      id: 'L',
      from: 'record',
      to: 'preflight',
      kind: 'learn',
      pts: [
        anchor(b('record'), 'b', 0.3),
        { x: 874, y: L.LY },
        { x: 24, y: L.LY },
        { x: 24, y: 60 },
        { x: 64, y: 60 },
      ],
      label: { text: t('learningEdgeLbl'), x: 448, y: L.LY - 7, align: 'middle' },
    },
  ];
}
