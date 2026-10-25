# Connected conversation, synthetic investigation

The optional conversational layer uses a real existing Azure OpenAI deployment
in the selected Foundry resource. It is **not** a deployed hosted Foundry agent
or a Voice Live session. Domain records, parallel tool tasks
and corrective-action routing remain synthetic. Photo inference is separately opt-in. `USE_MOCK_SERVICES=true` is
still required; setting it to false fails rather than substituting services.

## Setup

Use an existing deployed model supporting Chat Completions and strict structured
outputs, with Cognitive Services data-plane access for the developer identity.
No resource keys, new deployments or infrastructure are required.

Configure ignored local `.env`, then build/restart:

```dotenv
USE_MOCK_SERVICES=true
ENABLE_FOUNDRY_CONVERSATION=true
ENABLE_FOUNDRY_VISION=true
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_FOUNDRY_MODEL_DEPLOYMENT=YOUR-EXISTING-DEPLOYMENT
AZURE_OPENAI_API_VERSION=2025-01-01-preview
```

The selected existing `gpt-4.1-mini` deployment was verified for this demo.
Model calls are billable. Server-side DefaultAzureCredential and Azure's
bearer-token provider keep authorization in memory and out of the browser.
Startup prepares authorization so the first operator turn does not wait for
developer authentication. Configuration/authentication failures are explicit.
Only synthetic transcripts and context may be used.

## Consented photo analysis

`ENABLE_FOUNDRY_VISION=true` reuses the configured conversation deployment and
cached server authorization; the deployment must support image inputs and
strict structured outputs. The browser additionally requires **Allow Azure image
analysis** in Demo controls. Consent is not persisted across refreshes.

Upload or camera capture decodes and resizes the image to at most 1280 pixels
on its long edge, re-encodes JPEG without original metadata, and bounds encoded
content to 1 MB. `/api/photo/analyze` requires the local session, same-origin
JSON, explicit consent, bounded original metadata and canonical JPEG base64 with
signature checks. Its route-specific JSON limit is 2 MB; other commands stay
bounded to 32 KB. The model decodes the image. URLs are not accepted.
Application state, SSE, audit and logs contain metadata/observations, never image
bytes. Bytes are transient in the request/model call, not stored by this app;
Azure provider retention policies still apply.

The model sees the image and reported component/symptom, **not** the scripted
visual finding or expected root cause. Returned observations, limitations,
non-invasive verification checks and relevance are strictly validated. Image text
is treated as untrusted evidence. An unclear/unrelated image asks for a better
view and does not retrieve seeded records or propose an action. Analysis failure
is visible and requires an explicit re-upload; it never substitutes mock vision.
The built-in **Use synthetic sample** remains an explicitly scripted illustration,
not a claim of connected inference.

The board distinguishes Azure observations from the hypothesis based on synthetic
measurements and maintenance records. It shows photo checks and engineer-led
next steps. The avatar queues the photo observation and recommendation in order,
including the unconfirmed hypothesis, verification checks and approval boundary,
instead of replacing them with a generic or approval-only reply. Submitting a
photo pauses idle microphone capture through this briefing; follow-up input then
resumes. Muted responses are not replayed later; Stop conversation mutes queued
responses, and explicit interruption discards already-queued narration.

## Conversation behavior

When configured, **Live conversation** is selected initially. Typed and spoken
answers both use `POST /api/conversation`. **Guided demo** explicitly switches
back to the deterministic `/api/input` path; errors never switch it automatically.
Azure input/output consent and avatar connection remain separate controls.

- Greetings and microphone checks do not become defect descriptions.
- One answer can populate issue, component, station and count together.
- Facts may arrive out of order. Explicit corrections replace earlier intake;
  retracted/unknown facts are cleared.
- Short replies ask one missing question instead of repeating confirmed details.
- Unsupported stations, components and counts are retained as unverified,
  with conversational clarification instead of HTTP validation errors.
- Seeded evidence is not retrieved until the reported scope matches the selected
  scenario. The model cannot silently substitute seed values for an operator report.
- After intake, conversation can explain progress or approval, but cannot edit
  retrieved evidence, grant approval or execute actions.
- Only the allowlisted intake fields can be updated. Strict JSON/Zod validation,
  a per-investigation turn lock and cancellation/reset guards reject malformed
  or stale responses before they can mutate fields.

The local reviewed synthetic skill's steps are supplied as procedural context.
This is not a claim of remote Foundry Skill/Toolbox attachment or real Skill
Recorder provenance.

## Voice pacing and timing

See [connected speech](CONNECTED_SPEECH.md) for provider consent and setup.
**Start conversation** opens turn-taking once; normal photo/approval questions
can still be discussed. The microphone pauses during replies and open drawers.
Evidence tasks can continue while the microphone is listening, except during a
submitted photo briefing. New background
replies wait for the active input turn rather than cutting off the operator.
**Interrupt & speak** explicitly stops the current reply and resumes listening.
This is not automatic acoustic barge-in or full-duplex speech.

Recognition uses continuous SDK recognition within one bounded turn and stops
at the first final phrase, with 900 ms segmentation silence to allow natural sentence pauses. An initial no-match
continues the existing connection instead of ending the conversation or creating
a paid reconnection loop. After 60 seconds without a completed answer, capture
pauses with an informational message and requires an explicit restart.
Permission, network and service failures still stop capture visibly.

The between-turn settling delay is 120 ms. Speech authorization is reused only
in memory and refreshed before expiry. Both Speech server authorization and the
conversation bearer provider avoid repeated developer CLI authentication.
The UI shows the most recent model request duration, **not** an audio latency
claim. The first audio sample also depends on recognition, the network, MAI
synthesis and avatar transport; there is no subsecond end-to-end guarantee.

## Rehearse

1. “Hi, can you hear me?” → acknowledge, no issue recorded.
2. “Several vehicles need high force to close the front-left door.
   Station forty-two, eighteen vehicles.” → fill the facts together; ask for photo.
3. Try Station 99, then correct it to 42 → no red validation error or fabricated data.
4. Allow Azure image analysis, then upload an illustrative component image.
   Hear the actual advisory observation, followed by the synthetic-record
   hypothesis and engineer-led checks. Try an unrelated view: no diagnosis/action
   should be proposed until a relevant image is supplied.
5. “Why is that the likely cause?” → explain available evidence as a hypothesis.
6. “Go ahead.” → explain the explicit approval control; no action is executed.
7. Click the actual approval button to create and route the synthetic request.

Offline unit/API/React/browser tests use synthetic model responses and spend no
model quota. Connected calls were separately exercised for greetings, combined
facts and corrections. Synthetic microphone testing is not proof of every
physical microphone or of production engineering accuracy.

Before the four-case expansion, a connected browser rehearsal used actual Azure STT, the conversation model,
MAI Flash replies and Lisa video together: a greeting, a two-sentence report
(18 vehicles, Station 43), and a correction to Station 42. The board reached
photo collection, input resumed after the photo question, and there were no
alerts or closed-audio-context warnings. Model durations in that run were
1.8, 1.9 and 2.1 seconds, excluding recognition and playback.
The 900 ms speech boundary was chosen after a shorter boundary cut a
multi-sentence answer off early. Ambiguous number transcription may still need
clarification; it is not silently corrected to the seed.

Connected image rehearsal used actual resized image uploads and the existing
`gpt-4.1-mini` deployment: a synthetic coffee-mug drawing was classified unrelated
(4.2 s), with no cause or approval; the illustrative hinge image was classified
relevant (3.5 s), explicitly described as an illustration rather than a defect.
These are observed model-request times, not guarantees or audio-start timings.
The actual outgoing avatar SSML was checked for separate photo and recommendation
messages using the exact MAI Flash voice, including engineering checks and the
request-only approval boundary. Lisa video remained live without alerts.
Only synthetic illustrations were tested; this is not validation of real-defect
detection or engineering accuracy.

### Four-case catalog rehearsal

After adding Station 43 and Station 58, actual `gpt-4.1-mini` calls were exercised
against the running connected backend, not synthetic model responses:

| Report | Server-selected case | Conversation request | Image request |
|---|---|---|---|
| Station forty-three, 12 vehicles, front-left latch catching | Q-2049 | 2.7 s | 3.7 s |
| Station fifty-eight, 9 vehicles, wide tailgate gap | Q-2050 | 1.1 s | 3.0 s |

Both uploaded synthetic diagrams were explicitly identified as illustrations,
classified relevant and returned two advisory checks. Each case retrieved its own
maintenance event (SF-4308 / TF-5803) and reached a pending approval, with no action
executed. Station ninety-nine stayed unverified with no evidence or proposal.
These are observed model-request times, not end-to-end voice latency guarantees.
This rehearsal used text and actual image pixels; it does not re-certify physical
microphone capture or engineering accuracy.

After restarting the demo with the expanded backend, the visible page was
restored to a fresh Q-2048 investigation with all four datasets selectable,
actual Layla video at 512x512, exact MAI-Voice-2.1-Flash configuration,
Azure input/image consent and spoken responses enabled, microphone off, no
alerts, and a 707 px board scroll region at the restored viewport.

## Still not connected

Hosted Foundry agents, enterprise production/maintenance systems,
durable identity-bound approvals and Voice Live remain unimplemented.
No release, hold or calibration change is automated.

## Reference

The conversational interaction was informed by the public
[insurance live-agent example](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/voice_ai_agents/insurance_claim_live_agent_team).
Its Gemini Live transport and avatar are not used here. The UI and implementation
remain original, with the existing Azure services and automotive workflow.
