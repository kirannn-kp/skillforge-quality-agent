import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { InvestigationEngine } from '../../server/engine';

test('consented resized image upload, visible recommendations and unrelated-image re-upload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const engine = new InvestigationEngine('Q-2048', undefined, 0);
  for (let i = 0; i < 4; i++) await engine.advance();
  let calls = 0;
  await page.route('**/api/health', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), vision: { configured: true, model: 'synthetic-browser-test' } } });
  });
  await page.route('**/api/photo/analyze', async route => {
    calls++;
    const input = route.request().postDataJSON();
    expect(input.consent).toBe(true);
    expect(input.dataUrl).toMatch(/^data:image\/jpeg;base64,\/9j\//);
    const bytes = Buffer.from(input.dataUrl.split(',')[1], 'base64');
    expect(bytes.length).toBeLessThanOrEqual(1024 * 1024);
    await engine.collectPhoto({ name: input.name, size: input.size, type: input.type, sample: false }, {
      image: { consent: true, dataUrl: input.dataUrl }, service: { analyze: async () => ({
        relevance: calls === 1 ? 'unrelated' : 'relevant', source: 'azure-model', model: 'synthetic-browser-test', durationMs: 25,
        summary: calls === 1 ? 'This example does not show the requested component.' : 'Door hinge visible; no defect is established.',
        observations: [{ region: 'Example image', observation: calls === 1 ? 'Wrong component shown.' : 'Hinge attachment points visible.',
          classification: 'requires_validation', limitations: 'An image cannot establish calibration or dimensional tolerance.' }],
        recommendedNextChecks: [calls === 1 ? 'Upload a clear view of the affected hinge.' : 'Ask an engineer to measure hinge alignment.'],
      }) },
    });
    await route.fulfill({ json: engine.snapshot() });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start investigation', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next conversation step' }).click();
  const file = resolve('public', 'samples', 'door-hinge.png');
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('Allow Azure image analysis');
  expect(calls).toBe(0);
  await page.getByRole('checkbox', { name: 'Allow Azure image analysis (demo image sent to Azure)' }).check();
  await page.getByRole('button', { name: 'Close drawer' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('tabpanel', { name: 'Investigation', exact: true }).getByText('Wrong component shown.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Probable cause' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Human approval required' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('heading', { name: 'Human approval required' })).toBeVisible();
  await page.getByText('Image limitations & suggested checks', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Suggested photo checks' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recommended next step' })).toBeVisible();
  await expect(page.getByText('Ask an engineer to measure hinge alignment.', { exact: true })).toBeVisible();
  await expect(page.locator('.visual-copy')).toContainText('Azure synthetic-browser-test');
  expect(calls).toBe(2);
  expect(errors).toEqual([]);
});
