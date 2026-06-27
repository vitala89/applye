---
version: "0.1.0"
description: >
  HR screening interview preparation. Generates STAR+R behavioral Q&A
  and culture-fit questions tuned for German market conventions.
inputs:
  - name: profile_md
    description: Full profile markdown
  - name: job_description
    description: Full job description text
  - name: count
    description: Number of Q&A pairs to generate
  - name: language
    description: Language for the prep material
output_format: |
  Array of { question, answer } objects.
  Answer in STAR+R format for behavioral questions.
  German culture notes when language = "de".
recommended_model: economy
language_note: Output in `language`. Adapt register to market conventions.
---

<!-- PROMPT TEMPLATE — fill at runtime -->
<!-- Injected: {{profile_md}}, {{job_description}}, {{count}}, {{language}} -->

TODO: Write HR interview prep prompt template.
