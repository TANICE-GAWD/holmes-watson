import { z } from 'zod';

export const Label = z.enum(['real-bug', 'flaky', 'agent-misunderstanding']);
export type Label = z.infer<typeof Label>;

export const FailureReport = z.object({
  case_id: z.string(),
  flow_id: z.string(),
  intent: z.string(),
  step: z.string(),
  observed_behavior: z.string(),
  agent_reasoning: z.string(),
  dom_excerpt: z.string(),
  screenshot_path: z.string().optional(),
});
export type FailureReport = z.infer<typeof FailureReport>;

export const Verdict = z.object({
  label: Label,
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  suggested_linear_title: z.string(),
});
export type Verdict = z.infer<typeof Verdict>;

export const LabeledCase = z.object({
  case_id: z.string(),
  true_label: Label,
  note: z.string().optional(),
});
export type LabeledCase = z.infer<typeof LabeledCase>;
