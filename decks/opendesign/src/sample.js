// Rich sample data for Market Preview (ctx.preview === true) and quick-starter templates.
// All sample HTML documents use pure CSS interactions (no inline <script>) so srcdoc renders
// cleanly with zero CSP console errors under WebKit MARKET_PREVIEW_CSP.

const MERIDIAN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meridian Cloud — Usage & Plan Console</title>
<style id="od-tokens">
:root {
  --od-bg: #fbfbfb;
  --od-surface: #ffffff;
  --od-surface-2: #f4f4f5;
  --od-fg: #09090b;
  --od-muted: #64636e;
  --od-accent: #0070e3;
  --od-accent-fg: #ffffff;
  --od-border: #e4e4e7;
  --od-radius: 8px;
  --od-space: 16px;
  --od-font-scale: 1;
  --od-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  --od-font-mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}
</style>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--od-bg);
    color: var(--od-fg);
    font-family: var(--od-font-sans);
    font-size: calc(13px * var(--od-font-scale, 1));
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .shell {
    display: grid;
    grid-template-columns: 164px minmax(0, 1fr);
    min-height: 100vh;
  }
  .nav {
    border-right: 1px solid var(--od-border);
    background: var(--od-surface-2);
    padding: 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .org {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px 12px;
    font-weight: 600;
    font-size: 12.5px;
  }
  .dot {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--od-accent);
    color: var(--od-accent-fg);
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
  }
  .nav-item {
    padding: 6px 8px;
    border-radius: calc(var(--od-radius) - 2px);
    color: var(--od-muted);
    font-size: 12px;
    text-decoration: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .nav-item.active {
    background: var(--od-surface);
    color: var(--od-fg);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
  .content {
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 920px;
  }
  .topbar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
  .topbar h1 {
    margin: 0;
    font-size: 20px;
    letter-spacing: -0.02em;
  }
  .topbar p {
    margin: 3px 0 0;
    color: var(--od-muted);
    font-size: 12.5px;
  }
  .btn {
    padding: 7px 13px;
    border-radius: calc(var(--od-radius) - 2px);
    font-size: 12.5px;
    font-weight: 600;
    border: 1px solid var(--od-border);
    background: var(--od-surface);
    color: var(--od-fg);
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn.primary {
    background: var(--od-accent);
    border-color: var(--od-accent);
    color: var(--od-accent-fg);
  }
  .card {
    background: var(--od-surface);
    border: 1px solid var(--od-border);
    border-radius: var(--od-radius);
    padding: var(--od-space);
  }
  .quota-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 10px;
  }
  .mono {
    font-family: var(--od-font-mono);
    font-variant-numeric: tabular-nums;
  }
  .meter {
    height: 8px;
    border-radius: 999px;
    background: var(--od-surface-2);
    overflow: hidden;
  }
  .meter-fill {
    height: 100%;
    width: 68%;
    background: var(--od-accent);
    border-radius: 999px;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 14px;
  }
  .kpi {
    padding: 10px 12px;
    border-radius: calc(var(--od-radius) - 2px);
    background: var(--od-surface-2);
  }
  .kpi small {
    display: block;
    color: var(--od-muted);
    font-size: 11px;
  }
  .kpi strong {
    display: block;
    margin-top: 2px;
    font-size: 16px;
    font-family: var(--od-font-mono);
    font-variant-numeric: tabular-nums;
  }
  .plans {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .plan {
    background: var(--od-surface);
    border: 1px solid var(--od-border);
    border-radius: var(--od-radius);
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .plan.highlight {
    border-color: var(--od-accent);
  }
  .plan h3 {
    margin: 0;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .pill {
    font-size: 10.5px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--od-surface-2);
    color: var(--od-muted);
    font-weight: 600;
  }
  .pill.accent {
    background: color-mix(in srgb, var(--od-accent) 14%, transparent);
    color: var(--od-accent);
  }
  .price {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-family: var(--od-font-mono);
  }
  .price span {
    font-size: 12px;
    font-weight: 400;
    color: var(--od-muted);
  }
  .plan ul {
    margin: 0;
    padding: 0 0 0 16px;
    color: var(--od-muted);
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  th, td {
    text-align: left;
    padding: 9px 8px;
    border-bottom: 1px solid var(--od-border);
  }
  th {
    color: var(--od-muted);
    font-weight: 500;
    font-size: 11.5px;
  }
  tr:last-child td { border-bottom: 0; }
  @media (max-width: 540px) {
    .shell { grid-template-columns: 1fr; }
    .nav { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--od-border); }
    .kpis, .plans { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <div class="shell">
    <aside class="nav" data-od-id="billing-sidebar">
      <div class="org" data-od-id="workspace-switcher"><span class="dot">M</span> Meridian Cloud</div>
      <a class="nav-item" href="#overview" data-od-id="nav-overview">Overview</a>
      <a class="nav-item active" href="#usage" data-od-id="nav-billing">Usage &amp; Billing <span class="pill accent">Pro</span></a>
      <a class="nav-item" href="#keys" data-od-id="nav-keys">API Keys</a>
      <a class="nav-item" href="#audit" data-od-id="nav-audit">Audit Ledger</a>
      <a class="nav-item" href="#members" data-od-id="nav-members">Members (14)</a>
    </aside>

    <main class="content">
      <header class="topbar" data-od-id="billing-header">
        <div>
          <h1>Usage &amp; Plan Allocation</h1>
          <p>Billing cycle Nov 1 – Nov 30 · Auto-scaling budget cap enabled at $600/mo</p>
        </div>
        <button class="btn primary" type="button" data-od-id="budget-cap-cta">Adjust Spend Cap</button>
      </header>

      <section class="card" data-od-id="quota-meter-card">
        <div class="quota-head">
          <div>
            <strong>Monthly Compute Quota</strong>
            <div style="color:var(--od-muted);font-size:12px;">6.84M / 10.0M worker seconds consumed</div>
          </div>
          <span class="mono" style="font-weight:600;">$318.40 accrued</span>
        </div>
        <div class="meter"><div class="meter-fill"></div></div>
        <div class="kpis">
          <div class="kpi" data-od-id="kpi-inference">
            <small>Edge Inference Calls</small>
            <strong>1,428,910</strong>
          </div>
          <div class="kpi" data-od-id="kpi-egress">
            <small>Regional Egress</small>
            <strong>412.6 GB</strong>
          </div>
          <div class="kpi" data-od-id="kpi-projected">
            <small>Cycle Forecast</small>
            <strong>$446.00</strong>
          </div>
        </div>
      </section>

      <section class="plans" data-od-id="plan-comparison-grid">
        <article class="plan" data-od-id="plan-starter">
          <h3>Starter <span class="pill">Team</span></h3>
          <div class="price">$49 <span>/ mo</span></div>
          <ul>
            <li>2M worker seconds</li>
            <li>3 production regions</li>
            <li>7-day trace retention</li>
          </ul>
          <button class="btn" type="button">Compare</button>
        </article>
        <article class="plan highlight" data-od-id="plan-pro">
          <h3>Growth Pro <span class="pill accent">Current</span></h3>
          <div class="price">$249 <span>/ mo</span></div>
          <ul>
            <li>10M worker seconds</li>
            <li>12 global PoPs + failover</li>
            <li>30-day audit &amp; trace export</li>
          </ul>
          <button class="btn" type="button">Manage Seats</button>
        </article>
        <article class="plan" data-od-id="plan-scale">
          <h3>Enterprise Scale <span class="pill">SLA</span></h3>
          <div class="price">$890 <span>/ mo</span></div>
          <ul>
            <li>50M dedicated worker seconds</li>
            <li>SOC2 + SAML SSO + private VPC</li>
            <li>Dedicated Solutions Architect</li>
          </ul>
          <button class="btn primary" type="button" data-od-id="plan-scale-cta">Request Scale Upgrade</button>
        </article>
      </section>

      <section class="card" data-od-id="invoice-table">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong>Recent Invoices</strong>
          <span style="color:var(--od-muted);font-size:12px;">PDF &amp; CSV ledger</span>
        </div>
        <table>
          <thead>
            <tr><th>Invoice</th><th>Period</th><th>Usage</th><th>Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td class="mono">INV-2026-10</td><td>Oct 1 – Oct 31</td><td class="mono">8.92M sec</td><td class="mono">$392.10</td><td><span class="pill">Paid</span></td></tr>
            <tr><td class="mono">INV-2026-09</td><td>Sep 1 – Sep 30</td><td class="mono">7.41M sec</td><td class="mono">$334.50</td><td><span class="pill">Paid</span></td></tr>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</body>
</html>`;

const TELEMETRY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kestrel Edge — Latency & Throughput Telemetry</title>
<style id="od-tokens">
:root {
  --od-bg: #fbfbfb;
  --od-surface: #ffffff;
  --od-surface-2: #f4f4f5;
  --od-fg: #09090b;
  --od-muted: #64636e;
  --od-accent: #0070e3;
  --od-accent-fg: #ffffff;
  --od-border: #e4e4e7;
  --od-radius: 8px;
  --od-space: 16px;
  --od-font-scale: 1;
  --od-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --od-font-mono: 'Geist Mono', ui-monospace, Menlo, monospace;
}
</style>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--od-bg); color: var(--od-fg); font-family: var(--od-font-sans); font-size: calc(13px * var(--od-font-scale, 1)); }
  .wrap { max-width: 1020px; margin: 0 auto; padding: 22px; display: flex; flex-direction: column; gap: 16px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .head h1 { margin: 0; font-size: 18px; letter-spacing: -0.02em; }
  .badge { font-family: var(--od-font-mono); font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--od-border); background: var(--od-surface); }
  .grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .card { background: var(--od-surface); border: 1px solid var(--od-border); border-radius: var(--od-radius); padding: 14px; }
  .kpi-title { color: var(--od-muted); font-size: 11.5px; }
  .kpi-num { font: 700 22px/1.2 var(--od-font-mono); margin-top: 6px; font-variant-numeric: tabular-nums; }
  .kpi-delta { font: 500 11px var(--od-font-mono); color: var(--od-accent); margin-top: 4px; }
  .split { display: grid; grid-template-columns: 1.5fr 1fr; gap: 12px; }
  .bar-row { display: grid; grid-template-columns: 96px 1fr 56px; align-items: center; gap: 10px; margin-top: 10px; font-size: 12px; }
  .track { height: 7px; border-radius: 999px; background: var(--od-surface-2); overflow: hidden; }
  .fill { height: 100%; background: var(--od-accent); border-radius: 999px; }
  @media (max-width: 540px) { .grid4, .split { grid-template-columns: 1fr; } }
</style>
</head>
<body>
  <div class="wrap">
    <header class="head" data-od-id="telemetry-header">
      <div>
        <h1>Kestrel Edge Cluster Telemetry</h1>
        <div style="color:var(--od-muted);font-size:12px;">Global routing plane · 12 active edge regions · Last 24h window</div>
      </div>
      <span class="badge" data-od-id="cluster-health-badge">● 99.98% Healthy</span>
    </header>

    <section class="grid4" data-od-id="telemetry-kpi-strip">
      <div class="card" data-od-id="kpi-p95"><div class="kpi-title">Global P95 Latency</div><div class="kpi-num">38.4 ms</div><div class="kpi-delta">-4.2 ms vs 7d</div></div>
      <div class="card" data-od-id="kpi-rps"><div class="kpi-title">Peak Throughput</div><div class="kpi-num">48.2k/s</div><div class="kpi-delta">+11.4% MoM</div></div>
      <div class="card" data-od-id="kpi-err"><div class="kpi-title">5xx Error Ratio</div><div class="kpi-num">0.014%</div><div class="kpi-delta">Within SLO</div></div>
      <div class="card" data-od-id="kpi-cache"><div class="kpi-title">KV Cache Hit Rate</div><div class="kpi-num">94.6%</div><div class="kpi-delta">+1.8% warm</div></div>
    </section>

    <section class="split">
      <div class="card" data-od-id="latency-sparkline-card">
        <strong style="font-size:13px;">P95 Response Curve (UTC 00:00 – 24:00)</strong>
        <svg viewBox="0 0 520 150" style="width:100%;height:160px;margin-top:10px;display:block;">
          <polyline fill="none" stroke="var(--od-border)" stroke-width="1" points="0,120 520,120"/>
          <polyline fill="none" stroke="var(--od-border)" stroke-width="1" stroke-dasharray="3 3" points="0,70 520,70"/>
          <polyline fill="none" stroke="var(--od-accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
            points="10,96 55,90 100,82 145,88 190,64 235,58 280,74 325,52 370,48 415,61 460,44 505,40"/>
        </svg>
      </div>
      <div class="card" data-od-id="region-latency-card">
        <strong style="font-size:13px;">Regional P95 Breakdown</strong>
        <div class="bar-row"><span>us-west-2</span><div class="track"><div class="fill" style="width:42%"></div></div><span style="font-family:var(--od-font-mono);text-align:right;">24 ms</span></div>
        <div class="bar-row"><span>eu-central-1</span><div class="track"><div class="fill" style="width:56%"></div></div><span style="font-family:var(--od-font-mono);text-align:right;">34 ms</span></div>
        <div class="bar-row"><span>ap-northeast</span><div class="track"><div class="fill" style="width:68%"></div></div><span style="font-family:var(--od-font-mono);text-align:right;">41 ms</span></div>
        <div class="bar-row"><span>sa-east-1</span><div class="track"><div class="fill" style="width:84%"></div></div><span style="font-family:var(--od-font-mono);text-align:right;">62 ms</span></div>
      </div>
    </section>
  </div>
</body>
</html>`;

const SLIDES_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Northstar AI — Q3 Architecture & GTM Brief</title>
<style id="od-tokens">
:root {
  --od-bg: #fbfbfb;
  --od-surface: #ffffff;
  --od-surface-2: #f4f4f5;
  --od-fg: #09090b;
  --od-muted: #64636e;
  --od-accent: #0070e3;
  --od-accent-fg: #ffffff;
  --od-border: #e4e4e7;
  --od-radius: 8px;
  --od-space: 16px;
  --od-font-scale: 1;
  --od-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --od-font-mono: 'Geist Mono', ui-monospace, Menlo, monospace;
}
</style>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--od-bg); color: var(--od-fg); font-family: var(--od-font-sans); padding: 24px; }
  .deck-stage { width: 100%; max-width: 920px; aspect-ratio: 16 / 9; background: var(--od-surface); border: 1px solid var(--od-border); border-radius: var(--od-radius); padding: 38px 44px; display: flex; flex-direction: column; justify-content: space-between; }
  .eyebrow { font: 600 11px var(--od-font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--od-accent); }
  h1 { margin: 12px 0 10px; font-size: 36px; line-height: 1.12; letter-spacing: -0.03em; max-width: 680px; }
  p.lead { margin: 0; font-size: 15px; line-height: 1.55; color: var(--od-muted); max-width: 620px; }
  .pillars { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }
  .pillar { border: 1px solid var(--od-border); border-radius: var(--od-radius); padding: 14px; background: var(--od-surface-2); }
  .pillar b { display: block; font-size: 13px; margin-bottom: 4px; }
  .pillar span { font-size: 12px; color: var(--od-muted); }
  .foot { display: flex; justify-content: space-between; font: 500 11.5px var(--od-font-mono); color: var(--od-muted); border-top: 1px solid var(--od-border); padding-top: 12px; }
</style>
</head>
<body>
  <section class="deck-stage" data-od-id="slide-cover">
    <div data-od-id="slide-headline">
      <div class="eyebrow">Northstar AI · Q3 Architecture Brief</div>
      <h1>Local-first agent workflows with deterministic quality gates</h1>
      <p class="lead">Combining human visual direction picking, self-contained HTML artifact synthesis, and automated anti-slop scoring into one zero-dependency workspace.</p>
    </div>
    <div class="pillars" data-od-id="slide-pillars">
      <div class="pillar" data-od-id="pillar-contract"><b>01 · DESIGN.md Contract</b><span>Brand voice, color palette, typography, and explicit anti-patterns enforced on every generation.</span></div>
      <div class="pillar" data-od-id="pillar-canvas"><b>02 · Inspect &amp; Tweak</b><span>Click any element to pin revision comments or adjust CSS tokens live at 1280px, 820px, and 390px.</span></div>
      <div class="pillar" data-od-id="pillar-gate"><b>03 · 5-Axis Critique</b><span>Automated lint plus multi-axis scoring keeps every revision faithful before export.</span></div>
    </div>
    <footer class="foot" data-od-id="slide-footer">
      <span>CONFIDENTIAL · ARCHITECTURE REVIEW</span>
      <span>SLIDE 01 / 04</span>
    </footer>
  </section>
</body>
</html>`;

export const SAMPLE_ARTIFACTS = [
  {
    id: 'meridian-billing',
    title: 'Meridian Usage & Plan Console',
    surface: 'prototype',
    systemSlug: 'editorial-slate',
    path: 'docs/opendesign/meridian-billing.html',
    brief: 'SaaS workspace usage & billing console with compute quota meter, 3 plan tiers, spend cap CTA, and invoice ledger.',
    html: MERIDIAN_HTML,
    version: 2,
    critique: {
      score: 91,
      passed: true,
      summary: 'Strong Swiss typographic hierarchy, tabular numerals on billing figures, clean 3-tier comparison, and 11 tagged elements.',
      axes: { Philosophy: 92, Hierarchy: 93, Execution: 90, Specificity: 91, Restraint: 89 },
    },
    lint: { ok: true, score: 100, oidCount: 11, issues: [] },
    updatedAt: '2026-11-15T10:24:00Z',
  },
  {
    id: 'kestrel-telemetry',
    title: 'Kestrel Edge Telemetry',
    surface: 'dashboard',
    systemSlug: 'editorial-slate',
    path: 'docs/opendesign/kestrel-telemetry.html',
    brief: 'Global edge cluster observability dashboard showing P95 latency, throughput, cache hit ratio, and regional bars.',
    html: TELEMETRY_HTML,
    version: 1,
    critique: {
      score: 88,
      passed: true,
      summary: 'Dense, legible observability strip with crisp SVG response curve and restrained color signals.',
      axes: { Philosophy: 89, Hierarchy: 90, Execution: 88, Specificity: 87, Restraint: 86 },
    },
    lint: { ok: true, score: 100, oidCount: 8, issues: [] },
    updatedAt: '2026-11-15T09:10:00Z',
  },
  {
    id: 'northstar-brief',
    title: 'Northstar Q3 Architecture Deck',
    surface: 'slides',
    systemSlug: 'editorial-slate',
    path: 'docs/opendesign/northstar-brief.html',
    brief: '16:9 executive brief summarizing OpenDesign workflow architecture in 3 crisp pillars.',
    html: SLIDES_HTML,
    version: 1,
    critique: {
      score: 86,
      passed: true,
      summary: 'Clean 16:9 aspect framing with clear Swiss hierarchy and restrained footer rule.',
      axes: { Philosophy: 87, Hierarchy: 88, Execution: 85, Specificity: 84, Restraint: 86 },
    },
    lint: { ok: true, score: 100, oidCount: 6, issues: [] },
    updatedAt: '2026-11-15T08:40:00Z',
  },
];

export const SAMPLE_COMMENTS = {
  'meridian-billing': [
    {
      id: 'c-1',
      oid: 'quota-meter-card',
      tag: 'section',
      selector: '[data-od-id="quota-meter-card"]',
      note: 'Add projected overage date next to $446.00 forecast so finance owners see threshold risk early.',
      createdAt: '10:21',
    },
    {
      id: 'c-2',
      oid: 'plan-scale-cta',
      tag: 'button',
      selector: '[data-od-id="plan-scale-cta"]',
      note: 'Keep primary CTA wording concise: "Upgrade to Scale".',
      createdAt: '10:23',
    },
  ],
};

export const SAMPLE_VERSIONS = {
  'meridian-billing': [
    {
      version: 2,
      label: 'v2 · Comment revision',
      createdAt: '10:24',
      html: MERIDIAN_HTML,
    },
    {
      version: 1,
      label: 'v1 · Initial build',
      createdAt: '10:12',
      html: MERIDIAN_HTML.replace('$446.00', '$432.00'),
    },
  ],
};

export const SAMPLE_RUNS = [
  {
    runId: 'run-preview-01',
    workflowId: 'design-artifact',
    state: 'completed',
    createdAt: '2026-11-15T10:18:00Z',
    inputs: {
      artifactId: 'meridian-billing',
      title: 'Meridian Usage & Plan Console',
      surface: 'prototype',
      systemSlug: 'editorial-slate',
    },
    outputs: {
      propose_directions: {
        assumptions: [
          'Finance and engineering leads review usage mid-cycle before hitting budget caps.',
          'Plan tiers require side-by-side numeric comparison without promotional bloat.',
        ],
        directions: [
          {
            id: 'swiss-ledger',
            name: 'Swiss Quota Ledger',
            rationale: 'Hairline grid, prominent compute meter, and tabular invoice ledger.',
            palette: '#fbfbfb / #09090b / #0070e3',
            typography: 'Inter + Geist Mono tabular-nums',
            layoutIdea: 'Left workspace rail + vertical quota -> tier cards -> ledger flow',
          },
          {
            id: 'split-billing-cockpit',
            name: 'Split Billing Cockpit',
            rationale: 'Sticky right-hand cost simulator paired with breakdown rows.',
            palette: '#f4f4f5 / #ffffff / #0d9488',
            typography: 'Inter + tight uppercase section eyebrows',
            layoutIdea: '2-column 65/35 cockpit split',
          },
          {
            id: 'editorial-statement',
            name: 'Editorial Monthly Statement',
            rationale: 'Reads like an executive financial statement with generous margins.',
            palette: '#faf7f2 / #1c1917 / #c2410c',
            typography: 'Charter display + crisp sans tables',
            layoutIdea: 'Centered single-column statement layout',
          },
        ],
      },
      lint_artifact: { ok: true, score: 100, oidCount: 11, issues: [], summary: 'No lint issues' },
      critique_artifact: {
        score: 91,
        passed: true,
        summary: 'Strong Swiss typographic hierarchy, tabular numerals, and high interactive clarity.',
        axes: { Philosophy: 92, Hierarchy: 93, Execution: 90, Specificity: 91, Restraint: 89 },
        findings: [],
      },
    },
    nodes: [
      { nodeId: 'load_context', state: 'completed', startedAt: 1000, finishedAt: 1014 },
      { nodeId: 'propose_directions', state: 'completed', startedAt: 1015, finishedAt: 5215 },
      { nodeId: 'route_direction', state: 'completed', startedAt: 5216, finishedAt: 5218 },
      { nodeId: 'direction_gate', state: 'completed', startedAt: 5219, finishedAt: 13719 },
      { nodeId: 'build_artifact', state: 'completed', startedAt: 13720, finishedAt: 22820 },
      { nodeId: 'lint_artifact', state: 'completed', startedAt: 22821, finishedAt: 22830 },
      { nodeId: 'critique_artifact', state: 'completed', startedAt: 22831, finishedAt: 26431 },
      { nodeId: 'quality_gate', state: 'completed', startedAt: 26432, finishedAt: 26434 },
      { nodeId: 'finalize', state: 'completed', startedAt: 26435, finishedAt: 26440 },
    ],
  },
];

export function buildStarterHtml({ title, surface = 'prototype', brief = '', tokensCss = '' }) {
  const safeTitle = String(title || 'Untitled Design').replace(/[<>&]/g, '');
  const safeBrief = String(brief || 'Structured interactive OpenDesign starter canvas.').replace(/[<>&]/g, '');
  const tokensBlock = tokensCss?.trim()
    ? tokensCss.trim()
    : `:root { --od-bg:#fbfbfb; --od-surface:#ffffff; --od-surface-2:#f4f4f5; --od-fg:#09090b; --od-muted:#64636e; --od-accent:#0070e3; --od-accent-fg:#ffffff; --od-border:#e4e4e7; --od-radius:8px; --od-space:16px; --od-font-scale:1; --od-font-sans:Inter,-apple-system,sans-serif; --od-font-mono:ui-monospace,Menlo,monospace; }`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style id="od-tokens">
${tokensBlock}
</style>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--od-bg); color: var(--od-fg); font-family: var(--od-font-sans); font-size: calc(14px * var(--od-font-scale, 1)); line-height: 1.55; }
  .page { max-width: 940px; margin: 0 auto; padding: calc(var(--od-space, 16px) * 1.75); display: flex; flex-direction: column; gap: 18px; }
  .hero { background: var(--od-surface); border: 1px solid var(--od-border); border-radius: var(--od-radius); padding: 24px; }
  .tag { display: inline-block; font: 600 11px var(--od-font-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--od-accent); margin-bottom: 8px; }
  h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: -0.02em; }
  p { margin: 0; color: var(--od-muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .card { background: var(--od-surface); border: 1px solid var(--od-border); border-radius: var(--od-radius); padding: 16px; }
  .card b { display: block; margin-bottom: 4px; }
  .cta { margin-top: 14px; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: calc(var(--od-radius) - 2px); background: var(--od-accent); color: var(--od-accent-fg); border: 0; font-weight: 600; font-size: 13px; cursor: pointer; }
</style>
</head>
<body>
  <main class="page">
    <header class="hero" data-od-id="starter-hero">
      <span class="tag">${surface.toUpperCase()} · OPENDESIGN STARTER</span>
      <h1>${safeTitle}</h1>
      <p>${safeBrief}</p>
      <button class="cta" type="button" data-od-id="starter-primary-cta">Primary Action</button>
    </header>
    <section class="grid" data-od-id="starter-grid">
      <article class="card" data-od-id="starter-card-1"><b>01 · Brand Contract</b><p>Bound to active DESIGN.md and tokens.css variables.</p></article>
      <article class="card" data-od-id="starter-card-2"><b>02 · Element Pinning</b><p>Inspect and click any tagged element to queue revisions.</p></article>
      <article class="card" data-od-id="starter-card-3"><b>03 · Live Token Tweaks</b><p>Adjust palette, spacing, and radius without losing state.</p></article>
    </section>
  </main>
</body>
</html>`;
}
