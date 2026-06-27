---
version: "0.1.0"
description: >
  Agentur für Arbeit Eigenbemühungen report generation.
  Pure data export — 0 AI tokens. SQL query → formatted report.
  This skill is a documentation stub; actual logic is in Rust (db.rs).
inputs:
  - name: period_start
    description: Report period start date (ISO 8601)
  - name: period_end
    description: Report period end date (ISO 8601)
  - name: applicant_name
    description: Full name for the report header
output_format: |
  Structured table: date / company / position / method / status / contact.
  Formats: PDF (primary, print-ready), xlsx, DOCX.
recommended_model: none  # No AI — pure SQL export
language_note: Always German (Behördensprache). UI language does not affect this.
status: v2 feature — Rust implementation, no prompt needed
---

No prompt here — this is a code-side feature (SQL → PDF/xlsx export).
See ROADMAP.md §9 for spec.
