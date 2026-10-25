# Azure avatar and MAI-Voice-2.1-Flash

The investigation tools stay synthetic. Optional
[Foundry conversation](CONNECTED_MODE.md) replaces rigid intake separately. The **experience layer**
can now use Azure Speech-to-Text input, real MAI speech output and a real-time standard avatar without
enabling Foundry reasoning, vision, or Voice Live.

## Existing resource setup

Use a Foundry/Speech S0 resource in a supported region, with a custom-domain
endpoint and Speech data-plane access for the signed-in developer identity.
No resource keys are used. Server-side DefaultAzureCredential can use your Azure
CLI identity or managed identity. Do not paste access tokens into configuration.

Configure ignored local `.env`:

```dotenv
USE_MOCK_SERVICES=true
ENABLE_AZURE_SPEECH=true
AZURE_SPEECH_ENDPOINT=https://YOUR-RESOURCE.cognitiveservices.azure.com
AZURE_SPEECH_REGION=swedencentral
AZURE_SPEECH_RESOURCE_ID=/subscriptions/YOUR-SUBSCRIPTION/resourceGroups/YOUR-GROUP/providers/Microsoft.CognitiveServices/accounts/YOUR-RESOURCE
AZURE_AVATAR_CHARACTER=layla
AZURE_AVATAR_STYLE=
```

Layla is a standard talking-head **photo avatar**, not a Lisa video-avatar style.
The server explicitly identifies `photoAvatarBaseModel=vasa-1` in the shared
capability/session contracts; the SDK sets this before starting the avatar.
Keep the style empty for Layla. `lisa` with `casual-sitting` remains supported
when explicitly selected in configuration; incompatible character/style pairs
fail instead of silently choosing a different avatar. The exact MAI voice remains
unchanged. Availability is established by actual connection and speech, not
merely by voice-list/relay verification.

The desktop layout gives the portrait avatar its own tall left column and uses
an uncropped, contained video with padding around the head and clearance below
the status caption, rather than a face-filling cover crop. The right-hand investigation has a compact
team strip and a much taller board viewport. At smaller widths the workspace
stacks and the investigation uses page scrolling instead of a small nested pane.
See [standard avatars](https://learn.microsoft.com/azure/ai-services/speech-service/text-to-speech-avatar/standard-avatars)
and [photo-avatar setup](https://learn.microsoft.com/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar).

Default example settings keep Azure disabled; offline mode still works without
credentials. Restart after modifying configuration.

## Use in the UI

1. Open **Demo controls**.
2. Click **Check Azure Speech access**. The server checks that the exact
   `en-US-Harper:MAI-Voice-2.1-Flash` voice is listed and verifies avatar relay access.
3. Select **Azure MAI-Voice-2.1-Flash** for audio only, or **Azure avatar + MAI Flash**.
4. For the avatar, click **Connect Azure avatar (billable)**.
5. “Live” is shown only after real video starts playing.
6. Click **Test MAI Flash voice (billable)** or enable spoken responses and start
   the investigation. Synthetic assistant text is sent to Azure.
7. Disconnect the avatar after the demonstration. Muting does not disconnect
   the idle, potentially billable video session.

The assistant station also has visible **Connect avatar (billable)** and
**Disconnect live avatar** buttons after the avatar provider is selected.
“Disconnected” is not a configuration failure: no paid media session is running.
Without recording mode, reloading does not automatically connect or unmute.
Configure the provider first, then explicitly start the media session and enable
spoken responses.

### Bounded recording mode

Click **Keep avatar on for 45 minutes (billable)** in the assistant station to
enable avatar output and consent to automatic avatar connections in that tab.
The original deadline and connection count survive same-tab reloads in
sessionStorage; no authorization or relay credentials are stored there.
The mode makes at most twelve total connection attempts, with backoff and a
three-consecutive-failure limit. It stops at the original deadline, on
**Stop recording mode**, on disconnect, or when changing the output provider.
It neither opens the microphone nor restarts hands-free capture after an error.
Separate tabs/browsers require their own explicit consent. Keep just one
avatar-connected agent tab for a screen recording.

Azure may still end idle sessions and network interruptions may cause a visible
reconnection gap. This mode does not fake a live avatar, send silent keepalive
speech, change voices, or promise uninterrupted video. Stop it when finished,
even if the assistant is muted or the tab is in the background.

Browser speech is a separate, explicit output choice. Cloud failures never
automatically select it. Microphone input defaults to Azure Speech-to-Text when
the resource is configured; browser recognition remains an explicit alternative.
In **Demo controls**, select **Azure Speech-to-Text (billable)** under Microphone
input and enable **Allow Azure Speech-to-Text (microphone audio sent to Azure)**.
Click the microphone for each answer, speak, then pause. One utterance is
transcribed, submitted to the existing synthetic intake and the microphone is
released. Start it again for the next answer. Stopping during connection or
recognition discards late results. Listening is bounded to 60 seconds after the
connection starts. Silence/no-match keeps the same connection listening; inactivity
then pauses politely rather than throwing a recognition error. Permission and
connection failures remain explicit, with no browser fallback.
This speech transport is **not Voice Live**.
Starting the microphone interrupts the active
output. Calibration, holds, production release and approvals remain unchanged.

### Hands-free conversation

With Azure microphone consent and Azure MAI output selected (and a live avatar
if selected), click **Start conversation** once. It starts the investigation,
enables spoken responses and automatically listens after each completed reply.
Speak only while the visible status says **Listening**. The microphone is
paused during replies and open drawers. Mock mode also pauses for photo/tool/
approval work. Connected conversation can discuss these stages while waiting,
and background replies wait rather than cut off an active operator turn.
It resumes between questions without another click. **Interrupt & speak** stops
an active reply and resumes listening; automatic acoustic barge-in is not implemented.
**Stop conversation** ends automatic listening and interrupts the reply.
Reset, cancellation, recognition/playback errors, muted output, provider changes,
SSE/avatar disconnect and investigation end stop hands-free mode. There are no
automatic microphone error retries. Avatar reconnection is separately available
only during explicitly enabled, bounded recording mode.
The one-answer **Microphone** button remains available when hands-free is off.

## Implementation

- Audio-only SSML synthesis uses the verified custom-domain Speech REST endpoint,
  Entra bearer authentication, the exact Harper Flash voice and MP3 output.
- The browser requests only assistant message IDs or a fixed audition phrase;
  server-owned transcript text is selected and XML-escaped before synthesis.
- Avatar uses the official `microsoft-cognitiveservices-speech-sdk` package,
  `AvatarSynthesizer`, explicit Layla/vasa-1 or Lisa/casual-sitting configuration,
  WebRTC and `speakSsmlAsync` with the same explicit MAI voice. No other avatar
  or voice is silently selected.
- Server-provided Entra authorization and TURN credentials are transient,
  session-authenticated, no-store responses, never audit/SSE/config content.
  Browser-held authorization is required by direct SDK media transport; it is
  not a resource key. Do not expose this local token delegation endpoint publicly.
- The connection ends before token expiry or after at most 25 minutes. Azure
  may also end idle sessions after five minutes. Automatic paid reconnection is
  disabled unless bounded recording mode was explicitly enabled. Reset stops
  speech; it does not disconnect an idle avatar.
- Playback, network, missing voice, permission and quota errors are visible.

Layla was separately verified against the existing Sweden Central resource:
real 512x512 talking-head video reached Live, and the exact MAI Flash audition
SSML completed without alerts. The framing keeps the full source image visible
with breathing room; the status caption sits above, not over the face. This is
a standard Microsoft avatar, not a custom likeness or cloned voice.
- Speech-to-Text uses the official SDK `SpeechRecognizer`, the resource's custom
  domain endpoint and Entra TokenCredential support. The SDK resolves the
  recognition WebSocket route; no legacy recognition route is hardcoded. A fresh
  `POST /api/speech/recognition-session` requires the local session, same origin,
  explicit consent and the existing Speech rate guard. Authorization is held
  only in memory, with no application logging or local storage.
  The client limits use to five minutes or token expiry minus one minute and
  refreshes before that limit; valid authorization is reused between answers.
  The server also reuses its transient access token until refresh/expiry approaches.
- Continuous SDK recognition uses 900 ms segmentation silence and stops after
  the first final phrase in a turn. The between-turn settling delay is 120 ms.
  No-match does not reconnect; genuine network/service failures stop the loop.
- Microphone audio streams directly to Azure, not this app's backend. The final
  transcript is sent to the local investigation; interim text is display-only.
  Only synthetic test speech should be used. The app does not record audio files.

## Verified and limits

The selected Sweden Central S0 Foundry resource successfully returned the exact
Flash voice, synthesized a short synthetic phrase, issued relay configuration,
and played a 1920×1080 real-time avatar stream. MAI Flash avatar SSML was also
exercised. This is verification for that resource/session, not a guarantee for
all tenants or regions. Automated offline tests mock Speech rather than spend
cloud quota.

Azure Speech-to-Text was separately verified with synthetic WAV utterances for
the issue, station and affected count. A browser using a synthetic microphone
stream sent one utterance through the actual Azure SDK and service, updated the
component field and advanced to the station question without errors. Spoken
number words such as "forty-two" and "eighteen" are accepted by the deterministic
intake, without granting approval or interpreting arbitrary instructions.
The hands-free browser path was also exercised against real Azure services:
one Start conversation action produced three automatic microphone turns,
recognized the issue, Station 42 and 18 vehicles, and paused at photo collection.
MAI replies completed between turns, with no recognition alerts or closed-audio-
context warnings. The test used synthetic microphone WAV input, not a person's
recorded speech, and did not approve any action.

MAI voices are public preview. The avatar SDK API is marked experimental.
Real-time media requires WebRTC/TURN access (UDP 3478 or TCP 443 as documented).
Cloud usage is billable, and generated text is processed by Azure. Neither a
successful voice list nor a relay token alone is reported as working video.

## Official references

- [MAI voice names, SSML and regions](https://learn.microsoft.com/azure/ai-services/speech-service/mai-voices)
- [Real-time avatar synthesis](https://learn.microsoft.com/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar)
- [Microsoft Entra Speech authentication](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-configure-azure-ad-auth)
- [Speech REST authentication and voice list](https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech)
