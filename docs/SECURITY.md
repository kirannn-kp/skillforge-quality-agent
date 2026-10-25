# Demo security and privacy boundaries

This app is a synthetic local demo, not a production security architecture,
safety certification or automated manufacturing control system.

## Implemented

- Loopback binding by default; same-origin JSON control requests.
- HttpOnly, SameSite=Strict per-browser session cookie with two-hour lifetime.
- Strict scenario/command schemas and bounded text/JSON payloads.
- Skill import accepts a single UTF-8 Markdown file up to 24 KB with bounded,
  duplicate-key/tag-checked YAML and limited aliases. Previews render as plain
  text; no HTML, commands, resource URLs or declared tool permissions execute.
  Drafts are session-owned, expire after 30 minutes and are superseded by a new
  import. Publication requires the exact content hash and explicit review,
  synthetic-only, fixed-workflow and model-context consents on the server.
- Published versions are immutable through the API; local review declarations and
  bindings persist in git-ignored `.local/skill-library`. Stored original content,
  derived guidance and hash are checked on startup; corruption is not replaced
  silently by the bundled example. Existing investigations keep pinned versions
  through later attachments/detachments. Local library changes are not enterprise
  RBAC or tamper-evident approval; no verified Recorder attestation is claimed.
- Photo byte limits and file signature validation in the browser; metadata
  validation on the server. Consented Azure uploads are decoded, resized and
  re-encoded by the browser, with bounded canonical JPEG base64/signature checks
  on the server. The model decodes the JPEG. URLs are not accepted. Images are
  transient during the request/model call, never in SSE, state, audit or app
  storage. No photos/audio are persisted by the app; Azure retention policies apply.
- Single-use, session-bound approval tokens, omitted from SSE and audit summaries.
- Mock incident conversational approval additionally requires exact current
  request/prompt IDs, a two-minute expiry and a narrow affirmative vocabulary.
  Microphone capture freezes that context before recognition, preventing stale
  audio from being rebound to another proposal. LLM output, quoted/qualified
  yes text and unrelated dialogue cannot authorize writes. Missing, stale or
  expired confirmation is denied/audited and refreshed for a new human response.
  Button approval remains available; normal corrective actions cannot be
  approved by conversational yes. No verified speaker/engineer identity is claimed.
- Workflow locking before asynchronous action preparation.
- Missing/forged/replayed/cross-session approvals denied and audited.
- Approval only for request creation/routing; productionReleaseAuthorized is false.
- Proactive incident approval explicitly covers mock incident creation, local
  station-dashboard publication and incident-evidence persistence. All three
  are gated server-side. Incident and alert rows commit atomically; storage
  failure rolls both back, retains approval for explicit retry and never claims
  a notification was sent. Unique correlation and detection/vehicle keys prevent
  duplicate records. Tokens never enter the persisted snapshot.
- Measured evidence required before proposing a cause; conflicts and failures
  disclosed, hypotheses distinguished from observations.
- Optional recognition requires provider-specific consent. Azure input streams
  microphone audio directly to Azure; browser recognition may send it to the
  browser vendor. Changing providers clears consent. Speech output is muted initially.
- Structured API error logs without credentials or approval tokens.
- Opt-in Foundry conversation sends synthetic transcript/context to the configured
  existing model. Strict structured responses can update only intake fields,
  never approval/action/evidence objects. Concurrent and stale turns are guarded.
  Model authorization stays on the server; model failures never select mocks.
- Separately configured image inference requires explicit per-page consent
  and a local session. Only illustrative/synthetic images are allowed for rehearsal.
  Unclear/unrelated results cannot advance to a seeded diagnosis or action.
  Image text is untrusted model input; observations remain advisory, not certified
  engineering measurements. Photo errors require explicit re-upload, not retries
  or mock substitution.
- Azure Speech is separately opt-in and uses Entra authentication. SSML synthesis
  accepts only assistant message IDs or a fixed synthetic audition phrase.
- Recognition and avatar bootstrap return transient authorization (and avatar TURN credentials) to the
  session-authenticated browser for direct SDK transport; not to SSE, logs,
  local storage or committed files. No resource keys are exposed.

## Demo limits

Ordinary investigation state and audit are in memory and mutable. Reset, expiry
or restart loses them. Approved proactive incident evidence, recommendations,
vehicle references, skill provenance and approval/audit snapshots persist in
local SQLite, together with mock station alerts. No image/audio bytes persist.
Use synthetic inputs only. The database has no encryption, enterprise identity,
retention policy or tamper-evident audit. All local demo sessions can read the
shared incident/station history; this is not per-engineer or station RBAC.
Stable links are identifiers, not authorization tokens. Alert publication is
to the local mock dashboard only, not proof of station receipt/acknowledgement.
Skill publications and review declarations persist locally and may contain
user-supplied text: use synthetic files only. Attaching reviewed guidance consents
to sending its body to the configured Azure conversation model when invoked.
This is not a guarantee that natural-language guidance is safe; review generated
instructions before publishing. Server controls still enforce action boundaries.
Recorder is a separate application with its own capture/retention and Copilot
analysis behavior; review its policies before recording, and close unrelated
windows or information. This app neither initiates capture nor handles its sign-in.
Session isolation is not user identity or RBAC. Shared browser tabs share a
cookie jar. Local HTTP has no TLS; do not expose it as a public enterprise service.
There are no remote manufacturing writes and no real plant data. Tool tasks are deterministic.
Enabled speech sends synthetic assistant text to Azure and creates billable
speech/video sessions. Enabled Azure transcription also sends microphone audio
directly to Azure while listening. Recognition is single-utterance and bounded
to 60 seconds per turn, with transient in-memory authorization reuse before
expiry and explicit stop. No-match is informational within that same connection.
Hands-free mode requires a separate explicit Start conversation action. It
never listens over spoken replies, pauses for open drawers, and stops on errors, reset,
disconnection or explicit Stop. It never reconnects paid sessions after errors.
Connected conversation may discuss evidence/approval while waiting. Model output
never authorizes actions; only the server-bound explicit human confirmation
described above can approve the mock incident scope. After a committed mock
incident, hands-free can continue for read-only follow-ups. An unrelated yes
cannot create another incident or authorize manufacturing changes. The explicit
interrupt control stops the reply before listening.
Conversation startup prepares a cached server-side bearer provider; no credentials
or recordings are persisted by this application.
Do not expose the local credential-delegation endpoint
on a public host; it has only demo cookie isolation, not enterprise user identity.
Metadata, operator notes and filenames can still contain user-supplied material:
use only synthetic inputs and avoid people/confidential information in photos.

## Before any connected use

Add Entra authentication, authorized operator identity, station/action RBAC,
CSRF protection suitable for the deployment, TLS, rate limiting, durable
tamper-evident audit, retention policy, session cleanup, transactional approval
and idempotency keys. Bind approval to the reviewed payload and actor, not merely
a session. Never allow an LLM to grant itself approval or bypass the action
service. Verify and redact downstream payloads and logs.

Separate approval scopes for corrective-request creation, profile changes,
holds, release and issue closure. Implement engineering policy outside model
instructions. Test prompt-injection resistance, missing evidence, identity,
revocation and conflicting measurements. Do not connect physical process
controls without appropriate quality/safety review.
