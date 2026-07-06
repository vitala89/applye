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
