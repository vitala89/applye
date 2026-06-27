---
version: "0.1.0"
description: >
  Company research summary for interview preparation.
  Produces culture notes, recent news, and smart questions to ask.
inputs:
  - name: company_name
    description: Company name
  - name: job_description
    description: Full job description text
  - name: language
    description: Language for output
output_format: |
  {
    "summary": "...",
    "recent_news": ["..."],
    "culture_notes": "...",
    "smart_questions": ["..."]
  }
recommended_model: economy
language_note: Output in `language`. German: include Unternehmenskultur angle.
status: v2 feature — not in MVP
---

<!-- PROMPT TEMPLATE — fill at runtime -->
<!-- Injected: {{company_name}}, {{job_description}}, {{language}} -->

TODO: Write company research prompt template.
