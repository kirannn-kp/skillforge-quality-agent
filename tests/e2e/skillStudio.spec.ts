import { expect, test } from '@playwright/test';
import { manualGuidanceFixture } from '../fixtures/skillGuidance';

test('real file review, durable publication and second-tab attachment reach the actual agent without resetting its case', async ({ page, context }) => {
  const version = `1.1.${Date.now()}-browser`;
  await page.goto('/?scoutTheme=dark');
  await expect(page.getByRole('region', { name: 'Live investigation board' })).toBeVisible();
  const first = await page.request.get('/api/state');
  expect(first.status()).toBe(200);
  const correlationId = (await first.json()).correlationId;
  const studio = await context.newPage();
  await studio.goto('/?workspace=skills&scoutTheme=dark');
  await expect(studio.getByRole('heading', { name: /Bring the expert/ })).toBeVisible();
  expect((await (await page.request.get('/api/state')).json()).correlationId).toBe(correlationId);
  const input = studio.getByLabel('Exported Markdown skill');
  await input.setInputFiles({ name: 'bad.md', mimeType: 'text/markdown', buffer: Buffer.from('not a skill') });
  await expect(studio.getByRole('alert')).toContainText('frontmatter');
  await input.setInputFiles({ name: 'SKILL.md', mimeType: 'text/markdown', buffer: Buffer.from(manualGuidanceFixture) });
  await expect(studio.getByLabel('Imported skill preview')).toContainText('measure, correlate, validate');
  await expect(studio.getByRole('status')).toContainText('not published or attached');
  const publish = studio.getByRole('button', { name: 'Approve & publish reviewed version', exact: true });
  await expect(publish).toBeDisabled();
  await studio.getByLabel('Publication version').fill(version);
  await studio.getByLabel('Reviewer label').fill('Synthetic browser reviewer');
  await studio.getByLabel('Declared skill source').selectOption('manual-guidance');
  for (const name of [/I reviewed the complete file/, /contains synthetic demonstration guidance/, /guidance for the fixed server workflow/, /allow this reviewed guidance to be sent/]) {
    await studio.getByRole('checkbox', { name }).check();
  }
  await publish.click();
  await expect(studio.getByRole('status')).toContainText(`Published expert-quality-review v${version}`);
  expect((await (await page.request.get('/api/skill')).json()).version).toBe('1.0.0');
  await studio.getByRole('button', { name: 'Attach reviewed version to agent', exact: true }).click();
  await expect(studio.getByRole('status')).toContainText(`Attached expert-quality-review v${version}`);
  await expect(page.getByRole('button', { name: `Pinned guidance · v${version}`, exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/state')).json()).correlationId).toBe(correlationId);
  await page.getByRole('button', { name: `Pinned guidance · v${version}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Manually supplied, reviewed local guidance');
  await expect(page.getByRole('dialog')).toContainText('measure, correlate, validate');
  await expect(page.getByRole('dialog')).toContainText('SHA-256');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start investigation', exact: true }).click();
  for (let index = 0; index < 3; index++) await page.getByRole('button', { name: 'Next conversation step' }).click();
  await page.getByRole('button', { name: 'Use reference image', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Human approval required' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: `expert-quality-review · v${version}`, exact: true })).toBeVisible();
  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  const active = (await (await page.request.get('/api/state')).json());
  expect(active.audit.find((entry: { tool: string }) => entry.tool === 'skill.load').outputSummary).toContain(active.skillReference.provenance.sha256);
  const approvalId = active.approval.id;
  await studio.getByRole('button', { name: 'Restore bundled synthetic guidance for selected agent', exact: true }).click();
  await expect(studio.getByRole('status')).toContainText('Existing cases remain pinned');
  await expect(page.getByRole('button', { name: `expert-quality-review · v${version}`, exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/state')).json()).approval.id).toBe(approvalId);
  await page.getByRole('button', { name: 'New investigation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pinned guidance · v1.0.0', exact: true })).toBeVisible();
  await studio.reload();
  await expect(studio.getByLabel('Published skill version').locator('option', { hasText: `expert-quality-review / v${version}` })).toHaveCount(1);
  await studio.close();
});

test('expert source workspace shows real synthetic records and manual notes without running an AI investigation', async ({ page }) => {
  let forbiddenCalls = 0;
  for (const path of ['conversation', 'advance', 'photo/analyze', 'action']) {
    await page.route(`**/api/${path}`, route => { forbiddenCalls++; return route.abort(); });
  }
  await page.goto('/?workspace=skills&view=expert&scoutTheme=dark');
  await expect(page.getByRole('heading', { name: 'Investigate the synthetic records yourself' })).toBeVisible();
  await page.getByLabel('Expert training dataset').selectOption('Q-2049');
  await expect(page.getByRole('tabpanel')).toContainText('12');
  await expect(page.getByRole('img', { name: 'Provided reference image: Front-left door latch and striker', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Production measurements', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('11:24');
  await expect(page.getByRole('table')).toContainText('Outside synthetic limit');
  await page.getByRole('tab', { name: 'Maintenance history', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('SF-4308');
  await expect(page.getByRole('tabpanel')).toContainText('11:05');
  await page.getByRole('tab', { name: 'Engineering knowledge', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('QI-1926');
  await page.getByLabel('Preliminary hypothesis', { exact: true }).fill('Synthetic fixture seating hypothesis; requires measurement.');
  await page.getByLabel('Next verification checks', { exact: true }).fill('Measure striker position before proposing adjustment.');
  await page.getByLabel('Expert training dataset').selectOption('Q-2050');
  await expect(page.getByLabel('Preliminary hypothesis', { exact: true })).toHaveValue('');
  await expect(page.getByRole('tabpanel')).toContainText('Tailgate');
  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(forbiddenCalls).toBe(0);
  expect((await (await page.request.get('/api/state')).json()).phase).toBe('IDLE');
});

test('skill preview is inert plain text and source declarations do not fabricate Recorder attestation', async ({ page }) => {
  await page.goto('/?workspace=skills&scoutTheme=dark');
  const content = manualGuidanceFixture + '\n<script>window.__unsafeSkillExecuted=true</script>\n[External](https://unrelated.invalid/never-fetch)';
  await page.getByLabel('Exported Markdown skill').setInputFiles({
    name: 'SKILL.md', mimeType: 'text/markdown', buffer: Buffer.from(content),
  });
  await expect(page.getByLabel('Imported skill preview')).toContainText('<script>');
  expect(await page.evaluate(() => '__unsafeSkillExecuted' in window)).toBe(false);
  await page.getByLabel('Reviewer label').fill('Synthetic reviewer');
  for (const name of [/I reviewed the complete file/, /contains synthetic demonstration guidance/, /guidance for the fixed server workflow/, /allow this reviewed guidance to be sent/]) {
    await page.getByRole('checkbox', { name }).check();
  }
  await expect(page.getByRole('button', { name: 'Approve & publish reviewed version', exact: true })).toBeDisabled();
  await expect(page.getByText(/operator declarations, not verified identity/)).toBeVisible();
});
