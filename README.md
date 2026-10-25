# Quality Live Agent / SkillForge

**From Know-How to Scale: Engineering the Future of AI Skills**

A presentation-ready, synthetic automotive quality investigation demo. An operator
reports a symptom, an engineering board fills progressively, parallel tools
retrieve evidence, a reviewed skill supplies the procedure, and a human explicitly
approves creation of a corrective-action request.

**Voice + Vision + Agent + Skills + Actions** are illustrated without pretending
that a mock investigation is a deployed Microsoft agent. Azure Speech MAI Flash
and a real-time standard avatar are separately available as opt-in integrations.
Optional Foundry conversation adds natural intake and corrections using an
existing deployment; separately consented Azure image inference inspects actual
uploaded images. Investigation records and actions remain synthetic.
The separate **Skill Studio** imports an actual exported Markdown skill for
explicit review, immutable local publication and agent binding. Its exact body
is used as version-pinned conversational guidance; the server's fixed 14-stage
evidence/action workflow and approval controls are not replaced by executable prose.
Generic branding, synthetic records and user-supplied reference images are used;
the photographs are not verified inspection evidence for the fictional vehicles.
No real factory records or confidential data are included. EVS is a fictional vehicle name.

## Quick start

Requirements: Node.js 24 LTS and npm. No Azure account or credentials are needed.

### Proactive detection / approved incident demo

1. Open **Control tower** from the live agent, or
   `http://127.0.0.1:3001/?workspace=quality&scoutTheme=dark`.
2. The monitor checks exactly 1,000 persisted synthetic vehicle measurement
   records. Eighteen Station 42 vehicles exceed the door-closing-force limit;
   DEMO-00427 measures 62 N against a 50 N upper limit. This is a threshold
   replay, not a claim that AI inspected 1,000 images or a live camera feed.
3. Open the **Station 42 dashboard** in another tab. It initially has no alerts:
   `http://127.0.0.1:3001/?workspace=quality&station=Station%2042&scoutTheme=dark`.
4. Click **Open investigation** on the detection card. When the agent is idle,
   the selected vehicle is investigated and the agent opens in the same tab,
   with the case loaded and ready for review. The theme and shared session are
   preserved; microphone capture and paid avatar connections are not started.
   If another case is active, **Open current investigation** continues that case
   without overwriting its scope. Failed investigations remain visible on the
   control tower rather than navigating to an apparently successful result.
   The agent collects production, maintenance and historical evidence, shows a
   clearly labelled supplied hinge reference image and asks whether to create an
   incident, notify the station and store the details. No pixel analysis is
   claimed. This record-led path can propose an inspection incident without a
   photo diagnosis; the existing consented photo-led flow remains available.
   Once a vehicle has an incident, the control tower offers the next flagged
   vehicle without an incident. Saved history remains available; if every flagged
   vehicle has an incident, it offers the saved record rather than duplicating it.
5. In **Live conversation**, say **"Can you tell me your investigation?"**.
   The agent summarizes the measurement evidence and explicitly asks whether to
   create an incident, publish the local station alert and save the evidence.
   Say **"Yes"** or **"Yes, please"**, or open **Incident** and click **Approve incident, alert & save**.
   A bound **"No"** rejects without writes. An LLM response cannot grant approval.
6. Approval creates one **incident**, publishes one alert to the **local
   station dashboard**, and saves the evidence in a single SQLite
   transaction. The station refreshes every two seconds. Publication is not
   recipient acknowledgement or delivery to an actual factory, email or Teams.
7. Click **Open INC-1001 details** (using the actual displayed ID). The durable record contains the
   primary vehicle measurement, 18 related vehicle IDs, evidence references,
   uncertain hypothesis, recommendations, pinned skill, approval and audit.
   The same link works after a server restart; history is in the control tower.

The board has keyboard-accessible **Investigation**, **Evidence & correlation**
and **Incident** tabs. Findings and reference imagery appear in Investigation;
source records and charts live in Evidence; the proposal and result live in
Incident. Findings summaries select Investigation and approved creation selects
Incident. Routine SSE updates preserve manual tab selection. Detailed checks,
image limitations and the full proposal are expandable rather than stacked.

The interface and speech use ordinary incident wording with one prominent
**Synthetic demo / local station alerts** disclosure. No enterprise incident
service is connected. New IDs use a transactional SQLite sequence (INC-1001,
INC-1002, ...); numbering persists across restarts and rolls back on failed
writes. Existing UUID-based IDs, links and immutable evidence remain valid.

You can also start hands-free conversation on an idle/empty investigation and
ask for the findings directly, without first clicking the control tower.
The server selects the first flagged vehicle without an existing incident;
it never overwrites already reported intake facts or an open investigation.
After success the avatar asks **"What else would you like me to investigate?"**
and hands-free listening continues for read-only evidence questions. For a
different case, explicitly reset/select a new investigation; a follow-up does
not silently change scope or duplicate the incident.

Conversational confirmation is limited to this mock incident/alert/save scope.
The client captures request/prompt IDs when microphone capture starts; the
server requires those IDs, the latest explicit proposal, an unexpired two-minute
window and an unambiguous affirmative. Stale, expired or missing context is
denied and the proposal is refreshed. An intervening unrelated question
invalidates the old confirmation. Failed conversational writes re-propose and
require fresh human approval. Evidence summaries and confirmation are
server-handled; open-ended dialogue still uses the configured model, without
fallback on model failure. Ordinary corrective actions retain button approval.

Production uses git-ignored `.local/quality-demo.sqlite`; override with
`INCIDENT_DATABASE_PATH`. Node's built-in SQLite currently emits an experimental
warning on Node 24.14. Database opening or fleet-count failures stop startup;
malformed stored records fail explicitly on read. Neither selects a memory
fallback. `createApp()` defaults to an isolated in-memory
database for tests; the production entry point explicitly supplies the file.
Only approved proactive incident snapshots and station alerts persist; ordinary
investigations remain session memory. Duplicate detection/vehicle incidents are
blocked. This does not change calibration, manufacturing holds or release.

### Recorder / expert / attachment demo

1. Run the official **Microsoft Skill Recorder** desktop application separately;
   this app does not imitate its capture UI or start a recording automatically.
2. Open **Skill studio** in a second tab, then **Expert source records**.
   Manually inspect fictional quality, production, maintenance and engineering
   records and explain your reasoning while recording.
3. In Recorder, stop, analyze, review the generated skill and export its `.md` file.
4. In Skill Studio, import that file, inspect the complete plaintext preview/hash,
   assign a version and reviewer label, declare its source/session reference and
   explicitly acknowledge review, synthetic-only data, runtime limits and model use.
5. Publish, then select the target agent and click **Attach reviewed version to agent**.
6. Return to the Quality Agent and start a new investigation. The skill inspector,
   model context and skill-load audit use the attached name/version/content hash.
   Existing cases, including pending approvals, remain pinned to their old version.

Local URLs (replace port with 5173 during Vite development):
- Agent: `http://127.0.0.1:3001/?scoutTheme=dark`
- Review/attach: `http://127.0.0.1:3001/?workspace=skills&scoutTheme=dark`
- Manual expert records: `http://127.0.0.1:3001/?workspace=skills&view=expert&scoutTheme=dark`
- Read-only briefing comparison: `http://127.0.0.1:3001/?workspace=skills&view=comparison&scoutTheme=dark`

**Compare briefings** runs genuine, explicitly requested Azure model calls.
Generate the baseline first, then attach/refresh the reviewed publication and
generate the expert briefing. Both conditions use the same question, synthetic
record snapshot, configured model, token budget and safety rules. The baseline
omits bundled and attached expert procedure instructions; the expert adds only
the attached Markdown body. Receipts show the matching evidence SHA-256 and
the exact expert skill version/hash. This is a read-only model explanation
comparison, not a second operational workflow, an automated quality benchmark,
or a claim that the baseline cannot reason. It neither mutates the current case
nor creates incidents or alerts. Failed calls are visible and never replaced
with scripted answers. A different case clears both outputs.

Publications/review declarations/bindings persist in git-ignored
`.local/skill-library/library.json`. `SKILL_LIBRARY_DIRECTORY` can override the
local storage directory (browser tests use an isolated directory).
The source/session/reviewer fields are operator declarations, not attested
recording provenance or enterprise identity. Only a single bounded UTF-8 Markdown
file is supported; no ZIPs, scripts, linked resources, new tool grants or hosted
Foundry attachment are executed. The bundled example stays explicitly synthetic
until a reviewed imported version is attached. See the
[Recorder walkthrough](docs/SKILL_RECORDER_FLOW.md).

```powershell
cd 'C:\Github Repo\skillforge-quality-agent'
npm install
npm run dev
```

Open **http://127.0.0.1:5173/?scoutTheme=dark** for the conference layout. One command
starts the TypeScript API on port 3001 and Vite on 5173. Stop both with Ctrl+C.
Alternatively press **F5** in VS Code and select **Quality Live Demo**; this is a
Node web application debug launch, not a Foundry Agent Inspector session.

Click **Run guided demo** to play through intake and evidence collection. It
always stops for explicit approval. Or use **Start investigation**, then **Next
conversation step** three times, then **Use reference image**.

## What works locally

- Side-by-side desktop workspace: a tall close-up avatar/voice column on the left
  and a roughly 70%-width investigation on the right, with a compact team strip
  above it. The board scroll area is tested at >=500 px on conference screens
  and >=400 px on laptops; smaller screens use natural page scrolling.
  Transcript and checklist remain available in an on-demand drawer.
- Guided and interactive mock modes with shared server-authoritative state.
- Opt-in live Foundry conversation: short replies, combined facts, corrections,
  and unverified-scope clarification without silently substituting demo records.
- Q-2048: 18 vehicles, Station 42, TC-4412 at 14:05, anomaly at 14:32, QI-1847.
- Parallel quality, production, maintenance and engineering tool tasks with
  streamed status, measured task durations, citations and a measurement chart.
- Image upload, signature/type/size checks, camera capture and local-only preview.
- Clearly advisory synthetic sample observations; arbitrary uploaded pixels are
  **not** claimed to have been analyzed in mock mode.
- Separately configured, consented Azure image analysis with relevance gating,
  visible verification checks and queued spoken recommendations before approval.
- File-backed, version-pinned Vehicle Quality Investigation skill and inspector.
- Approval-bound request creation: CA-1041, separately routed for engineer review.
- Q-3012 and Production Support Assistant reuse the same skill, with nozzle /
  coating evidence and CA-1042 instead of door-hinge evidence.
- Q-2049: Station 43 latch/striker alignment, 12 vehicles, fixture changeover
  SF-4308 at 11:05, closing-force anomaly at 11:24, QI-1926, request CA-1043.
- Q-2050: Station 58 tailgate gap, 9 vehicles, fixture insert replacement TF-5803
  at 15:55, gap anomaly at 16:18, QI-2013, request CA-1044.
- The **New synthetic case** selector starts a fresh case for guided rehearsals.
  Live conversation selects a known dataset server-side from the reported station
  during intake. Unknown stations and incompatible components/counts stay
  unverified; no reported facts are replaced to fit the catalog. Corrections before
  retrieval clear any prior photo; after retrieval starts, scope changes require
  a new investigation. Approval tokens and evidence never transfer between cases.
  Vehicle/plant/line are labelled dataset context unless explicitly reported.
  All four cases have separate reference imagery, measurements, history and tasks;
  chart violations use each measurement's explicit upper/lower limit.
- Optional Azure Speech-to-Text microphone input, with explicit browser recognition
  as an alternative; text input always works. Each microphone click captures one answer.
- Opt-in Azure MAI-Voice-2.1-Flash (Harper) speech output and Layla talking-head
  photo avatar (or explicitly configured Lisa video avatar), authenticated with
  Entra ID; no silent avatar or voice fallback.
- Rejection, cancellation, failed production retrieval/retry, absent historical
  matches, audit download, presenter cues and keyboard controls.

## Architecture and repository

```text
src/                   React UI, CSS theme, browser voice and API client
shared/                Typed domain contracts, checklist and synthetic scenarios
server/                Express API, SSE, workflow, skill registry and adapters
skills/
  vehicle-quality-investigation/SKILL.md
public/reference-images/ User-supplied component reference photographs
public/samples/        Archived original diagrams for older evidence records
tests/                 Unit, API integration, UI component and browser tests
docs/                  Architecture, presenter script and integration guidance
.vscode/               F5 local web-demo launch
Dockerfile             Multi-stage build and local container runtime
```

React + TypeScript + Vite + Tailwind CSS are used on the frontend; Node.js +
TypeScript + Express, Zod validation, REST and Server-Sent Events on the backend.
The Clawpilot theme supplies charcoal/warm-neutral surfaces; this demo's primary
accent uses its Microsoft-blue link token in both light and dark mode.
The composition no longer follows the reference insurance application's
three-column avatar/notebook/transcript layout. Charts, diagrams and
engineering content are original, and reference photographs are user-supplied;
there is no copied handwriting, branding or
source code. This is a design distinction, not legal certification.

See [architecture](docs/ARCHITECTURE.md) for state, interfaces and trust boundaries.

## Modes and configuration

**Guided demo:** deterministic presenter-driven or timed intake; never timed
approval. **Interactive mock:** type a symptom, the scenario station, and an
affected-vehicle count; upload an image or use the built-in reference image. Additional
chat is recorded as notes, not interpreted by an LLM. Only the two seeded scenarios
have production data. A reported count conflicting with the seed blocks a cause.

**Live conversation:** opt-in real Azure OpenAI reasoning within the existing
Foundry resource, with validated intake updates and brief spoken replies.
**Enterprise investigation mode:** disabled. Domain tools remain synthetic;
hosted Foundry agents and Voice Live remain disconnected.
See [connected speech setup](docs/CONNECTED_SPEECH.md) and
[connected-mode plan](docs/CONNECTED_MODE.md).

Optional configuration: copy `.env.example` to `.env`. Do not commit `.env`.

| Variable | Default / purpose |
|---|---|
| `USE_MOCK_SERVICES` | `true`; another value stops startup, never silently falls back |
| `PORT` | `3001`; changing it also requires changing the Vite proxy target |
| `HOST` | `127.0.0.1`; use `0.0.0.0` only for an intentional container/demo bind |
| `MAX_IMAGE_MB` | `8`; 1 byte through this inclusive maximum is allowed |
| `ENABLE_AZURE_SPEECH` | `false` unless explicitly enabled; billable Speech/Avatar opt-in |
| `AZURE_SPEECH_RESOURCE_ID` | Existing Foundry/Speech account ARM ID for Entra avatar authorization |
| `AZURE_AVATAR_CHARACTER`, `AZURE_AVATAR_STYLE` | `lisa` / `casual-sitting` by default; select `layla` / empty style for the `vasa-1` talking head |
| `AZURE_FOUNDRY_PROJECT_ENDPOINT` | Reserved project endpoint |
| `AZURE_FOUNDRY_AGENT_ID` | Reserved agent reference |
| `ENABLE_FOUNDRY_CONVERSATION` | `false`; opt-in billed conversation, never an implicit fallback |
| `ENABLE_FOUNDRY_VISION` | `false`; consented billed image inference using the conversation deployment; no mock fallback |
| `AZURE_FOUNDRY_MODEL_DEPLOYMENT` | Existing deployed structured-output conversation model |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_VERSION` | HTTPS Azure OpenAI endpoint and verified Chat Completions API version |
| `AZURE_SPEECH_REGION`, `AZURE_SPEECH_ENDPOINT` | Speech region and custom-domain endpoint |
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` | Reserved Entra identity configuration |

Selected-resource settings live only in ignored local `.env`, not committed
source. No Azure resources are created. When explicitly enabled, conversation,
speech synthesis and avatar sessions are billable against your existing resource.

## Microsoft integration points

`server/adapters.ts` defines Foundry agent, vision, Voice Live and speech output
interfaces. Hosted-agent/Voice Live stubs fail explicitly. `server/conversation.ts`
implements opt-in structured conversational intake and image inference with server-only Entra
authorization and no silent scripted fallback. `server/speech.ts`
implements MAI Flash synthesis, recognition authorization and avatar bootstrap with DefaultAzureCredential;
`src/azureSpeech.ts` uses the official Speech SDK for avatar WebRTC and SSML.
MAI voice availability is checked against the actual voice list. Speech access,
avatar video, and MAI Flash avatar speech were tested against the selected
Sweden Central resource. See the connected speech guide for opt-in and limitations.

Azure Speech-to-Text is the default input when Azure Speech is configured.
In Demo controls, allow Azure transcription, then click the microphone for each
answer, speak and pause. Audio streams to Azure; the final transcript fills the
investigation. Live conversation, when configured, understands that transcript;
otherwise the explicitly selected mock uses deterministic intake. Neither is Voice Live.
Azure input never silently falls back to browser recognition.
Browser recognition remains an explicit opt-in alternative and can fail in VS Code's
integrated browser. It is **not Voice Live or MAI speech**.
For hands-free intake, select Azure MAI output (connect the avatar if selected)
and click **Start conversation** once. Listening resumes after each spoken reply,
continues for photo/approval discussion in connected conversation, and ends on
Stop, reset, errors or disconnection. Use **Interrupt & speak** to cut a reply
short. Normal silence is informational and pauses capture after 60 seconds,
without automatic paid reconnection.
Only speak while the status says Listening. Manual one-answer capture remains available.
Spoken responses are muted by default. Unsupported browsers receive an explicit
message and can use text or guided playback. Barge-in cancels ongoing speech
when listening begins.

The default avatar is an abstract placeholder. In Demo controls, verify Azure
Speech access, select **Azure avatar + MAI Flash**, and explicitly connect the
configured standard avatar. Layla uses the photo-avatar `vasa-1` model; Lisa retains
the explicit `casual-sitting` option. No custom likeness, voice clone, or prerecorded human asset
is bundled. Disconnect after rehearsal to stop the billable session.

For a bounded recording session, click **Keep avatar on for 45 minutes
(billable)** in the assistant station. This explicitly enables avatar output
and reconnection in that tab, including reloads, until the original deadline.
Consent and connection count, but no credentials, are held in sessionStorage.
Three consecutive failed attempts or twelve total connections stop the mode.
**Stop recording mode**, disconnect, or changing output provider revokes it.
It does not capture microphone audio or restart hands-free listening.
Service idle/network limits can still interrupt the video; no uninterrupted
connection is promised. See the [ten-minute runbook](docs/DEMO_SCRIPT.md).

## Image analysis and privacy

JPEG, PNG and WebP files are checked for MIME type, signature and the configured
size threshold. Only name, type and size go to the mock API. Bytes remain in a
browser object URL and are revoked on removal, replacement, reset or unmount.
Camera tracks stop when the preview closes. Nothing is persisted to disk.

The reference images supplied for the demo are copied unchanged into
`public/reference-images`: hinge, paint and tailgate photo-style references plus
the supplied door-trim photograph. They are not vehicle-specific camera evidence.
Visible gauge readings in a reference image do not replace the synthetic
measurement records. Guided image annotations are explicitly dataset hypotheses,
not pixel analysis. Arbitrary uploads in guided mode produce an honest “not analyzed”
observation. Archived diagrams remain available for older immutable incidents;
their detail page distinguishes current reference imagery from original provenance.
With Azure vision configured and visible consent, the browser instead sends a
resized, metadata-stripped JPEG through the server to the selected model. Image
bytes are transient, not persisted by the app or included in state/SSE/audit/logs;
provider retention policies still apply. Unclear/unrelated results request a
better view without a seeded diagnosis. See the connected-mode guide.
Measurements, not photographs, underpin the synthetic cause hypothesis.

## Skill Recorder and SKILL.md

The [Microsoft Skill Recorder project](https://github.com/microsoft/skill-recorder)
records expert work and reconstructs intent plus ordered steps. Keep it separate
from this live-agent app. The truthful chain is:

1. Record the expert's workflow and optional narration.
2. Analyze and review reconstructed intent and steps.
3. Generate a draft SKILL.md.
4. Have the expert, quality owner and security/process owners review it.
5. Version and publish/import the approved skill through a verified platform path.
6. Attach it to authorized agents, then load it when relevant.

The bundled skill is a **synthetic reviewed export example**, not an actual
recorded expert session. The UI does not impersonate Skill Recorder or advertise
a one-click production integration. Procedure steps are read from the file;
version is metadata-pinned to 1.0.0. The typed orchestrator implements those
reviewed steps deterministically; it does not execute arbitrary Markdown code.

See [Skill Recorder workflow](docs/SKILL_RECORDER_FLOW.md).

## Human approval design

The server issues an approval request only after required evidence succeeds.
An explicit approval operation returns a random session-bound single-use token.
The action endpoint requires it. Forged, missing, cross-session, replayed and
concurrent tokens are rejected and audited. Saying “yes” in mock chat or advancing
the guided script **does not approve anything**.

This approval permits simulated request creation and routing only. Engineer
approval, calibration change, production holds and release remain separate.
The application always says: **“No production release has been authorized
automatically.”**

## Presenter walkthrough

1. Open the dark theme at 1920×1080; microphone optional, voice muted initially.
   The avatar/voice station sits beside the larger engineering board, with the
   team strip above the board. Open conversation & checklist provides input and progress.
2. Start Q-2048. Report the closing-force issue, Station 42, and 18 vehicles.
3. Upload an image or choose **Use reference image**.
4. Watch the skill badge activate and parallel tool workers retrieve evidence.
5. Explain 14:05 → 14:32 as correlation, not a proven cause.
6. Open **Incident**, review the request and click **Approve and create action**.
7. Show CA-1041 and the mandatory no-production-release statement.
8. **Only now** reveal the skill inspector / separately open Skill Recorder.
9. Explain expert capture → review → approval → versioned skill.
10. Click **Demonstrate skill reuse**, complete Q-3012, and approve separately.
11. Close with **Teach once. Scale everywhere.**

For additional reuse, select Station 43 or Station 58, or start a new live
investigation and report its station, component/symptom and affected count.
Use the built-in reference image for clearly labelled guided annotations, or upload
a matching image from `public/reference-images` for actual Azure analysis after consent.
Concrete openers and the separate Recorder preparation are in
[the demo script](docs/DEMO_SCRIPT.md) and [Recorder walkthrough](docs/SKILL_RECORDER_FLOW.md).

The full [7–10 minute script](docs/DEMO_SCRIPT.md) includes dialogue, narration,
expected changes, a failure rehearsal and offline backup.

Space advances the guided script; R resets; A approves a pending request; Escape
closes a drawer. Shortcuts are suppressed in editable fields and controls.

## Validation and production build

```powershell
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

`npm start` serves the built frontend and API from **http://127.0.0.1:3001**.
Run commands from the project root so the file-backed skill can be loaded.
Browser tests own their local servers; stop a manual dev server before running
them. The tests cover workflow transitions, evidence failure/retry, scope
conflicts, cancellation, skill reuse, approval enforcement, upload limits,
component accessibility and complete guided browser journeys.

## Screenshots

Browser tests generate fresh ready, approval and reuse screenshots in the ignored
`test-results` directory. These are placeholders for approved presentation
screenshots; no screenshots from the reference insurance demo are reused.

## Docker

```powershell
docker build -t quality-live-demo .
docker run --rm -p 3001:3001 quality-live-demo
```

Open http://127.0.0.1:3001/?scoutTheme=dark. Docker is optional; the primary
verified path is npm on the local machine.

## Security and known limitations

This is not a production or safety-certified quality system. Session state,
approvals, actions and audit are in memory, with a two-hour session lifetime.
Reset or restart discards synthetic records. Cookie-based local isolation is
not enterprise authentication; tabs sharing a cookie jar should not be used for
independent simultaneous sessions. No real systems are modified.

There is no Foundry-hosted agent, Voice Live, automated Skill Recorder import or
durable audit store. Conversation, image inference, MAI speech and a live
avatar are separately opt-in connected features, not connected factory systems. Background
workers are parallel tool tasks, not independently deployed agents. See
[security](docs/SECURITY.md) and [integration limitations](docs/CONNECTED_MODE.md)
before replacing mocks with real systems.

## Troubleshooting

| Problem | Resolution |
|---|---|
| API cannot connect | Run `npm run dev` from the root; confirm ports 3001 and 5173 are free |
| Port already occupied | Stop only your own demo process; do not terminate unrelated processes |
| Session expired / stream offline | Reload to start a new synthetic session |
| Production tool failed | Demo controls: disable failure, then restore/resume; no hypothesis is formed meanwhile |
| No historical match | Inspection-only request is allowed, with the absence disclosed |
| Wrong station / scope | Use the seeded station and count, or add a complete new typed scenario |
| Unsupported speech | Use transcript input / guided steps; enable consent before browser recognition |
| Camera permission denied | Use upload or the built-in reference image |
| Uploaded photo not interpreted | Expected in guided mode; reference annotations are dataset hypotheses, not pixel analysis |
| Connected mode missing | Expected; adapters must be implemented and verified, not just configured |
| Azure avatar / voice disabled | Enable Speech settings, verify developer identity, then Check Azure Speech access |
| Avatar connecting / failed | Check WebRTC/TURN network access, Speech permissions and quota; reconnect explicitly |
| Browser test runtime missing | Run `npx playwright install chromium` |

## Replacing fictional APIs

Implement the typed interfaces in `server/services.ts`, preserve evidence source
references, validate all responses, and propagate failures explicitly. Add
identity-based authorization, station-level access control, durable approval
transactions and idempotent actions. Keep create-request authorization distinct
from physical process changes. Evaluate calibrated language and missing-evidence
behavior before enabling any connected action. See the dedicated architecture
and connected-mode documents.
