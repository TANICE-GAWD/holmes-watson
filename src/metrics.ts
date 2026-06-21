import { Label } from './schemas';

export const ORDER = Label.options;
export const FILE_THRESHOLD = 0.8;

export interface ScoredRow {
  case_id: string;
  true_label: Label;
  label: Label;
  confidence: number;
  agreement: number;
  rationale: string;
}

export function confusionMatrix(rows: ScoredRow[]): number[][] {
  const matrix = ORDER.map(() => ORDER.map(() => 0));
  for (const row of rows) {
    const trueIndex = ORDER.indexOf(row.true_label);
    const predIndex = ORDER.indexOf(row.label);
    matrix[trueIndex][predIndex]++;
  }
  return matrix;
}

export function score(rows: ScoredRow[]) {
  const m = confusionMatrix(rows);
  const real = ORDER.indexOf('real-bug');
  const tp = m[real][real];
  const predReal = ORDER.reduce((sum, _label, t) => sum + m[t][real], 0);
  const actualReal = m[real].reduce((a, b) => a + b, 0);
  const precision = predReal ? tp / predReal : 0;
  const recall = actualReal ? tp / actualReal : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  // Raw-agent baseline: with no judge, every report is filed as a bug.
  const baselinePrecision = rows.length ? actualReal / rows.length : 0;

  const filed = rows.filter((r) => r.label === 'real-bug' && r.confidence >= FILE_THRESHOLD);
  const filedReal = filed.filter((r) => r.true_label === 'real-bug').length;

  return {
    m,
    tp,
    predReal,
    actualReal,
    precision,
    recall,
    f1,
    baselinePrecision,
    filed: filed.length,
    filedReal,
    filedWrong: filed.length - filedReal,
  };
}

export function renderReport(rows: ScoredRow[]): string {
  const s = score(rows);
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

  const header = `| true \\ predicted | ${ORDER.join(' | ')} |`;
  const sep = `| --- | ${ORDER.map(() => '---').join(' | ')} |`;
  const matrixRows = ORDER.map((t, i) => `| **${t}** | ${s.m[i].join(' | ')} |`);

  const sorted = rows.slice().sort((a, b) => a.case_id.localeCompare(b.case_id));
  const caseRows = sorted.map((row) => {
    const hit = row.true_label === row.label ? '✅' : '❌';
    const cells = [
      row.case_id,
      row.true_label,
      row.label,
      row.confidence,
      row.agreement,
      hit,
      row.rationale.replace(/\|/g, '/'),
    ];
    return `| ${cells.join(' | ')} |`;
  });

  return `# Holmes Triage — results

${rows.length} labeled cases. Metric that matters: **precision on \`real-bug\`** — the
share of things filed into Linear that are actually bugs. Counts, not just rates,
because n is small.

## Headline

- Filed into Linear (real-bug, confidence ≥ ${FILE_THRESHOLD}): **${s.filed}** — of which **${s.filedReal} real, ${s.filedWrong} wrong**.
- Judge precision on real-bug: **${pct(s.precision)}** (${s.tp}/${s.predReal}).
- Raw-agent baseline (file every report): **${pct(s.baselinePrecision)}** (${s.actualReal}/${rows.length}).
- Recall: ${pct(s.recall)} · F1: ${s.f1.toFixed(2)}.

The judge's job is to move precision up from the baseline without dropping the
real bugs on the floor. The delta between those two numbers is the whole point.

## Confusion matrix

${header}
${sep}
${matrixRows.join('\n')}

## Per-case

| case_id | true | predicted | conf | agree | ✓ | rationale |
| --- | --- | --- | --- | --- | --- | --- |
${caseRows.join('\n')}
`;
}
