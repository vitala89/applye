export interface ParsedCv {
  personalDetails?: {
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  summary?: string | null;
  experience?: { company: string; role: string; bullets?: string[] }[] | null;
  skills?: string[] | null;
}

export function cvToProfileMarkdown(cv: ParsedCv): string {
  const out: string[] = [];
  const name = cv.personalDetails?.fullName?.trim();
  if (name) out.push(`# ${name}`);
  const contact = [cv.personalDetails?.email, cv.personalDetails?.phone]
    .filter(Boolean)
    .join(' · ');
  if (contact) out.push(contact);
  if (cv.summary?.trim()) out.push('', '## Summary', cv.summary.trim());
  if (cv.experience?.length) {
    out.push('', '## Experience');
    for (const e of cv.experience) {
      out.push('', `### ${e.role} — ${e.company}`);
      for (const b of e.bullets ?? []) out.push(`- ${b}`);
    }
  }
  if (cv.skills?.length) out.push('', '## Skills', cv.skills.join(', '));
  return out.join('\n').trim();
}

export function parseArchetypesSkillResponse(text: string): {
  archetypes: string[];
  compRange: string | null;
} {
  const empty = { archetypes: [] as string[], compRange: null as string | null };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const obj = JSON.parse(match[0]) as { archetypes?: unknown; compRange?: unknown };
    const archetypes = Array.isArray(obj.archetypes)
      ? obj.archetypes.filter((x): x is string => typeof x === 'string')
      : [];
    const compRange = typeof obj.compRange === 'string' ? obj.compRange : null;
    return { archetypes, compRange };
  } catch {
    return empty;
  }
}
