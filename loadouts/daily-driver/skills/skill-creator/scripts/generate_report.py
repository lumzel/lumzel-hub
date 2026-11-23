#!/usr/bin/env python3
"""Generate an HTML report from run_loop.py output.

Takes the JSON output from run_loop.py and generates a visual HTML report
showing each description attempt with pass/fail metrics for each test case.
Distinguishes between train and test queries and adapts live to Lumzel themes.
"""

import argparse
import html
import json
import sys
from pathlib import Path


def _aggregate_runs(results: list[dict]) -> tuple[int, int]:
    correct = 0
    total = 0
    for r in results:
        runs = r.get("runs", 0)
        triggers = r.get("triggers", 0)
        total += runs
        if r.get("should_trigger", True):
            correct += triggers
        else:
            correct += runs - triggers
    return correct, total


def _score_class(correct: int, total: int) -> str:
    if total > 0:
        ratio = correct / total
        if ratio >= 0.8:
            return "score-good"
        if ratio >= 0.5:
            return "score-ok"
    return "score-bad"


def generate_html(data: dict, auto_refresh: bool = False, skill_name: str = "") -> str:
    """Generate a Lumzel-styled HTML report from loop output data."""
    history = data.get("history", [])
    title_prefix = html.escape(skill_name + " — ") if skill_name else ""
    skill_badge = f'<span class="skill-pill">{html.escape(skill_name)}</span>' if skill_name else ""

    # Collect unique train and test queries with expected polarity
    train_queries: list[dict] = []
    test_queries: list[dict] = []
    if history:
        for r in history[0].get("train_results", history[0].get("results", [])):
            train_queries.append({"query": r["query"], "should_trigger": r.get("should_trigger", True)})
        if history[0].get("test_results"):
            for r in history[0].get("test_results", []):
                test_queries.append({"query": r["query"], "should_trigger": r.get("should_trigger", True)})

    # Determine best iteration accurately (prefer explicit counts, else aggregate runs)
    best_iter = None
    if history:
        def _iter_rank(h: dict) -> tuple[float, float]:
            tr_c, tr_t = _aggregate_runs(h.get("train_results", h.get("results", [])))
            te_c, te_t = _aggregate_runs(h.get("test_results", []))
            tr_rate = (h["train_passed"] / h["train_total"]) if h.get("train_total") else (tr_c / tr_t if tr_t else 0.0)
            te_rate = (h["test_passed"] / h["test_total"]) if h.get("test_total") else (te_c / te_t if te_t else 0.0)
            return (te_rate, tr_rate) if test_queries else (tr_rate, te_rate)

        best_iter = max(history, key=_iter_rank).get("iteration")

    refresh_tag = '    <meta http-equiv="refresh" content="5">\n' if auto_refresh else ""
    best_test_score = data.get("best_test_score")
    score_scope = "test" if best_test_score else "train"
    best_score_val = html.escape(str(data.get("best_score", "N/A")))
    iterations_val = html.escape(str(data.get("iterations_run", len(history))))
    train_size_val = html.escape(str(data.get("train_size", len(train_queries))))
    test_size_val = html.escape(str(data.get("test_size", len(test_queries))))
    orig_desc = html.escape(data.get("original_description", "N/A"))
    best_desc = html.escape(data.get("best_description", "N/A"))

    html_parts = [f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="lumzel-theme" content="auto">
{refresh_tag}    <title>{title_prefix}Skill Description Optimization</title>
    <style>
        :root {{
            color-scheme: light dark;
            --font-sans: "Inter", "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
            --font-mono: "Geist Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
            --shell: #f3f3f4;
            --canvas: #fbfbfb;
            --surface: #ffffff;
            --surface-hover: #f4f4f5;
            --border: #ececef;
            --border-strong: #e4e4e7;
            --fg: #09090b;
            --muted: #64636e;
            --faint: #81818b;
            --primary: #18181b;
            --primary-fg: #fafafa;
            --brand: #0070e3;
            --brand-soft: #eef5ff;
            --done: #1c882d;
            --gate: #d08700;
            --drift: #e7000b;
            --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.03);
        }}
        @media (prefers-color-scheme: dark) {{
            :root:not([data-theme="light"]) {{
                --shell: #0c0c0e;
                --canvas: #111114;
                --surface: #18181b;
                --surface-hover: #27272a;
                --border: rgba(255, 255, 255, 0.07);
                --border-strong: rgba(255, 255, 255, 0.12);
                --fg: #fafafa;
                --muted: #9f9fa9;
                --faint: #7f7f89;
                --primary: #e4e4e7;
                --primary-fg: #18181b;
                --brand: #4390ee;
                --brand-soft: rgba(67, 144, 238, 0.14);
                --done: #4ade80;
                --gate: #fbbf24;
                --drift: #f87171;
                --shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
            }}
        }}
        :root[data-theme="dark"] {{
            color-scheme: dark;
            --shell: #0c0c0e;
            --canvas: #111114;
            --surface: #18181b;
            --surface-hover: #27272a;
            --border: rgba(255, 255, 255, 0.07);
            --border-strong: rgba(255, 255, 255, 0.12);
            --fg: #fafafa;
            --muted: #9f9fa9;
            --faint: #7f7f89;
            --primary: #e4e4e7;
            --primary-fg: #18181b;
            --brand: #4390ee;
            --brand-soft: rgba(67, 144, 238, 0.14);
            --done: #4ade80;
            --gate: #fbbf24;
            --drift: #f87171;
            --shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        }}
        * {{ box-sizing: border-box; }}
        body {{
            margin: 0;
            background: var(--canvas);
            color: var(--fg);
            font: 13.5px/1.55 var(--font-sans);
            -webkit-font-smoothing: antialiased;
        }}
        main {{
            max-width: 1200px;
            margin: 0 auto;
            padding: 28px 24px 48px;
            display: grid;
            gap: 18px;
        }}
        header {{
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: flex-end;
            gap: 12px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border);
        }}
        .title-row {{
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
        }}
        h1 {{
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            letter-spacing: -0.025em;
            line-height: 1.3;
        }}
        .skill-pill {{
            font: 500 11.5px/1 var(--font-mono);
            color: var(--muted);
            background: var(--surface);
            border: 1px solid var(--border-strong);
            border-radius: 999px;
            padding: 4px 10px;
        }}
        .subtitle {{
            margin: 5px 0 0;
            font-size: 13px;
            color: var(--muted);
        }}
        .kpi-grid {{
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
        }}
        @media (max-width: 720px) {{
            .kpi-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
        }}
        .kpi {{
            background: var(--surface);
            border: 1px solid var(--border-strong);
            border-radius: 10px;
            box-shadow: var(--shadow);
            padding: 12px 14px;
            display: grid;
            gap: 4px;
        }}
        .kpi-label {{
            font: 500 11px/1.2 var(--font-mono);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--faint);
        }}
        .kpi-value {{
            display: flex;
            align-items: baseline;
            gap: 8px;
            font: 600 20px/1.2 var(--font-mono);
            color: var(--fg);
        }}
        .kpi-value--good {{ color: var(--done); }}
        .kpi-tag {{
            font: 500 11px/1 var(--font-sans);
            color: var(--muted);
            background: var(--surface-hover);
            border: 1px solid var(--border);
            border-radius: 999px;
            padding: 3px 7px;
        }}
        .desc-grid {{
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
        }}
        @media (max-width: 760px) {{
            .desc-grid {{ grid-template-columns: 1fr; }}
        }}
        .desc-card {{
            background: var(--surface);
            border: 1px solid var(--border-strong);
            border-radius: 10px;
            box-shadow: var(--shadow);
            padding: 14px 16px;
            display: grid;
            gap: 6px;
            align-content: start;
        }}
        .desc-card--best {{
            border-color: color-mix(in srgb, var(--done) 30%, var(--border-strong));
            background: color-mix(in srgb, var(--done) 5%, var(--surface));
        }}
        .desc-kicker {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font: 600 11.5px/1 var(--font-sans);
            color: var(--muted);
        }}
        .desc-card--best .desc-kicker {{ color: var(--fg); }}
        .desc-text {{
            margin: 0;
            font-size: 13px;
            line-height: 1.6;
            color: var(--muted);
        }}
        .desc-card--best .desc-text {{ color: var(--fg); }}
        .dot {{
            width: 7px;
            height: 7px;
            border-radius: 999px;
            display: inline-block;
            flex: none;
        }}
        .dot--ok {{ background: var(--done); }}
        .dot--no {{ background: var(--drift); }}
        .dot--muted {{ background: var(--faint); }}
        .dot--brand {{ background: var(--brand); }}
        .table-card {{
            background: var(--surface);
            border: 1px solid var(--border-strong);
            border-radius: 10px;
            box-shadow: var(--shadow);
            overflow: hidden;
        }}
        .table-bar {{
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
        }}
        .table-title {{
            font-size: 13.5px;
            font-weight: 600;
            color: var(--fg);
        }}
        .legend {{
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 12px;
            font-size: 12px;
            color: var(--muted);
        }}
        .legend-item {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }}
        .split-pill {{
            display: inline-flex;
            align-items: center;
            font: 500 10.5px/1 var(--font-mono);
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid var(--border-strong);
            background: var(--canvas);
            color: var(--muted);
        }}
        .split-pill--test {{
            border-color: color-mix(in srgb, var(--brand) 35%, var(--border-strong));
            background: color-mix(in srgb, var(--brand) 10%, transparent);
            color: var(--brand);
        }}
        .table-wrap {{
            overflow-x: auto;
            width: 100%;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 12.5px;
        }}
        thead th {{
            padding: 10px 12px;
            text-align: left;
            vertical-align: top;
            font-weight: 500;
            color: var(--muted);
            background: var(--canvas);
            border-bottom: 1px solid var(--border-strong);
            white-space: nowrap;
        }}
        thead th.query-head {{
            min-width: 132px;
            white-space: normal;
        }}
        .qh-meta {{
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 5px;
        }}
        .qh-text {{
            font-size: 12px;
            font-weight: 500;
            line-height: 1.35;
            color: var(--fg);
        }}
        tbody td {{
            padding: 12px;
            vertical-align: middle;
            border-bottom: 1px solid var(--border);
        }}
        tbody tr:last-child td {{ border-bottom: 0; }}
        tbody tr:hover td {{ background: var(--surface-hover); }}
        tbody tr.best-row td {{
            background: color-mix(in srgb, var(--done) 6%, var(--surface));
        }}
        tbody tr.best-row:hover td {{
            background: color-mix(in srgb, var(--done) 10%, var(--surface));
        }}
        tbody tr.best-row td:first-child {{
            box-shadow: inset 2px 0 0 var(--done);
        }}
        .iter-cell {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font: 600 12px/1 var(--font-mono);
            color: var(--muted);
            white-space: nowrap;
        }}
        .best-tag {{
            font: 600 10px/1 var(--font-sans);
            color: var(--done);
            background: color-mix(in srgb, var(--done) 14%, transparent);
            border: 1px solid color-mix(in srgb, var(--done) 28%, transparent);
            border-radius: 999px;
            padding: 3px 6px;
        }}
        td.description {{
            min-width: 240px;
            max-width: 380px;
            font-size: 12.5px;
            line-height: 1.5;
            color: var(--fg);
        }}
        .score {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 42px;
            padding: 3px 8px;
            border-radius: 999px;
            font: 600 11.5px/1.2 var(--font-mono);
        }}
        .score-good {{
            background: color-mix(in srgb, var(--done) 14%, transparent);
            color: var(--done);
        }}
        .score-ok {{
            background: color-mix(in srgb, var(--gate) 16%, transparent);
            color: var(--gate);
        }}
        .score-bad {{
            background: color-mix(in srgb, var(--drift) 14%, transparent);
            color: var(--drift);
        }}
        td.result {{
            text-align: left;
            white-space: nowrap;
        }}
        .cell-pill {{
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 8px;
            border-radius: 6px;
            font: 500 11.5px/1.2 var(--font-mono);
            border: 1px solid transparent;
        }}
        .cell-pill--pass {{
            color: var(--done);
            background: color-mix(in srgb, var(--done) 10%, transparent);
            border-color: color-mix(in srgb, var(--done) 22%, transparent);
        }}
        .cell-pill--fail {{
            color: var(--drift);
            background: color-mix(in srgb, var(--drift) 10%, transparent);
            border-color: color-mix(in srgb, var(--drift) 24%, transparent);
        }}
    </style>
</head>
<body>
    <main>
        <header>
            <div>
                <div class="title-row">
                    <h1>Skill Description Optimization</h1>
                    {skill_badge}
                </div>
                <p class="subtitle">Trigger accuracy across training iterations and held-out evaluation queries.</p>
            </div>
        </header>

        <section class="kpi-grid">
            <div class="kpi">
                <span class="kpi-label">Best Score</span>
                <div class="kpi-value kpi-value--good">{best_score_val} <span class="kpi-tag">{score_scope}</span></div>
            </div>
            <div class="kpi">
                <span class="kpi-label">Iterations</span>
                <div class="kpi-value">{iterations_val}</div>
            </div>
            <div class="kpi">
                <span class="kpi-label">Train Queries</span>
                <div class="kpi-value">{train_size_val}</div>
            </div>
            <div class="kpi">
                <span class="kpi-label">Test Queries</span>
                <div class="kpi-value">{test_size_val}</div>
            </div>
        </section>

        <section class="desc-grid">
            <div class="desc-card">
                <span class="desc-kicker"><i class="dot dot--muted"></i> Original Description</span>
                <p class="desc-text">{orig_desc}</p>
            </div>
            <div class="desc-card desc-card--best">
                <span class="desc-kicker"><i class="dot dot--ok"></i> Best Description</span>
                <p class="desc-text">{best_desc}</p>
            </div>
        </section>

        <section class="table-card">
            <div class="table-bar">
                <span class="table-title">Iteration History</span>
                <div class="legend">
                    <span class="legend-item"><i class="dot dot--ok"></i> Should trigger</span>
                    <span class="legend-item"><i class="dot dot--no"></i> Should not</span>
                    <span class="legend-item"><span class="split-pill">Train</span></span>
                    <span class="legend-item"><span class="split-pill split-pill--test">Test</span></span>
                </div>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Iter</th>
                            <th>Train</th>
                            <th>Test</th>
                            <th>Description</th>
"""]

    for qinfo in train_queries:
        dot_cls = "dot--ok" if qinfo["should_trigger"] else "dot--no"
        tip = "Should trigger" if qinfo["should_trigger"] else "Should not trigger"
        html_parts.append(
            f'                            <th class="query-head" title="{tip}">'
            f'<div class="qh-meta"><i class="dot {dot_cls}"></i><span class="split-pill">Train</span></div>'
            f'<div class="qh-text">{html.escape(qinfo["query"])}</div></th>\n'
        )

    for qinfo in test_queries:
        dot_cls = "dot--ok" if qinfo["should_trigger"] else "dot--no"
        tip = "Should trigger (held-out)" if qinfo["should_trigger"] else "Should not trigger (held-out)"
        html_parts.append(
            f'                            <th class="query-head" title="{tip}">'
            f'<div class="qh-meta"><i class="dot {dot_cls}"></i><span class="split-pill split-pill--test">Test</span></div>'
            f'<div class="qh-text">{html.escape(qinfo["query"])}</div></th>\n'
        )

    html_parts.append("""                        </tr>
                    </thead>
                    <tbody>
""")

    for h in history:
        iteration = h.get("iteration", "?")
        description = h.get("description", "")
        train_results = h.get("train_results", h.get("results", []))
        test_results = h.get("test_results", [])

        train_by_query = {r["query"]: r for r in train_results}
        test_by_query = {r["query"]: r for r in test_results} if test_results else {}

        train_correct, train_runs = _aggregate_runs(train_results)
        test_correct, test_runs = _aggregate_runs(test_results)
        train_class = _score_class(train_correct, train_runs)
        test_class = _score_class(test_correct, test_runs)

        is_best = iteration == best_iter
        row_class = "best-row" if is_best else ""
        best_badge = '<span class="best-tag">Best</span>' if is_best else ""
        test_score_html = (
            f'<span class="score {test_class}">{test_correct}/{test_runs}</span>'
            if test_runs > 0
            else '<span style="color:var(--faint)">—</span>'
        )

        html_parts.append(f"""                        <tr class="{row_class}">
                            <td><span class="iter-cell">#{html.escape(str(iteration))}{best_badge}</span></td>
                            <td><span class="score {train_class}">{train_correct}/{train_runs}</span></td>
                            <td>{test_score_html}</td>
                            <td class="description">{html.escape(description)}</td>
""")

        for qinfo in train_queries:
            r = train_by_query.get(qinfo["query"], {})
            did_pass = r.get("pass", False)
            triggers = r.get("triggers", 0)
            runs = r.get("runs", 0)
            icon = "✓" if did_pass else "✗"
            cls = "cell-pill--pass" if did_pass else "cell-pill--fail"
            html_parts.append(
                f'                            <td class="result"><span class="cell-pill {cls}">{icon} {triggers}/{runs}</span></td>\n'
            )

        for qinfo in test_queries:
            r = test_by_query.get(qinfo["query"], {})
            did_pass = r.get("pass", False)
            triggers = r.get("triggers", 0)
            runs = r.get("runs", 0)
            icon = "✓" if did_pass else "✗"
            cls = "cell-pill--pass" if did_pass else "cell-pill--fail"
            html_parts.append(
                f'                            <td class="result"><span class="cell-pill {cls}">{icon} {triggers}/{runs}</span></td>\n'
            )

        html_parts.append("                        </tr>\n")

    html_parts.append("""                    </tbody>
                </table>
            </div>
        </section>
    </main>
</body>
</html>
""")

    return "".join(html_parts)


def main():
    parser = argparse.ArgumentParser(description="Generate HTML report from run_loop output")
    parser.add_argument("input", help="Path to JSON output from run_loop.py (or - for stdin)")
    parser.add_argument("-o", "--output", default=None, help="Output HTML file (default: stdout)")
    parser.add_argument("--skill-name", default="", help="Skill name to include in the report title")
    args = parser.parse_args()

    if args.input == "-":
        data = json.load(sys.stdin)
    else:
        data = json.loads(Path(args.input).read_text())

    html_output = generate_html(data, skill_name=args.skill_name)

    if args.output:
        Path(args.output).write_text(html_output)
        print(f"Report written to {args.output}", file=sys.stderr)
    else:
        print(html_output)


if __name__ == "__main__":
    main()
