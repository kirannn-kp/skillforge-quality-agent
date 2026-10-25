# Ten-minute demo / show the problem, add the skill, investigate

Use the first 20 minutes of the presentation for Foundry concepts and the last
10 minutes for this recording. Record and rehearse the demo separately rather
than trying to capture a new three-minute expert session and analyze it live.

## What this demo actually demonstrates

- A threshold replay finds 18 exceptions in 1,000 persisted synthetic vehicle
  measurements. It does not inspect 1,000 photographs or monitor a live factory.
- The configured Foundry model produces real baseline and expert-guided
  briefings. The read-only comparison does not run the operational workflow.
- The desktop Skill Recorder capture/export is real and was prepared earlier.
  The app-compatible file is a disclosed adaptation, not the untouched export.
- Publication and agent binding are durable and local. This is not a hosted
  Foundry Agent Service skill deployment.
- Real Azure avatar, MAI speech and optional vision are connected separately.
  All domain records are synthetic; image observations remain advisory.
- A server-bound approval creates a local incident, local station-dashboard
  alert and evidence snapshot. No factory delivery, hold, release or calibration
  change is performed.

## Preflight / before pressing Record

1. Use the production server on port 3001, or replace the port with 5173 during
   Vite development. Use a fresh browser window, dark theme, 1920x1080 if possible,
   and a readable browser zoom. Hide unrelated tabs, notifications and private
   material. Do not record credentials, terminal environment values or real data.
2. Open five tabs in this order:
   - **1 / Live agent:** `http://127.0.0.1:3001/?scoutTheme=dark`
   - **2 / Control tower:** `http://127.0.0.1:3001/?workspace=quality&scoutTheme=dark`
   - **3 / Comparison:** `http://127.0.0.1:3001/?workspace=skills&view=comparison&scoutTheme=dark`
   - **4 / Skill Studio:** `http://127.0.0.1:3001/?workspace=skills&scoutTheme=dark`
   - **5 / Station 42:** `http://127.0.0.1:3001/?workspace=quality&station=Station%2042&scoutTheme=dark`
3. In tab 1, use **New investigation** if your rehearsal case is active. Verify
   idle state and the existing reviewed publication attached to Quality Live
   Agent. Do not detach it for this recording, and do not reset a case waiting
   for someone else's approval.
4. Click **Keep avatar on for 45 minutes (billable)** once in tab 1. Wait for
   **Azure avatar - Live** and actual moving video. It enables speech output
   and bounded reconnection in that tab, including reloads. It does not open
   the microphone. Other browsers/tabs require their own explicit consent.
5. Keep only tab 1 avatar-connected. For voice input, open **Demo controls**,
   select Azure Speech-to-Text, acknowledge microphone consent and close the
   drawer. For predictable recording, use the one-answer **Microphone** button.
   Speak only while it says Listening. Test your screen recorder's system-audio
   capture and your narration microphone before the actual take.
6. Reuse the completed Recorder session and existing reviewed file:
   `C:\Users\kiranpanchal\Downloads\investigate-manufacturing-quality-deviation\SKILL.demo-reviewed.md`.
   Do not capture or analyze another recording. Briefly show the completed
   session, then import this same file into Skill Studio during the take.
7. Read the file and publication acknowledgements before capture. Check the
   library for an unused publication version, such as `1.2.0-demo` if available.
   Reimporting unchanged content does not mean a new method was learned.
   For this adapted copy, choose **Manually supplied guidance / test fixture**,
   not untouched Recorder export. Use reviewer label `Demo Quality Engineer`
   and reference `Application-compatible adaptation of earlier Recorder export`.
   Publish the reviewed version and attach it on screen before opening a case.
8. Refresh the control tower and station dashboard. After approved cleanup they
   should have no rehearsal incidents/alerts and should offer DEMO-00427.
   A normal **New investigation** does not delete persisted incidents or alerts.
9. Set the comparison to Station 42 and ensure both output cards are clear.
   Each Generate click is an explicit billable model request. Keep tab 3 open
   while comparing so its baseline remains available. The baseline omits expert
   guidance for that read-only request; it does not detach the active agent's
   skill or remove the operational workflow's safeguards.

## Timed recording / exact clicks and narration

### 0:00-0:45 / Start with the problem

**Show:** tab 2, control tower: 1,000 records, 18 flagged measurements, leading
vehicle DEMO-00427 and Station 42.

**Say:** "This is where I start my day as a quality engineer. I can see the
vehicles and their quality readings in one place. We are using sample data here.

Station 42 has 18 readings outside the limit for front-left door closing force.
Let us look at this vehicle, DEMO-00427. I can see there is a problem, but I
still need to understand why it happened."

### 0:45-1:30 / First, ask without the expert instructions

**Click:** tab 3, select Station 42 and **Generate baseline briefing**.

**Say:** "First, let us ask the model about this case without our engineer's
instructions. It has the records, so it can already give us some useful advice.
Keep this answer in mind. We will compare it after adding the skill."

Let the response appear and read one actual sentence. Do not describe a good
baseline check as absent. Keep this tab open.

### 1:30-3:30 / Show the Recorder, import the file and attach it

**Show:** the completed desktop Skill Recorder session for 15-20 seconds.
Do not start a new capture or run Analyze again.

**Say:** "An experienced engineer has already recorded how they investigate
this kind of issue. We are using that recording, not doing it again.

From that session, we prepared these step-by-step instructions and reviewed
a copy for this demo. Let me add that file."

**Click:** tab 4, **1 / Import & review**, choose `SKILL.demo-reviewed.md`.
Show the instruction preview. This uploads guidance, not executable code.

**Say:** "Here are the instructions: check how many vehicles are affected,
compare the readings, look at maintenance and past cases, and be clear about
what still needs checking."

Enter the prepared unused **Publication version**, **Reviewer label**, source
and reference from preflight. Check the four acknowledgements only after
reviewing them, then click **Approve & publish reviewed version**.

**Say:** "I have reviewed the file. I will save this version, then choose which
agent should use it."

Under **2 / Attach a published version**, select **Quality Live Agent**, select
the newly published version, then click **Attach reviewed version to agent**.
Wait for the successful attachment notice.

**Say:** "I select Quality Live Agent and attach the skill. Now a new
investigation can use these instructions. I have not changed the model."

Do not detach the old binding or claim an operational no-skill run occurred.
The baseline comparison independently omits guidance. The attachment is local,
not a hosted Agent Service deployment.

### 3:30-4:30 / Compare the two answers

**Click:** return to the same comparison tab, **Refresh attached guidance**,
then **Generate expert skill briefing**. Preserve the baseline already generated.

**Say before generating:** "Let us ask the same question again, this time with
the skill. Same model, same records, same question. We have only added the
engineer's instructions."

**Show:** paired actual responses and matched model/question/evidence hash.
Expand **Inspect expert receipt** for the actual skill version/hash.

Highlight only differences actually present: chronology, historical references,
image limitations, unconfirmed hypotheses or verification checks. The baseline
can already reason and may include good checks; do not manufacture a bad baseline
or describe this single pair as a performance benchmark.

Point to two actual differences and describe them in plain language, for example
"Here it separates what we know from what we still need to check", only if true.

**Say:** "We can check which skill version this answer used. The skill helps
bring the engineer's approach into the answer. It does not give the agent
permission to take action on its own."

This is a read-only briefing comparison, not different tool-execution engines.

### 4:30-5:00 / Open the investigation

**Click:** tab 2, **Open investigation** for DEMO-00427. It prepares the selected
detection and navigates that tab to the agent. Switch to tab 1, the existing
avatar-connected agent. The shared session receives the same case updates.
Do not connect a second avatar in the redirected tab.

**Say:** "Now let us go back to the vehicle and open the investigation.
The agent already has the case details, so I do not need to repeat them.
I can just ask what it found."

### 5:00-6:00 / Talk to the agent

Wait for the board to populate. Start the one-answer microphone, wait for
Listening, then ask:

"Can you tell me what you found in this investigation?"

Let the avatar finish. Do not narrate over its response. Its exact wording is
generated, not a fixed script.

**Show:** Investigation: selected vehicle, Station 42, affected scope, supplied
reference photo and hypothesis.

**Say:** "While we talk, I can see the findings here: the vehicle, the station,
how many vehicles are affected, and what might be causing the problem."

### 6:00-7:00 / Look at the evidence

**Click:** Evidence & correlation.

**Say:** "The limit is 50 newtons, and the readings go above it from 14:32.
There was a calibration event at 14:05, and a past case gives us something
useful to compare against.

That does not prove calibration caused the issue. It gives the engineer
something to check. This picture is a reference image, not a confirmed diagnosis.

Now I want to save the findings and let Station 42 know."

This timed route does not run a new vision inference. Actual image uploads
belong to the separate operator-led intake/photo flow after explicit image
consent, not to an already-prepared incident proposal.

Briefly show Incident, but do not approve an old prompt. Explicitly ask for
the handoff next, and respond only to its fresh confirmation prompt.

### 7:00-8:15 / Create the incident, with approval

**Ask:** "Can you create an incident, alert Station 42 and save these findings?"

Review the pending proposal. Wait for the current confirmation prompt.
Start the microphone only after that prompt is armed, then say:
"Yes, create the incident and send the alert."

The incident request now gives a short "Shall I go ahead?" confirmation and
opens the Incident tab instead of repeating the investigation. Natural variants
such as "Yes, please create the incident and send the alert" are also accepted
only for a fresh, matching proposal. Stale or expired confirmation is rejected
visibly and replaced with a short new prompt; listen to it and start a fresh
microphone turn before answering. Qualified approvals or requests for production
changes do not authorize the incident.

Alternatively use the incident approval button. A bare yes in an unrelated or
stale conversation does not authorize anything.

**Show:** the Incident tab changes from pending approval to the committed
incident identifier and clickable details link.

**Say:** "It asked me before taking action. Now the incident is saved and the
alert is on the station dashboard. It has not changed any machine settings
or released any vehicles."

Use the actual new identifier. The rehearsal cleanup preserved numbering, so do
not promise INC-1001 or reuse a deleted ID.

### 8:15-9:00 / Open the incident and station alert

**Click:** the incident details link. Show the vehicle, measurements, chronology,
recommended checks, skill provenance and approval context.

**Click:** return to the original agent and use **View Station 42 alert dashboard**,
or refresh the already-open Station 42 tab. Show the linked alert. Newly opened
detail tabs can shift browser tab positions; identify the destination rather
than relying on its original tab number.

**Say:** "Here is the incident. I can open it and see what was found, the
supporting records and the suggested checks. Station 42 also has a linked
alert on this demo dashboard, so the team can find the same details."

### 9:00-9:45 / Keep the conversation going

**Click:** return to the original avatar-connected agent tab. Start the
microphone, wait for Listening, then ask:

"What should I check next?"

Let the avatar answer. Its response should be read-only advice grounded in
the existing evidence, not a claim that checks or production changes occurred.
Do not prescribe an exact generated answer or talk over it.

Alternative questions for rehearsal or extra time, one at a time:

- "What makes you think that?"
- "What are we still unsure about?"
- "Could this be related to the calibration?"
- "Have we seen something like this before?"
- "Can you tell me your investigation?" This also reports the existing incident
  and invites the next investigation; it does not create another incident.

A different station or vehicle requires **New investigation** and selection
of that case. Asking a question alone does not switch scope, launch fresh
cross-system retrieval or authorize another incident.

### 9:45-10:00 / Close

**Say:** "We spotted an issue, added the engineer's skill, checked the findings
and created an incident with approval. The agent helps with the work, and the
engineer stays in control."

Finish on the incident details or paired comparison, then stop screen recording.
Return to tab 1 and click **Stop recording mode** and **Stop conversation** if
listening is active. Muting alone does not stop billable avatar video.

## Recovery and rehearsal variants

- **Avatar interruption:** recording mode retries within its limits. Keep the
  correct tab open, watch the visible status and manually restart microphone
  listening after recovery. After three failed attempts, resolve the visible
  error and explicitly start a new window. Do not substitute a fake live feed.
- **Model comparison failure:** retry explicitly if time allows. Otherwise
  disclose that the live comparison failed and show the reviewed procedure.
  Never substitute a prerecorded answer without labelling it.
- **Voice input failure:** use typed text in conversation & checklist. Do not
  silently switch to browser recognition. Unmute MAI output separately.
- **Conflicting scope or unsupported station:** disclose missing/unverified
  evidence; do not force a matching dataset. Another case requires explicit reset.
- **Reject approval:** demonstrate that no incident or alert is created. Reopen
  a proposal explicitly; never override the rejection automatically.
- **Production-tool failure:** demonstrate no confirmed cause or action, then
  restore the tool through the explicit failure-recovery controls.
- **Repeat take:** reset the session with New investigation. Persisted incidents
  need separate, explicitly approved, backed-up cleanup; reset is not deletion.
- **Other datasets:** Station 58 uses a 4.5 mm upper limit and TF-5803/QI-2013.
  Paint Booth 7 uses a 90 micrometer lower limit and NM-901/QI-1772; attach the
  reviewed publication separately to Production Support Assistant for that agent.
