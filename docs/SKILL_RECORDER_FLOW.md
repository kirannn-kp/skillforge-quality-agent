# Capturing know-how with Skill Recorder

Use the actual [Microsoft Skill Recorder](https://github.com/microsoft/skill-recorder)
as a separate desktop application. This repository does not fork, copy its UI,
install it automatically or claim to host its recording service.

## Windows preparation

The upstream README and latest release were checked while preparing this
walkthrough (release v0.7.0 at that check). Windows 11 x64/ARM64 is supported;
the release is source-only, not a downloadable signed installer.

1. Open [the latest release](https://github.com/microsoft/skill-recorder/releases/latest).
2. Review its **inspect-first instructions** and your organization's installation
   policy. Copy the complete **Commit-pinned installation** command for Windows
   x64 or ARM64 from that release, not an unpinned template.
3. Run the reviewed command in PowerShell. The upstream installer downloads its
   pinned Node runtime, builds the exact release commit, and creates a
   **Skill Recorder (Source)** shortcut. Copilot CLI ships with the application;
   a GitHub account with Copilot access is required.
4. Launch that shortcut, complete sign-in/readiness checks, and select the
   microphone if narration is desired.
5. Close unrelated windows, notifications, credentials and real work/data before
   recording. Use fictional data only. Local capture does not mean analysis is
   offline: Recorder uses GitHub Copilot CLI for reconstruction. Review its
   current privacy/data-processing behavior and organization policy first.

The setup for this workstation installed the exact v0.7.0 release outside the
demo repository and opened its real desktop window. Its Start Menu/desktop
shortcut is **Skill Recorder (Source)**. Sign-in and explicit capture remain
your actions; the web app does not start Recorder, authenticate on your behalf,
or capture your desktop. No genuine recording/export has been supplied yet.

## Three surfaces for the live demo

Keep the Quality Agent open in the original browser tab. **Skill studio** opens
another tab without replacing its session or disconnecting its avatar.

1. **Real Recorder desktop window:** capture, analyze, review and export.
2. **Expert source records browser tab:** manually inspect synthetic source
   records and write a preliminary hypothesis/checks while narrating.
3. **Skill Studio review/attach tab:** import the actual exported `.md`, review,
   publish and bind the approved guidance to an authorized local agent.

Use port 3001 for the built app, or 5173 for Vite:
- Expert: `/?workspace=skills&view=expert&scoutTheme=dark`
- Review/attach: `/?workspace=skills&scoutTheme=dark`

## Record the expert performing the manual investigation

1. Open **Expert source records**, choose Station 42 and keep avatar speech
   muted in the other tab. Close unrelated windows and real information.
2. In the actual desktop Recorder, choose narration/microphone if desired and
   explicitly start recording (`Ctrl+Shift+R` per upstream README).
3. Open **Quality issue**. Say: "I establish the component, station and affected
   scope: eighteen vehicles. This image is illustrative, not a measured defect."
4. Open **Production measurements**. Inspect the table/chart and say:
   "Force crosses the synthetic 50-newton upper limit at 14:32."
5. Open **Maintenance history**. Say: "TC-4412 occurred at 14:05. The timing
   is correlated, not proof; I need measured verification."
6. Open **Engineering knowledge** and QI-1847. Explain why its hinge/profile
   checks apply. These are fictional procedures, not real production approvals.
7. Fill **Preliminary hypothesis** and **Next verification checks** in your own
   words. Say: "I would prepare an engineer-review request. Request creation is
   separate from authorization to recalibrate, change a hold or release production."
8. Stop recording. Click **Analyze**, review/edit the reconstructed steps,
   generate the skill, use **Review SKILL.md**, then **Export** a `.md` file.
   A read-only preview is not a security review; edit the plan if changes are needed.
9. Generalize incidental issue/station/count/limit values, retain uncertainty,
   evidence citations and approval safeguards, and review with the process owner.

These pages are read-only synthetic source-system views, not live enterprise
systems. The worksheet is temporary in this tab; no AI investigation, production
action or approval is triggered there.

Suggested intent: "Review a synthetic vehicle-quality investigation, reconcile
scope, distinguish observations from measurements and correlations, and prepare
a cited engineer-review request without authorizing production changes."

## Turning a reviewed export into this agent's procedure

1. In **Review & attach**, choose the exported Markdown file (UTF-8, up to 24 KB).
   Importing only stages a draft; it neither publishes nor attaches anything.
2. Inspect the entire plaintext file and SHA-256 hash. Scripts, linked resources
   and declared tool permissions are not imported/executed.
3. Assign a new publication version and synthetic reviewer label. Choose
   **Export from my Recorder session** and supply the actual session/export
   reference. For a manually authored file or test fixture, choose manual guidance
   instead; never fabricate recording provenance.
4. Acknowledge exact-file review, synthetic-only content, fixed workflow limits
   and use of the guidance by the configured Azure model. Click
   **Approve & publish reviewed version**.
5. Choose the target agent and published version, inspect its receipt/hash, then
   click **Attach reviewed version to agent**.
6. Return to the Quality Agent and start a **New investigation**. Its skill
   inspector, conversational context and skill-load audit use that exact version
   and hash. An idle agent updates immediately; a case already started retains
   its old pin and approval. Attach separately to Production Support Assistant
   to use the same guidance in the paint scenario.

Publications and bindings persist locally under git-ignored
`.local/skill-library/library.json`. Versions are immutable through the app.
Reviewer and Recorder reference fields are operator declarations, not verified
identity or cryptographic recording attestations. The original file is unchanged;
the version is publication metadata. Source/model context is visible in the agent.

The attached body is **reviewed conversational guidance** for the fixed 14-stage
server workflow, not executable arbitrary workflow code. It cannot add tools,
execute shell commands, change measured evidence or grant approval. Generated
steps outside that supported process need separate engineering changes/tests;
attachment alone does not implement them. No hosted Foundry import is claimed.

Then test the same reviewed procedure on Station 43 (latch, 12 vehicles), Station
58 (tailgate gap, 9) and Paint Booth 7 (coating, 31). Verify that it reads each
case's measurements, references, limit direction and procedure rather than
copying Station 42's hinge/calibration recommendation. Include unknown stations,
conflicting counts, irrelevant photos and rejected approval.

For a visible read-only before/after, open **Compare briefings** in a separate
Skill Studio tab. Generate the baseline, keep that tab open while publishing and
attaching, then refresh attached guidance and generate the expert briefing.
Both actual Azure calls use the same question, model and synthetic records.
The baseline excludes expert procedural instructions; the expert adds the
currently attached Markdown body. Verify matching evidence hashes and inspect
the expert version/hash receipt. This does not run or alter the 14-stage workflow,
create incidents, or prove every baseline answer is inferior. A failed call is
not replaced with a canned answer. See [the recording runbook](DEMO_SCRIPT.md).

A bounded connected rehearsal used explicitly synthetic manual guidance, not a
Recorder export. The real `gpt-4.1-mini` response followed its "measure, correlate,
validate" method in 1.75 seconds without inventing an issue or action. The exact
attached hash was verified; the isolated publication was removed and the
user-facing library was left unchanged.

## Real workflow to rehearse

1. Build or open fictional quality, production, maintenance and engineering
   pages. Use synthetic data only.
2. Expert records a work session and optional narration. Explain evidence
   selection, correlation limits and why approval is required.
3. Analyze the recording into intent plus ordered steps; review and correct them.
4. Generate and inspect the draft SKILL.md.
5. Generalize incidental issue IDs and station names; retain process safeguards.
6. Expert, quality owner and security/process owners approve the content.
7. Publish and attach the approved version in Skill Studio. Any hosted platform
   deployment is a separate, explicitly verified integration.
8. Attach only to authorized agents and evaluate all four scenarios before enabling.

The Recorder README confirms a Skill is a reusable SKILL.md procedure and that
recorded UI activity can be generalized to native agent tools. Do not equate
recorded clicks with tools or deploy an unreviewed draft.

## Bundled example

`../skills/vehicle-quality-investigation/SKILL.md` is authored as a synthetic,
reviewed export illustration, metadata-versioned 1.0.0. There is no accompanying
real expert recording, approval attestation or production Foundry import.
The UI labels this clearly.

The local registry supplies this example when no reviewed publication is bound.
Both fictional agents follow the same 14-step typed workflow using case-specific
tools/evidence. Reviewed imports provide actual additional model context without
replacing those mandatory server controls.

## Reveal timing

Keep Skill Recorder hidden during the first live investigation. After CA-1041,
reveal how the agent learned the procedure. Then show Q-3012 reuse. If you do not
have a reviewed recording, show the provenance timeline and say it is illustrative.
Do not fabricate recording provenance or claim a one-click production connection.
