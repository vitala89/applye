---
version: "0.1.0"
description: >
  Cover letter generation tailored to a specific job and company.
  Honest, specific, not generic. German market conventions when applicable.
inputs:
  - name: profile_md
    description: Full profile markdown
  - name: job_description
    description: Full job description text
  - name: company_name
    description: Company name for personalization
  - name: language
    description: Target language for the cover letter
output_format: |
  Formatted cover letter text. No preamble, no commentary.
  Ready to paste into a document template.
recommended_model: quality
language_note: Output in `language`. German: use formal Sie, correct Bewerbungsformat.
---

<!-- PROMPT TEMPLATE - fill at runtime -->
<!-- Injected: {{profile_md}}, {{job_description}}, {{company_name}}, {{language}} -->

TODO: Write cover letter prompt template.
