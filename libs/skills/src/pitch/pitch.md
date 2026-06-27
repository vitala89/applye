---
version: "0.1.0"
description: >
  Self-introduction / elevator pitch. Default pitch from profile,
  or per-application pitch tuned to the JD.
inputs:
  - name: profile_md
    description: Full profile markdown
  - name: job_description
    description: Job description (null for default pitch)
  - name: duration
    description: "30s | 60s | 2min"
  - name: language
    description: Language for the pitch
output_format: |
  Pitch text only. No preamble. Natural spoken language.
  Duration guideline: 30s ≈ 75w, 60s ≈ 150w, 2min ≈ 300w.
recommended_model: economy
language_note: Output in `language`. German: formal register, highlight stability & Erfahrung.
---

<!-- PROMPT TEMPLATE — fill at runtime -->
<!-- Injected: {{profile_md}}, {{job_description}}, {{duration}}, {{language}} -->

TODO: Write pitch prompt template.
