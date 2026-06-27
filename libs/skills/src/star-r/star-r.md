---
version: "0.1.0"
description: >
  Generate STAR+R behavioral stories for a story bank.
  Stories are reusable across companies (marked "to bank").
inputs:
  - name: profile_md
    description: Full profile markdown
  - name: competency
    description: Target competency (e.g. "conflict resolution", "technical leadership")
  - name: count
    description: Number of STAR+R stories to generate
  - name: language
    description: Language for the stories
output_format: |
  Array of {
    title, situation, task, action, result, reflection, tags
  }
recommended_model: economy
language_note: Output in `language`. German: Reflexion besonders wichtig (Lernkultur).
---

<!-- PROMPT TEMPLATE — fill at runtime -->
<!-- Injected: {{profile_md}}, {{competency}}, {{count}}, {{language}} -->

TODO: Write STAR+R story bank prompt template.
