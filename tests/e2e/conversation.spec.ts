import { expect, test } from '@playwright/test';
import { InvestigationEngine } from '../../server/engine';
import type { ConversationTurn } from '../../shared/conversation';

const empty: ConversationTurn['fields'] = {
  issue: null, component: null, station: null, reportedCount: null, vehicle: null, plant: null, line: null,
};
test('live conversation handles greetings, combined facts, unsupported stations and corrections without form errors', async ({ page }) => {
  const engine = new InvestigationEngine('Q-2048', undefined, 0);
  const turns: ConversationTurn[] = [
    { fields: empty, reply: 'Your message came through. What have you observed?' },
    { fields: { ...empty, issue: 'High door closing force', component: 'Front-left door', station: 'Station 99', reportedCount: 18 },
      reply: 'I recorded Station 99. Could you clarify the station?' },
    { fields: { ...empty, issue: 'High door closing force', component: 'Front-left door', station: 'Station 42', reportedCount: 18 },
      reply: 'Got it. Could you upload a photo of the door?' },
  ];
  let calls = 0, scriptedInputs = 0;
  await page.route('**/api/health', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), conversation: { configured: true, model: 'synthetic-browser-test' } } });
  });
  await page.route('**/api/input', route => { scriptedInputs++; return route.fulfill({ status: 500, json: { error: 'Unexpected scripted fallback.' } }); });
  await page.route('**/api/conversation', async route => {
    await engine.converse(route.request().postDataJSON().text, {
      status: () => ({ configured: true, model: 'synthetic-browser-test' }),
      prepare: async () => {}, respond: async () => turns[calls++],
    });
    await route.fulfill({ json: engine.snapshot() });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Live conversation', exact: true })).toHaveClass('selected');
  await page.getByRole('button', { name: /Open conversation & checklist/ }).click();
  for (const [index, text] of ['Can you hear me?', 'Station 99, eighteen vehicles, stiff front-left door.', 'Actually, Station 42.'].entries()) {
    await page.getByLabel('Operator message').fill(text);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByRole('log')).toContainText(index === 0 ? 'Your message came through' : index === 1 ? 'unverified' : 'upload a photo');
    await expect(page.getByRole('alert')).toHaveCount(0);
    if (index === 0) expect(engine.state.fields.issue).toBeUndefined();
    if (index === 1) expect(engine.state.fields.station).toBe('Station 99');
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.assistant-response')).toContainText('upload a photo');
  await expect(page.getByRole('region', { name: 'Live investigation board' })).toContainText('Station 42');
  expect(engine.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
  expect(engine.state.fields.reportedCount).toBe(18);
  expect(engine.state.approval).toBeUndefined();
  expect(scriptedInputs).toBe(0);
  expect(calls).toBe(3);
});

test('connected model failure is visible and does not silently switch to scripted intake', async ({ page }) => {
  let scriptedInputs = 0;
  await page.route('**/api/health', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), conversation: { configured: true, model: 'synthetic-browser-test' } } });
  });
  await page.route('**/api/conversation', route => route.fulfill({ status: 502, json: { error: 'Foundry unavailable. No mock fallback was used.' } }));
  await page.route('**/api/input', route => { scriptedInputs++; return route.continue(); });
  await page.goto('/');
  await page.getByRole('button', { name: /Open conversation & checklist/ }).click();
  await page.getByLabel('Operator message').fill('The door is difficult to close.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No mock fallback');
  expect(scriptedInputs).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Guided demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guided demo', exact: true })).toHaveClass('selected');
});
