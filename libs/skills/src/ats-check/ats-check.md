---
version: "0.1.0"
description: >
  ATS filter check for a CV/resume against a job description.
  Checks hyperref, fonts, formatting issues, keyword presence.
  Encodes the Endress+Hauser hyperref lesson as a hard check.
inputs:
  - name: cv_text
    description: Plain-text extraction of the CV
  - name: job_description
    description: Full job description text
  - name: language
    description: Language for output
output_format: |
  {
    "ats_pass": true | false,
    "issues": [
      { "severity": "high|medium|low", "issue": "...", "fix": "..." }
    ],
    "keyword_coverage": 0-100,
    "summary": "..."
  }
recommended_model: economy
language_note: Output language controlled by `language` input.
---

<!-- PROMPT TEMPLATE — fill at runtime -->
<!-- Injected: {{cv_text}}, {{job_description}}, {{language}} -->

TODO: Write ATS check prompt template.
