import { expect, test } from '@playwright/test';
import { comparisonQuestion, type SkillLibrary } from '../../shared/skills';
import { manualGuidanceFixture } from '../fixtures/skillGuidance';

test('briefing comparison shows actual paired receipts, resets on dataset change and never invokes actions', async ({ page }) => {
  await page.goto('/?workspace=skills&view=comparison&scoutTheme=dark');
  await expect(page.getByRole('heading', { name: 'Same model. Same evidence. Different guidance.' })).toBeVisible();
  const before = (await (await page.request.get('/api/state')).json());
  const incidents = (await (await page.request.get('/api/incidents')).json());
  const priorLibrary: SkillLibrary = await (await page.request.get('/api/skills')).json();
  const priorPublication = priorLibrary.publications.find(item => item.id === priorLibrary.bindings['Quality Live Agent']);
  const draft = (await (await page.request.post('/api/skills/import', {
    data: { sourceFile: 'SKILL.md', content: manualGuidanceFixture },
  })).json());
  const publication = (await (await page.request.post('/api/skills/publish', { data: {
    draftId: draft.id, sha256: draft.sha256, version: `1.0.${Date.now()}-browser`, reviewedBy: 'Synthetic comparison reviewer',
    source: 'manual-guidance', recordingReference: '', reviewed: true, syntheticOnly: true, understandLimits: true, allowModelContext: true,
  } })).json());
  try {
  await page.request.post('/api/skills/attach', { data: { agent: 'Quality Live Agent', publicationId: publication.id, sha256: publication.sha256, confirm: true } });
  await page.getByRole('button', { name: 'Refresh attached guidance', exact: true }).click();
  await expect(page.getByText(`${publication.name} / v${publication.version}`, { exact: true })).toBeVisible();
  const requests: string[] = [];
  await page.route('**/api/skills/briefing', async route => {
    const input = route.request().postDataJSON();
    requests.push(input.mode);
    if (input.mode === 'expert') expect(input.expectedSkillHash).toBe(publication.sha256);
    else expect(input.expectedSkillHash).toBeUndefined();
    await route.fulfill({ json: {
      scenarioId: input.scenarioId, mode: input.mode, question: comparisonQuestion,
      contextSha256: 'a'.repeat(64), model: 'synthetic-browser-fixture', durationMs: 10,
      briefing: input.mode === 'baseline' ? 'Synthetic baseline fixture.' : 'Synthetic expert fixture; verify before concluding.',
      ...(input.mode === 'expert' ? { skill: { name: publication.name, version: publication.version, sha256: publication.sha256 } } : {}),
    } });
  });
  const expert = page.getByRole('button', { name: 'Generate expert skill briefing', exact: true });
  await expect(expert).toBeDisabled();
  await page.getByRole('button', { name: 'Generate baseline briefing', exact: true }).click();
  await expect(page.getByLabel('Baseline briefing')).toContainText('Synthetic baseline fixture.');
  await expert.click();
  await expect(page.getByRole('status')).toContainText('Matched model, question and evidence hash');
  await expect(page.getByLabel('Expert skill briefing')).toContainText('Synthetic expert fixture');
  await page.getByText('Inspect expert receipt', { exact: true }).click();
  await expect(page.getByLabel('Expert skill briefing')).toContainText(publication.sha256);
  expect(requests).toEqual(['baseline', 'expert']);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByLabel('Comparison dataset').selectOption('Q-2049');
  await expect(page.getByText('Synthetic baseline fixture.', { exact: true })).toHaveCount(0);
  await expect(expert).toBeDisabled();
  expect((await (await page.request.get('/api/state')).json()).correlationId).toBe(before.correlationId);
  expect((await (await page.request.get('/api/incidents')).json())).toEqual(incidents);
  } finally {
    if (priorPublication) {
      await page.request.post('/api/skills/attach', { data: {
        agent: 'Quality Live Agent', publicationId: priorPublication.id, sha256: priorPublication.sha256, confirm: true,
      } });
    } else await page.request.post('/api/skills/detach', { data: { agent: 'Quality Live Agent', confirm: true } });
  }
});

test('recording mode is opt-in, caps failed connections, never opens the microphone and stops saved consent', async ({ page }) => {
  let avatarCalls = 0, microphoneCalls = 0;
  await page.route('**/api/health', async route => {
    const response = await route.fetch();
    const health = await response.json();
    await route.fulfill({ json: { ...health, speech: { ...health.speech, configured: true, verified: true, avatarRelayAvailable: true } } });
  });
  await page.route('**/api/speech/avatar-session', async route => {
    avatarCalls++;
    await route.fulfill({ status: 503, json: { error: 'Synthetic browser fixture: avatar service deliberately unavailable.' } });
  });
  await page.route('**/api/speech/recognition-session', route => { microphoneCalls++; return route.abort(); });
  await page.goto('/?scoutTheme=dark');
  const enable = page.getByRole('button', { name: 'Keep avatar on for 45 minutes (billable)', exact: true });
  await expect(enable).toBeVisible();
  expect(avatarCalls).toBe(0);
  await enable.click();
  await expect(page.getByRole('button', { name: 'Stop recording mode', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('retry limit reached', { timeout: 20000 });
  expect(avatarCalls).toBe(3);
  expect(microphoneCalls).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem('quality-avatar-recording'))).toBeNull();
  await expect(page.getByRole('button', { name: 'Start microphone', exact: true })).toBeVisible();
  await enable.click();
  await page.getByRole('button', { name: 'Stop recording mode', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('quality-avatar-recording'))).toBeNull();
});
