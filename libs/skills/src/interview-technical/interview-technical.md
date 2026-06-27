---
version: "0.1.0"
description: >
  Technical interview preparation. Generates Q&A with code examples
  tuned for the specific tech stack and seniority level from the JD.
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
  Array of { question, answer, code_example? } objects.
  Answers include working code snippets where relevant.
recommended_model: quality
language_note: Code is language-agnostic. Explanations in `language`.
---

<!-- PROMPT TEMPLATE — fill at runtime -->
<!-- Injected: {{profile_md}}, {{job_description}}, {{count}}, {{language}} -->

TODO: Write technical interview prep prompt template.
