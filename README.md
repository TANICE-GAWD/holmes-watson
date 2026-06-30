# Holmes-Watson: Automated QA Triage

An autonomous QA browser agent finds "failures." A second-stage LLM judge decides
which ones are **real bugs** worth filing, and kills the rest before they reach a
developer's tracker. The whole pitch is one number: **39%** of raw agent reports are
real bugs; after the judge, **100%** of filed ones are.

## Purpose

LLM-driven tests check against stated **intent**, not brittle selectors, so they
survive a renamed button. The cost is **over-reporting**: the agent flags async
content, valid-but-odd copy, and intentional empty states as failures. A noisy QA bot
gets muted in week one. The triage layer is the fix.

## The triage decision

```mermaid
flowchart TD
    rep["Agent FailureReport<br/>(intent vs observed)"] --> judge{"Judge classifies"}
    judge -->|"genuine defect"| rb["real-bug"]
    judge -->|"timing / non-determinism"| fl["flaky"]
    judge -->|"product was correct,<br/>agent misread success"| am["agent-misunderstanding"]
    rb --> gate{"conf >= 0.8 ?"}
    gate -->|yes| file["FILE IT"]
    gate -->|no| drop1["drop"]
    fl --> drop2["drop"]
    am --> drop3["drop"]
```

`filed` is a calibration decision, not the raw model number.

## System Architecture

```mermaid
flowchart TD
    subgraph live["Live run - npm run flow"]
        runner["runner.ts"] --> flows["flows.ts<br/>intents + steps"]
        runner --> agent["agent.ts<br/>decide -> execute loop"]
        agent --> pw["Playwright Chromium"]
    end

    subgraph llm["LLM layer - llm.ts"]
        structured["structured()<br/>tool-call + zod, throttle, retries"] --> gateway["Anthropic via Vercel gateway"]
    end

    subgraph offline["Offline eval - npm run eval"]
        eval["eval.ts"] --> judge["judge.ts<br/>N-sample vote"]
        eval --> metrics["metrics.ts<br/>precision / recall / F1"]
        metrics --> report["results/report.md"]
    end

    agent -->|"FailureReport JSON"| fixtures["artifacts/fixtures/*.json"]
    labels["data/labeled_cases.jsonl"] --> eval
    fixtures --> eval
    agent --> structured
    judge --> structured
    schemas["schemas.ts<br/>FailureReport, Verdict, Label"] -.-> agent
    schemas -.-> judge
    schemas -.-> eval
```

## Agent loop

`runFlow` walks a flow's steps; each step gets one reconsider-retry before it reports.

```mermaid
flowchart TD
    start["goto start_url"] --> step["next step"]
    step --> decide["decide(): LLM picks one Action<br/>from DOM excerpt + screenshot"]
    decide --> kind{"action.kind"}
    kind -->|done| step
    kind -->|fail| emit["emit FailureReport"]
    kind -->|"click / fill / goto"| exec["execute via Playwright"]
    exec -->|ok| step
    exec -->|error| retry["decide() again with the error note"]
    retry -->|done| step
    retry -->|"new action ok"| step
    retry -->|"still fails"| emit
    emit --> step
```

## Data flow: DOM to verdict

```mermaid
flowchart LR
    dom["DOM + screenshot"] --> excerpt["domExcerpt()<br/>strip head/script/style, slice"]
    excerpt --> action["Action"]
    action -->|"kind == fail"| report["FailureReport"]
    report --> samples["N judge samples"]
    samples --> vote["vote()<br/>majority label, mean conf,<br/>agreement = winner share"]
    vote --> gate{"real-bug and conf >= 0.8 ?"}
    gate -->|yes| file["file"]
    gate -->|no| drop["drop"]
```

## Core Components

| File | Responsibility |
| --- | --- |
| `src/runner.ts` | CLI for live runs. Launches Chromium, selects flows, writes a `FailureReport` JSON per failure. |
| `src/flows.ts` | Five flows over `saucedemo.com` and `the-internet.herokuapp.com`: `intent`, `start_url`, `steps`. |
| `src/agent.ts` | The agent loop above: `runFlow`, `decide`, `execute`, `emit`. |
| `src/llm.ts` | Single LLM call site. Forced tool call, zod-validated, 3 retries, throttle queue. |
| `src/judge.ts` | Triage layer. `JUDGE_SAMPLES` classifications, `vote()` yields label + confidence + agreement. |
| `src/eval.ts` | Offline harness. Fixtures + labels in, `results/report.md` out. No browser. |
| `src/metrics.ts` | Confusion matrix, precision/recall/F1, baseline, gated `filed` counts, report renderer. |
| `src/schemas.ts` | Shared zod schemas: `FailureReport`, `Verdict`, `Label`, `LabeledCase`. |

## Run it

```bash
npm install              # put AI_GATEWAY_API_KEY in .env
npm run flow -- --all    # live: drive the agent, write fixtures
npm run eval             # offline: judge fixtures, regenerate report
npm test                 # metrics math self-check
npm run typecheck
```

Env: `AI_GATEWAY_API_KEY` (required), `JUDGE_SAMPLES` (default 1; headline uses 3),
`ANTHROPIC_MODEL` / `AGENT_MODEL` / `JUDGE_MODEL` (default `anthropic/claude-haiku-4.5`),
`LLM_DELAY_MS`, `HEADED`.

## Results

18 human-labeled cases. Counts over rates, because n is small.

| Metric | Result |
| --- | --- |
| Filed (real-bug, conf >= 0.8) | **6, all real, 0 wrong** |
| Judge precision on real-bug | **100%** (6/6) |
| Raw-agent baseline | **39%** (7/18) |
| Recall / F1 | **86% / 0.92** |

Full table in [`results/report.md`](results/report.md). The two misses both show low
`agreement` (0.67), the exact signal a human-review loop would catch.

## The harder problem

Hand-labeling 18 cases is the easy version. Apps drift and you cannot label every
customer's app. The open problem is **trust measurement without ground-truth labels**.

```mermaid
flowchart LR
    judge["Judge: label + confidence"] --> agree{"agreement / confidence<br/>high?"}
    agree -->|high| auto["auto-decide<br/>(file or drop)"]
    agree -->|low| human["route to human"]
    human --> newlabels["new labels"]
    newlabels -->|"cheap-label loop"| judge
```
