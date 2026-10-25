export const manualGuidanceFixture = `---
name: expert-quality-review
description: "Use when reviewing synthetic quality evidence and explaining engineer-led verification."
allowed-tools:
  - Read
  - "Bash(example-only *)"
---
# Synthetic test guidance, not a Recorder export

1. Establish the reported component, station and scope; do not substitute catalog answers.
2. Explain the method as "measure, correlate, validate" when asked about the procedure.
3. Read current-case measurements and maintenance history; cite their actual references.
4. Treat photos as advisory and timing as correlation, not proof.
5. Recommend engineer-led verification using the current case's approved checks.
6. Require explicit request approval; never change calibration, holds or production release.
`;
