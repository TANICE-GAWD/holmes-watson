import { judgeModel, structured } from './llm';
import { FailureReport, Verdict } from './schemas';

export type Judgement = Verdict & { agreement: number };

const SYSTEM = `You are the triage layer between an autonomous QA browser agent and a developer's Linear backlog. The agent over-reports: many of the "failures" it sends you are not real product bugs.

Classify each reported failure into exactly one label:
- real-bug: a genuine defect in the product under test — a broken image/asset, a server error (4xx/5xx), a control that does nothing, data that is not saved, a clearly broken layout. Filing this in Linear is correct.
- flaky: the failure comes from timing or non-determinism, not a defect. The agent acted before async content loaded, a resource was slow, or the content is A/B-tested or randomised. A human re-running it would likely pass.
- agent-misunderstanding: the product behaved correctly and matched the stated intent, and the agent misread success as failure — different-but-valid copy, an intentional empty or default state, a valid alternate flow.

Judge the OBSERVED BEHAVIOUR against the stated INTENT, not against the agent's own expectations. The agent's reasoning is a hint and is frequently wrong. If the observed behaviour is a normal, correct outcome for that intent, prefer agent-misunderstanding. If it hinges on waiting or timing, prefer flaky. Reserve real-bug for defects you would stake your credibility on.

Only confidence >= 0.8 real-bugs get filed, so be calibrated: a confident, wrong real-bug is the worst possible outcome.`;

function render(report: FailureReport): string {
  return [
    `Intent: ${report.intent}`,
    `Step that failed: ${report.step}`,
    `What the agent observed: ${report.observed_behavior}`,
    `Agent's own reasoning (may be wrong): ${report.agent_reasoning}`,
    `DOM excerpt:\n${report.dom_excerpt}`,
  ].join('\n\n');
}

export async function judge(
  report: FailureReport,
  samples = Number(process.env.JUDGE_SAMPLES) || 1,
): Promise<Judgement> {
  const runs = await Promise.all(
    Array.from({ length: samples }, () =>
      structured({
        model: judgeModel,
        system: SYSTEM,
        user: render(report),
        schema: Verdict,
        toolName: 'verdict',
        toolDescription: 'Classify the reported failure and propose a Linear title.',
      }),
    ),
  );
  return vote(runs);
}

// Majority vote over N samples. The winning label's share is "agreement" — a
// label-free trust signal: low agreement means the judge itself is unsure.
function vote(runs: Verdict[]): Judgement {
  const byLabel = new Map<string, Verdict[]>();
  for (const verdict of runs) {
    const group = byLabel.get(verdict.label) ?? [];
    group.push(verdict);
    byLabel.set(verdict.label, group);
  }

  const groups = [...byLabel.values()];
  groups.sort((a, b) => b.length - a.length);
  const winner = groups[0];

  const totalConfidence = winner.reduce((sum, verdict) => sum + verdict.confidence, 0);
  const confidence = totalConfidence / winner.length;

  return {
    ...winner[0],
    confidence: Number(confidence.toFixed(2)),
    agreement: Number((winner.length / runs.length).toFixed(2)),
  };
}
