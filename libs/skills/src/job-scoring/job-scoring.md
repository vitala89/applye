---
version: "0.1.0"
description: >
  Blunt recruiter-style scoring of a job description against a compressed profile.
  Returns a structured JSON score with dimension breakdown, missing keywords,
  and hiring-manager red flags. No fluff — how an HR screener actually reads.
inputs:
  - name: profile_json
    description: Compressed scoring profile (generated once from profile.md)
  - name: job_description
    description: Full job description text
  - name: language
    description: Language for rationale output (e.g. "en", "de")
output_format: |
  {
    "score": 0-100,
    "dimensions": [
      { "name": "...", "score": 0-10, "comment": "..." }
    ],
    "missing_keywords": ["..."],
    "red_flags": ["..."],
    "ats_pass": true | false,
    "ats_notes": "...",
    "summary": "2-3 sentence blunt assessment"
  }
recommended_model: economy
language_note: Output language controlled by `language` input, not model default.
---

<!-- PROMPT TEMPLATE — fill at runtime -->
<!-- Injected: {{profile_json}}, {{job_description}}, {{language}} -->

TODO: Write scoring prompt template.
