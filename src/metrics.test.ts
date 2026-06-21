import assert from 'node:assert/strict';
import { score, ScoredRow } from './metrics';

const row = (
  true_label: ScoredRow['true_label'],
  label: ScoredRow['label'],
  confidence: number,
): ScoredRow => ({
  case_id: `${true_label}/${label}/${confidence}`,
  true_label,
  label,
  confidence,
  agreement: 1,
  rationale: '',
});

const rows: ScoredRow[] = [
  row('real-bug', 'real-bug', 0.9),               // caught + filed
  row('real-bug', 'agent-misunderstanding', 0.9), // missed real bug
  row('flaky', 'real-bug', 0.7),                   // false alarm, but below file threshold
  row('flaky', 'flaky', 0.9),
];

const s = score(rows);
assert.equal(s.predReal, 2, 'two rows predicted real-bug');
assert.equal(s.tp, 1, 'one of them is actually real');
assert.equal(s.precision, 0.5, 'precision = 1/2');
assert.equal(s.actualReal, 2, 'two rows are actually real');
assert.equal(s.recall, 0.5, 'recall = 1/2');
assert.equal(s.baselinePrecision, 0.5, 'baseline files all 4, 2 real');
assert.equal(s.filed, 1, 'only the conf>=0.8 real-bug prediction is filed');
assert.equal(s.filedReal, 1);
assert.equal(s.filedWrong, 0);

console.log('metrics ok');
