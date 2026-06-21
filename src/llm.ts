import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

try {
  process.loadEnvFile();
} catch {
  // no .env file — fall back to ambient environment
}

if (!process.env.AI_GATEWAY_API_KEY) {
  throw new Error('AI_GATEWAY_API_KEY is not set — copy .env.example to .env and fill it in');
}

export const client = new Anthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: 'https://ai-gateway.vercel.sh',
  maxRetries: 8,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The gateway's free tier rate-limits bursts, so requests go through a single
// queue spaced LLM_DELAY_MS apart. Bump credits and this can be removed.
const delayMs = Number(process.env.LLM_DELAY_MS) || 1500;
let queue: Promise<unknown> = Promise.resolve();
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  queue = result.then(
    () => sleep(delayMs),
    () => sleep(delayMs),
  );
  return result;
}

const defaultModel = process.env.ANTHROPIC_MODEL || 'anthropic/claude-haiku-4.5';
export const agentModel = process.env.AGENT_MODEL || defaultModel;
export const judgeModel = process.env.JUDGE_MODEL || defaultModel;

export async function structured<T>(opts: {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  toolName: string;
  toolDescription: string;
  maxTokens?: number;
}): Promise<T> {
  const inputSchema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  delete inputSchema.$schema;

  const message = await throttle(() =>
    client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      tools: [
        {
          name: opts.toolName,
          description: opts.toolDescription,
          input_schema: inputSchema as any,
        },
      ],
      tool_choice: { type: 'tool', name: opts.toolName },
      messages: [{ role: 'user', content: opts.user }],
    }),
  );

  const call = message.content.find((block) => block.type === 'tool_use');
  if (!call || call.type !== 'tool_use') {
    throw new Error(`${opts.toolName}: model returned no tool call`);
  }
  return opts.schema.parse(call.input);
}
