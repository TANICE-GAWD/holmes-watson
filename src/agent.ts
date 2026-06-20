import type { Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { agentModel, structured } from './llm';
import type { Flow } from './flows';
import type { FailureReport } from './schemas';

const Action = z.object({
  thought: z.string(),
  kind: z.enum(['click', 'fill', 'goto', 'done', 'fail']),
  target: z.string().optional(),
  value: z.string().optional(),
  observed: z.string().optional(),
});
type Action = z.infer<typeof Action>;

const SYSTEM = `You drive a web browser to accomplish a user's intent, one step at a time.
Given the intent, the current step, the page URL and a DOM excerpt, choose ONE action:
- click: target = visible text or a CSS selector
- fill: target = a field's label/placeholder/selector, value = the text to type
- goto: value = the url to open
- done: the current step is already satisfied
- fail: the page does not let you complete the step, or what you see clearly deviates from the intent — describe what you saw in "observed"

Lean towards reporting a failure when something looks wrong; a separate judge filters out false alarms downstream.`;

async function decide(flow: Flow, step: string, page: Page): Promise<Action> {
  const dom = (await page.content()).slice(0, 6000);
  const user = `Intent: ${flow.intent}\nCurrent step: ${step}\nURL: ${page.url()}\nDOM excerpt:\n${dom}`;
  return structured({
    model: agentModel,
    system: SYSTEM,
    user,
    schema: Action,
    toolName: 'act',
    toolDescription: 'Choose the next browser action for this step.',
  });
}


// If real customer apps break it, this is where Stagehand would slot in.
async function click(page: Page, target: string) {
  const byText = page.getByText(target, { exact: false }).first();
  if (await byText.count()) {
    return byText.click({ timeout: 5000 });
  }
  return page.locator(target).first().click({ timeout: 5000 });
}

async function fill(page: Page, target: string, value: string) {
  const candidates = [
    page.getByLabel(target),
    page.getByPlaceholder(target),
    page.locator(target),
  ];
  for (const locator of candidates) {
    if (await locator.first().count()) {
      return locator.first().fill(value, { timeout: 5000 });
    }
  }
  throw new Error(`no field matched "${target}"`);
}

async function execute(page: Page, action: Action) {
  switch (action.kind) {
    case 'goto':
      await page.goto(action.value ?? action.target ?? '', {
        waitUntil: 'domcontentloaded',
      });
      break;
    case 'click':
      await click(page, action.target ?? '');
      break;
    case 'fill':
      await fill(page, action.target ?? '', action.value ?? '');
      break;
  }
}

async function emit(
  page: Page,
  flow: Flow,
  i: number,
  step: string,
  observed: string,
  reasoning: string,
): Promise<FailureReport> {
  const case_id = `${flow.id}-${i}`;
  const screenshot_path = join('artifacts', `${case_id}.png`);
  await page.screenshot({ path: screenshot_path }).catch(() => undefined);
  return {
    case_id,
    flow_id: flow.id,
    intent: flow.intent,
    step,
    observed_behavior: observed,
    agent_reasoning: reasoning,
    dom_excerpt: (await page.content()).slice(0, 2000),
    screenshot_path,
  };
}

export async function runFlow(page: Page, flow: Flow): Promise<FailureReport[]> {
  mkdirSync('artifacts', { recursive: true });
  const reports: FailureReport[] = [];
  await page.goto(flow.start_url, { waitUntil: 'domcontentloaded' });

  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    const action = await decide(flow, step, page);

    if (action.kind === 'done') {
      continue;
    }

    if (action.kind === 'fail') {
      const observed = action.observed ?? 'agent reported a deviation';
      reports.push(await emit(page, flow, i, step, observed, action.thought));
      continue;
    }

    try {
      await execute(page, action);
    } catch (err) {
      const message = `action "${action.kind}" failed: ${(err as Error).message}`;
      reports.push(await emit(page, flow, i, step, message, action.thought));
    }
  }
  return reports;
}
