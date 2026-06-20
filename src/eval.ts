import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FailureReport, LabeledCase } from './schemas';
import { judge } from './judge';
import { ScoredRow, renderReport } from './metrics';

const FIXTURES_DIR = 'artifacts/fixtures';
const LABELS_PATH = 'data/labeled_cases.jsonl';
const REPORT_PATH = 'results/report.md';

function loadLabels(): Map<string, LabeledCase> {
  const lines = readFileSync(LABELS_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.trim());

  const labels = new Map<string, LabeledCase>();
  for (const line of lines) {
    const labeled = LabeledCase.parse(JSON.parse(line));
    labels.set(labeled.case_id, labeled);
  }
  return labels;
}

function loadFixtures(): FailureReport[] {
  const files = readdirSync(FIXTURES_DIR).filter((file) => file.endsWith('.json'));
  return files.map((file) => {
    const raw = readFileSync(join(FIXTURES_DIR, file), 'utf8');
    return FailureReport.parse(JSON.parse(raw));
  });
}

async function main() {
  const labels = loadLabels();
  const reports = loadFixtures().filter((r) => labels.has(r.case_id));
  if (!reports.length) {
    console.error(`no labeled fixtures found in ${FIXTURES_DIR}`);
    process.exit(1);
  }

  const rows: ScoredRow[] = [];
  for (const report of reports) {
    const verdict = await judge(report);
    const { true_label } = labels.get(report.case_id)!;
    rows.push({ case_id: report.case_id, true_label, ...verdict });
    const hit = true_label === verdict.label ? 'ok ' : 'MISS';
    console.log(`${hit} ${report.case_id}: ${true_label} -> ${verdict.label} (${verdict.confidence})`);
  }

  mkdirSync('results', { recursive: true });
  writeFileSync(REPORT_PATH, renderReport(rows));
  console.log(`\nwrote ${REPORT_PATH}`);
}

main();
