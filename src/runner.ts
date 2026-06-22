import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flows } from './flows';
import { runFlow } from './agent';

function selectFlows() {
  const args = process.argv.slice(2);
  if (args.includes('--all')) return flows;
  const i = args.indexOf('--flow');
  const id = i >= 0 ? args[i + 1] : undefined;
  return flows.filter((f) => f.id === id);
}

async function main() {
  const selected = selectFlows();
  if (!selected.length) {
    console.error('usage: npm run flow -- --all | --flow <id>');
    console.error(`flows: ${flows.map((f) => f.id).join(', ')}`);
    process.exit(1);
  }

  mkdirSync('artifacts/fixtures', { recursive: true });
  const headed = Boolean(process.env.HEADED);
  const browser = await chromium.launch({
    headless: !headed,
    slowMo: headed ? 400 : 0,
  });
  try {
    for (const flow of selected) {
      const page = await browser.newPage();
      try {
        const reports = await runFlow(page, flow);
        for (const report of reports) {
          const path = join('artifacts/fixtures', `${report.case_id}.json`);
          writeFileSync(path, JSON.stringify(report, null, 2));
        }
        console.log(`${flow.id}: ${reports.length} failure report(s)`);
      } catch (err) {
        console.error(`${flow.id}: run failed — ${(err as Error).message.split('\n')[0]}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main();
