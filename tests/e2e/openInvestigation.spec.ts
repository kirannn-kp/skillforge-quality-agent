import { expect, test } from '@playwright/test';

test('Open current investigation navigates to the agent without overwriting another active case', async ({ page }) => {
  await page.goto('/?scoutTheme=light');
  await page.getByLabel('Synthetic investigation dataset').selectOption('Q-3012');
  await page.getByRole('button', { name: 'Start investigation', exact: true }).click();
  const before = await (await page.request.get('/api/state')).json();
  let investigations = 0;
  page.on('request', request => { if (request.url().endsWith('/api/detections/investigate')) investigations++; });
  await page.goto('/?workspace=quality&scoutTheme=light');
  await page.getByRole('button', { name: 'Open current investigation', exact: true }).click();
  await expect(page).toHaveURL('/?scoutTheme=light');
  await expect(page.getByRole('heading', { name: /Quality Investigation Q-3012/ })).toBeVisible();
  const after = await (await page.request.get('/api/state')).json();
  expect(after.correlationId).toBe(before.correlationId);
  expect(after.phase).toBe(before.phase);
  expect(after.fields).toEqual(before.fields);
  expect(after.action).toBeUndefined();
  expect(investigations).toBe(0);
});

test('an investigation failure stays visible on the control tower without navigating or creating records', async ({ page }) => {
  await page.goto('/?workspace=quality&scoutTheme=dark');
  await expect(page.getByRole('button', { name: 'Open investigation', exact: true })).toBeEnabled();
  const response = await page.request.get('/api/incidents');
  expect(response.ok()).toBe(true);
  const before = await response.json();
  await page.route('**/api/detections/investigate', route => route.fulfill({
    status: 503, json: { error: 'Synthetic investigation service unavailable. No incident was created.' },
  }));
  await page.getByRole('button', { name: 'Open investigation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic investigation service unavailable');
  await expect(page).toHaveURL('/?workspace=quality&scoutTheme=dark');
  await expect(page.getByRole('button', { name: 'Open investigation', exact: true })).toBeEnabled();
  expect(await (await page.request.get('/api/incidents')).json()).toEqual(before);
});
