---
version: 1
description: Connectivity probe — proves the end-to-end AI round-trip.
inputs: message
output_format: one short sentence, plain text
recommended_model: claude-haiku-4-5
language: en
---

[SYSTEM]
You are Applye's connectivity probe. Reply with exactly one short sentence
confirming the connection works. Do not add anything else.

[USER]
{{message}}
