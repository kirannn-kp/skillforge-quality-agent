import { expect, test } from '@playwright/test';
import { InvestigationEngine } from '../../server/engine';
import { scenarios } from '../../shared/scenarios';
import type { ConversationTurn } from '../../shared/conversation';

for (const id of ['Q-2049', 'Q-2050'] as const) {
  const s = scenarios[id];
  test(`guided ${s.station} uses independent sample, measurements, recommendation and approval`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Synthetic investigation dataset').selectOption(id);
    await expect(page.getByRole('heading', { name: new RegExp(id) })).toBeVisible();
    await page.getByRole('button', { name: 'Start investigation', exact: true }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next conversation step' }).click();
    await page.getByRole('button', { name: 'Use reference image', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Human approval required' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(s.probableCause, { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: `Provided reference image: ${s.component}` })).toHaveAttribute('src', s.sample);
    await expect(page.getByRole('img', { name: `Provided reference image: ${s.component}` })).toHaveJSProperty('complete', true);
    expect(await page.getByRole('img', { name: `Provided reference image: ${s.component}` }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(600);
    await page.getByRole('tab', { name: 'Evidence & correlation', exact: true }).click();
    await expect(page.locator('.dataset-context')).toContainText(`${id} / ${s.station}`);
    await expect(page.locator('.dataset-context')).toContainText('Evidence locked');
    await expect(page.getByRole('img', { name: new RegExp(s.measurements.observation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeAttached();
    await expect(page.locator('.chart')).toContainText(`${s.measurements.limit} ${s.measurements.unit} upper limit`);
    expect((await page.request.post('/api/action', { data: {} })).status()).toBe(403);
    await page.getByRole('tab', { name: 'Incident', exact: true }).click();
    await page.getByRole('button', { name: 'Approve and create action', exact: true }).click();
    await expect(page.getByRole('heading', { name: `${s.actionId} created` })).toBeVisible();
    await expect(page.getByText('No production release has been authorized automatically.', { exact: true })).toBeVisible();
    await page.getByLabel('Synthetic investigation dataset').selectOption('Q-2048');
    await expect(page.getByRole('heading', { name: /Quality Investigation Q-2048/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Probable cause' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: `${s.actionId} created` })).toHaveCount(0);
  });
  test(`live intake visibly selects ${s.station} from reported facts`, async ({ page }) => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await page.route('**/api/health', async route => {
      const response = await route.fetch();
      await route.fulfill({ json: { ...await response.json(), conversation: { configured: true, model: 'synthetic-browser-test' } } });
    });
    await page.route('**/api/conversation', async route => {
      const fields: ConversationTurn['fields'] = { issue: s.symptom, component: s.component, station: s.station,
        reportedCount: s.count, vehicle: null, plant: null, line: null };
      await engine.converse(route.request().postDataJSON().text, {
        status: () => ({ configured: true, model: 'synthetic-browser-test' }), prepare: async () => {},
        respond: async () => ({ fields, reply: 'Could you upload a photo of the component?' }),
      });
      await route.fulfill({ json: engine.snapshot() });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Open conversation & checklist/ }).click();
    await page.getByLabel('Operator message').fill(`${s.station}. ${s.count} vehicles. ${s.symptom}`);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByRole('log')).toContainText(`Selected synthetic dataset ${id} / ${s.station}`);
    await expect(page.getByRole('log')).toContainText('upload a photo');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Synthetic investigation dataset')).toHaveValue(id);
    await page.getByRole('tab', { name: 'Evidence & correlation', exact: true }).click();
    await expect(page.locator('.dataset-context')).toContainText(s.station);
    await expect(page.getByRole('region', { name: 'Live investigation board' })).toContainText(s.component);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(engine.state.approval).toBeUndefined();
  });
}
