import type { ImportRawRow, ImportSkipped } from '@applye/core';

/** What the import skill is asked to return, in its own snake_case shape. */
export interface ImportSkillResponse {
  normalized_rows: Array<{
    company: string;
    role: string;
    status: string;
    applied_at: string | null;
    notes: string | null;
    tech_stack: string | null;
    source_url: string | null;
    contact_name: string | null;
    contact_role: string | null;
    contact_channel: string | null;
    next_action: string | null;
    next_action_at: string | null;
    salary_range: string | null;
  }>;
  skipped: ImportSkipped[];
  duplicates_expected: string[];
}

/**
 * Strip a fenced code block, if the model wrapped its JSON in one.
 *
 * Models do this often enough that treating it as malformed output would fail
 * a response that is otherwise perfectly good.
 */
export function stripJsonFence(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/**
 * Parse the skill's answer, or throw with a **truncated** excerpt of what came
 * back instead. The excerpt matters: a parse failure with no sample of the text
 * is unactionable, and the whole response could be thousands of tokens.
 */
export function parseImportResponse(text: string): ImportSkillResponse {
  try {
    return JSON.parse(stripJsonFence(text)) as ImportSkillResponse;
  } catch {
    throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

/** The skill's snake_case rows in the shape the gateway takes. */
export function toRawRows(parsed: ImportSkillResponse): ImportRawRow[] {
  return parsed.normalized_rows.map((r) => ({
    company: r.company,
    role: r.role,
    status: r.status,
    appliedAt: r.applied_at,
    notes: r.notes,
    techStack: r.tech_stack,
    sourceUrl: r.source_url,
    contactName: r.contact_name,
    contactRole: r.contact_role,
    contactChannel: r.contact_channel,
    nextAction: r.next_action,
    nextActionAt: r.next_action_at,
    salaryRange: r.salary_range,
  }));
}
