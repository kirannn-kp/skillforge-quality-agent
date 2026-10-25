import { expect, test } from '@playwright/test';

test('board tabs support keyboard navigation, safe space presses, blue tokens and mobile layout', async ({ page }) => {
  for (const theme of ['dark', 'light']) {
    await page.goto(`/?scoutTheme=${theme}`);
    const investigation = page.getByRole('tab', { name: 'Investigation', exact: true });
    await expect(investigation).toHaveAttribute('aria-selected', 'true');
    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [style.getPropertyValue('--cp-accent').trim(), style.getPropertyValue('--cp-link').trim()];
    });
    expect(colors[0]).toBe(colors[1]);
    await investigation.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Evidence & correlation', exact: true })).toBeFocused();
    await expect(page.getByRole('tabpanel', { name: 'Evidence & correlation', exact: true })).toBeVisible();
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Incident', exact: true })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { name: 'Nothing has been created' })).toBeVisible();
    expect((await (await page.request.get('/api/state')).json()).phase).toBe('IDLE');
    await page.keyboard.press('ArrowRight');
    await expect(investigation).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Incident', exact: true })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(investigation).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['Investigation', 'Evidence & correlation', 'Incident']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('findings show the provided image; evidence stays selected through updates; approved creation opens Incident', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start investigation', exact: true }).click();
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Next conversation step' }).click();
  await page.getByRole('button', { name: 'Use reference image', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Human approval required' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('tab', { name: 'Investigation', exact: true })).toHaveAttribute('aria-selected', 'true');
  const image = page.getByRole('img', { name: 'Provided reference image: Front-left door and upper hinge' });
  await expect(image).toHaveAttribute('src', '/reference-images/door-hinge.png');
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1152);
  await expect(page.getByRole('heading', { name: 'Probable cause' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve and create action', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Evidence & correlation', exact: true }).click();
  await expect(page.locator('.evidence-timeline')).toContainText('VISUAL EVIDENCE');
  await expect(page.locator('.chart')).toBeVisible();
  await page.request.post('/api/settings', { data: { failProduction: false } });
  await expect(page.getByRole('tab', { name: 'Evidence & correlation', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Incident', exact: true }).click();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Proposal declined' })).toBeVisible();
  expect((await (await page.request.get('/api/state')).json()).action).toBeUndefined();
  await page.getByRole('button', { name: 'Reopen proposal', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Investigation', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
  await page.getByRole('button', { name: 'Approve and create action', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Incident', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'CA-1041 created' })).toBeVisible();
  await page.getByRole('button', { name: 'Demonstrate skill reuse' }).click();
  await expect(page.getByRole('tab', { name: 'Investigation', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Probable cause' })).toHaveCount(0);
});
