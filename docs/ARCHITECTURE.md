# Architecture

## Runtime

Browser React UI → same-origin REST commands → TypeScript investigation engine →
mock domain tools. Server-Sent Events stream complete typed snapshots back to the
UI after each mutation. Photo previews stay in the browser. With separate
configuration and image consent, resized/re-encoded image bytes pass transiently
through the local server to Azure; state/SSE/audit never include those bytes.
Unconfigured vision remains an explicitly labelled metadata-only mock. With explicit consent,
microphone audio streams directly from the Speech SDK to Azure; only final
transcripts reach the local investigation. Optional Azure Speech receives
synthetic assistant text and returns speech/avatar media. Shared
contracts live in `shared/domain.ts`; scenario data in `shared/scenarios.ts`.
With explicit configuration, `/api/conversation` sends synthetic transcript,
current facts, evidence and local skill steps to the existing Foundry model.
`shared/conversation.ts` validates a bounded reply and allowlisted intake fields;
only the server decides transitions and enforces seeded-evidence/approval guards.

The shared catalog contains four synthetic cases (Stations 42, 43, 58 and Paint
Booth 7). While intake/photo collection is open, an unambiguous reported station
selects its dataset server-side and recreates the case-specific tool adapter;
selection is visible in the dataset selector, board, transcript and audit.
Unknown/ambiguous stations are not routed, and component/count conflicts block
retrieval without replacing operator facts. Scope corrections clear pre-retrieval
photo observations. Once image analysis/retrieval starts, chat cannot switch the
case or transfer evidence/approval. An explicit new-case reset creates a new
correlation ID and approval service. Operator-reported context is kept separate
from displayed vehicle/plant/line seed context in model prompts.

The server, not a frontend flag, owns the approval boundary. Tools define access
and operations. The skill defines the reviewed investigation procedure.

## Domain

- Investigation: scenario, correlation ID, phase, intake fields, evidence,
  transcript, workers, active skill/version/current step, approval and action.
- Evidence: observation, source, timestamp, type and synthetic reference.
- Visual analysis: region, advisory observation, limitations, next checks,
  relevance, actual model provenance and measured request duration.
- Approval: immutable request ID and status, with token kept off stream/audit.
- Action: request ID, inspection tasks, engineer-review status and a literal
  `productionReleaseAuthorized: false`.
- Audit: agent, skill/version, tool, summarized inputs/outputs, approval, source,
  category, result and correlation ID.

## Proactive vehicle monitoring and incident persistence

The separate `workspace=quality` control tower checks 1,000 deterministic
synthetic vehicle measurements persisted in SQLite. Eighteen Station 42 records
exceed 50 N. This is actual threshold evaluation over the records, not AI image
processing, prediction or continuous camera surveillance. DEMO-00427 is the
lead detection; its associated image is a supplied illustrative reference, not
per-vehicle camera footage. Vehicle search and pagination read the database.

Explicit synthetic replay opens an idle investigation from canonical stored
detection data, pins its reviewed guidance and runs the existing parallel
record retrieval/correlation. It cannot overwrite an open case or accept
arbitrary client-supplied measurements. This record-led branch does not require
a vision result to draft an inspection incident and does not mark the visual
check complete. The normal photo/consent/relevance flow is unchanged.

The proposal explicitly covers synthetic-demo incident creation, local station
notification and incident-evidence persistence. The existing session-bound,
single-use approval token is validated before writes. A synchronous transaction
inserts both immutable incident snapshot and linked station alert; only after
commit is the token consumed and a success receipt exposed. Failed writes roll
back both records and retain approval for explicit retry. Unique correlation
and detection/vehicle keys prevent duplicate incidents/alerts. No production
control authorization is granted.

Live dialogue adds a human-confirmation path for this mock scope only. A
server-owned findings/proposal message arms a two-minute request/prompt nonce.
The browser captures that context at microphone startup, not at final
transcription, so an older recording cannot approve a newly streamed proposal.
The conversation route accepts a small explicit yes/no vocabulary only when
session, request, latest prompt and expiry match. The server—not model
output—decides and consumes approval through the same action/transaction path.
Other dialogue invalidates the challenge; invalid confirmations are audited
and rejected. Failed conversational writes create a new pending proposal,
rather than losing an inaccessible token or reporting success. The persisted
approval/audit identifies button versus conversational human confirmation.

A findings request from idle/empty intake opens the first unresolved synthetic
vehicle detection; existing reported facts are never replaced. After an
incident, live conversation remains open for read-only evidence questions and
invites the next investigation. It never silently resets scope, re-approves or
duplicates a record. Authoritative summaries/confirmations do not call a model;
open-ended follow-ups still use the configured model and surface its failures.

The Station 42 display polls persisted alerts every two seconds, even when
opened after publication. Publication is not acknowledgement or external
factory delivery. Stable incident URLs retrieve evidence, primary vehicle
measurement, related IDs, recommendations, skill provenance and approval/audit
after restart. Production explicitly opens `.local/quality-demo.sqlite`
(`INCIDENT_DATABASE_PATH` override); startup errors never switch to memory.
Test app factories explicitly support isolated in-memory databases.

## State transitions

```text
IDLE → INTAKE → COLLECTING_VISUAL_EVIDENCE → ANALYZING_VISUAL_EVIDENCE
     → LOADING_SKILL → RETRIEVING_EVIDENCE → CORRELATING_EVIDENCE
     → WAITING_FOR_APPROVAL → CREATING_ACTION → COMPLETE
```

Retrieval tasks run in parallel. Each reports Working / Complete / Failed and
actual elapsed time. Production failure enters FAILED without a cause or
proposal. Retry runs incomplete tasks only. Conflicting reported scope blocks
recommendations. No historical match is disclosed and limits the proposal to
engineer-led inspection.
Connected photo failures return to photo collection and surface an error for
explicit re-upload. Unclear/unrelated images also return to collection, with
advisory guidance but no seeded retrieval, hypothesis or approval.

Rejection enters REJECTED; reopening creates a new request ID. Cancellation aborts
pending latency/retrieval and prevents stale work from mutating reset state.
Request creation is locked before awaiting preparation so concurrent requests
cannot duplicate writes. Reset/cancel cannot interrupt an already-creating action.

## Skill

The local registry reads the Markdown file, validates 14 numbered procedure
steps and the pinned metadata version. It supports listing, loading and
attachment. A registry instance survives scenario reset so both authorized
fictional agents can reuse the same procedure. It is not a remote Foundry
toolbox registry and does not execute arbitrary prose as code.

The bundled registry remains the 14-stage synthetic fallback selected explicitly
when no local publication is bound. Skill Studio adds reviewed **guidance**, not
an arbitrary workflow executor: UTF-8 Markdown/YAML is bounded and parsed,
staged per session with a 30-minute lifetime, then published only after exact-hash
review and explicit consents. A later import supersedes that session's draft.
Immutable publications and agent bindings are atomically saved under
`.local/skill-library`; malformed or altered stored content fails explicitly.
Version labels and reviewer/Recorder references are local operator declarations,
not signed attestations.

Each investigation captures the two authorized agents' bound procedures when
starting/resetting. Before-evidence station/agent corrections use those captured
versions, not later bindings. The original reviewed body/name/version/hash enters
the actual conversation request; the fixed evidence/action policy takes priority.
Skill-load audit records identify the exact pinned content. Newly attached
versions update idle sessions only and never rewrite active evidence or approvals.
No declared shell tools, scripts, linked resources or extra permissions execute.

The separate browser workspace uses the same cookie/session without replacing
the avatar tab's investigation. `POST /api/session` supports explicit reuse;
opening another tab does not silently create a replacement session. The expert
record views expose the synthetic catalog for manual inspection and narration,
without invoking conversation, vision, action or autonomous investigation tools.
Microsoft's real Recorder runs separately as an Electron desktop application.

## Interfaces

QualityIssueTool, ProductionDataTool, MaintenanceTool, EngineeringKnowledgeTool,
CorrectiveActionTool, ApprovalService, SkillRegistry and VisionService separate
domain work. Explicit disconnected Foundry/vision/Voice Live adapters throw
rather than simulating connected success. Azure Speech output and standard-avatar
bootstrap use a separate opt-in adapter with Entra authentication. The independent
AzureConversationService implements conversational reasoning and opt-in advisory
image inference over one cached, strict-output model transport, not enterprise tools
or a hosted-agent deployment. Guided mode remains explicitly deterministic.

BrowserVoiceService supplies optional recognition, interim/final text, speech,
mute and interruption. MockVoiceService has no cloud dependency.
PlaceholderAvatarRenderer and VideoAvatarRenderer separate interface presentation
from speech/reasoning. AzureSpeechOutput adds official Speech SDK real-time WebRTC
and SSML output. Missing voice, synthesis failure and disconnect are surfaced;
the provider never silently switches to browser speech.
AzureSpeechInput adds bounded-turn SDK continuous recognition with explicit consent,
partial captions, bounded listening, cancellation and microphone-track cleanup.
Input and output providers are independent; MAI Flash is output, not transcription.
Explicit hands-free mode sequences completed MAI replies and first-final-phrase
Azure input. Separate input/playback status prevents mute or output-stop events
from misrepresenting the microphone lifecycle. Recognition teardown completes
before the next stream starts. Connected conversation also listens while waiting
for photos, tools and approval; drawers, replies and submitted photo briefings pause input.
Photo findings and recommendations have dedicated speech text and a serial
message queue so final approval prompts cannot overwrite explanations. Background replies
do not interrupt active input. An explicit interrupt control stops output first.
Silence/no-match stays on the existing connection, bounded to 60 seconds; genuine
errors and disconnection stop the loop rather than retrying indefinitely.
Speech and model authorization are reused transiently before expiry to avoid
repeating slow developer authentication for each answer. Model request durations
are reported separately from audio/playback latency.

## API

| Endpoint | Behavior |
|---|---|
| GET health | Mock status, disabled integration reason, image size limit |
| POST session | Create isolated synthetic state with HttpOnly same-site cookie |
| GET state / events | Snapshot / SSE live activity |
| GET skill | Pinned local skill and procedure |
| POST speech/recognition-session | Consent-gated, session-authenticated transient Azure recognition authorization |
| POST start / advance / input | Structured deterministic intake and guided steps |
| POST conversation | Real opt-in model reply, validated intake, scope checks; no approval capability |
| POST photo | Metadata only; no pixel upload in mock mode |
| POST photo/analyze | Opt-in consented Azure JPEG inference; relevance gates seeded retrieval and proposals |
| POST settings | Controlled failure, no-match and latency/speed options |
| POST approval | Explicit decision on current pending request |
| POST action | Single-use approved token required |
| POST cancel / reset | Cancel pending investigation / clear synthetic state |

## Deliberate tradeoffs

Node TypeScript avoids a second language runtime for a conference app and shares
contracts with React. SSE is sufficient for status snapshots; a verified real
voice transport may need a separate media/WebSocket channel. In-memory records
are deliberate demo scope, not durable production governance. A selected Azure
project is not provisioned or modified.

UI uses generic automotive engineering branding with Clawpilot theme tokens and
a Microsoft-blue primary accent derived from the existing link token.
Keyboard-accessible Investigation, Evidence & correlation and Incident tabs
separate the briefing/photo, sources/charts and approved action. Workflow
transitions follow the briefing and creation stage without stealing manual
selection on ordinary SSE updates; extra checks use progressive disclosure.
The supplied reference photographs are not vehicle-specific evidence. Guided
annotations explicitly identify dataset hypotheses rather than pixel analysis.
Historical incident schemas still accept original diagram paths/notes, and
immutable snapshots are not rewritten. A transactional SQLite sequence generates
readable new incident IDs, preserving old IDs and links across upgrades.
The desktop composition places a tall portrait avatar/voice station on the left
and a roughly 70%-width investigation on the right. A compact six-tool activity
strip sits above the board, not above the entire workspace. Compact document
headers preserve at least 500 px of board scroll space at 1920x1080 and 400 px
on tested laptop sizes. Small screens stack and use natural page scrolling.
Transcript/checklist remain an accessible modal drawer. Session status and
explicit connection controls stay visible on the station. Layla photo-avatar
sessions explicitly carry the `vasa-1` base model to the SDK; Lisa video-avatar
sessions omit it. Neither configuration is an automatic fallback for the other.
