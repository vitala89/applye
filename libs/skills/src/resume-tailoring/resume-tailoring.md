---
version: "0.1.0"
description: >
  Three-pass CV tailoring: XYZ rewrite → dual critique → build.
  Rewrites experience bullets for the specific JD. Never invents experience.
  User reviews and approves every change.
inputs:
  - name: profile_md
    description: Full profile markdown
  - name: job_description
    description: Full job description text
  - name: scoring_json
    description: Output from job-scoring skill (for context)
  - name: pass
    description: "1 = XYZ rewrite, 2 = critique, 3 = final build"
  - name: language
    description: Target language for the CV
output_format: |
  Pass 1: Rewritten experience bullets in XYZ format.
  Pass 2: Critique from two perspectives (recruiter + hiring manager).
  Pass 3: Final tailored CV sections ready for export.
recommended_model: quality
language_note: CV output language is `language` input, not UI language.
---

<!-- PROMPT TEMPLATE — fill at runtime -->
<!-- Injected: {{profile_md}}, {{job_description}}, {{scoring_json}}, {{pass}}, {{language}} -->

TODO: Write resume tailoring prompt template (3-pass).
