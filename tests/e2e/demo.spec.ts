import { expect, test, type Page } from '@playwright/test';

async function steps(page: Page) {
  await page.getByRole('button', { name: 'Start investigation', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next conversation step' }).click();
}
test('complete guided investigation, explicit approval and second-agent reuse', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?scoutTheme=dark');
  await expect(page.getByRole('heading', { name: /Quality Live Agent/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connected · not configured' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/workspace-ready.png', fullPage: true });
  await steps(page);
  await page.getByRole('button', { name: 'Use reference image', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Human approval required' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Probable cause' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /CA-1041 created/ })).toHaveCount(0);
  const denial = await page.request.post('/api/action', { data: {} });
  expect(denial.status()).toBe(403);
  await page.screenshot({ path: 'test-results/workspace-approval.png', fullPage: true });
  await page.getByRole('tab', { name: 'Incident', exact: true }).click();
  await page.getByRole('button', { name: 'Approve and create action', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CA-1041 created' })).toBeVisible();
  await expect(page.getByText('No production release has been authorized automatically.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Demonstrate skill reuse' }).click();
  await expect(page.getByRole('heading', { name: /Q-3012/ })).toBeVisible();
  await steps(page);
  await page.getByRole('button', { name: 'Use reference image', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Human approval required' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Potential incorrect nozzle pressure following maintenance NM-901.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Incident', exact: true }).click();
  await page.getByRole('button', { name: 'Approve and create action', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Teach once. Scale everywhere.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/workspace-reuse.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('image input validation, local preview and honest arbitrary-image mock', async ({ page }) => {
  await page.goto('/');
  await steps(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert')).toContainText('JPEG, PNG, or WebP');
  await page.locator('input[type=file]').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert')).toContainText('contents do not match');
  await page.locator('input[type=file]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/QAAAABJRU5ErkJggg==', 'base64') });
  await expect(page.getByRole('heading', { name: 'Human approval required' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Guided mode cannot inspect arbitrary uploaded pixels/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Remove local preview' }).click();
  await expect(page.getByText('Photo preview removed.', { exact: false })).toBeVisible();
});
test('mobile layout, keyboard safety and accessible skill drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /Open conversation & checklist/ }).click();
  await page.getByLabel('Operator message').fill(' ');
  await page.getByLabel('Operator message').press('Space');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Start investigation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Explore the reusable skill/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('How this agent learned the procedure')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('side-by-side investigation workspace and conversation drawer preserve interactive intake', async ({ page }) => {
  await page.goto('/');
  const board = page.getByRole('region', { name: 'Live investigation board' });
  await expect(board).toBeVisible();
  const box = await board.boundingBox();
  expect(box!.width).toBeGreaterThan(1250);
  const station = await page.getByRole('region', { name: 'Assistant station' }).boundingBox();
  expect(station!.x + station!.width).toBeLessThan(box!.x);
  expect(station!.y + station!.height).toBeCloseTo(box!.y + box!.height, 0);
  const avatar = await page.locator('.assistant-media > .avatar').boundingBox();
  expect(avatar!.width).toBeGreaterThanOrEqual(550);
  expect(avatar!.height).toBeGreaterThanOrEqual(400);
  const boardBody = await page.locator('.board-body').boundingBox();
  expect(boardBody!.height).toBeGreaterThanOrEqual(500);
  await expect(page.getByRole('region', { name: 'Investigation activity ribbon' })).toBeVisible();
  await page.getByRole('button', { name: /Open conversation & checklist/ }).click();
  await page.getByLabel('Operator message').fill('The front-left door needs unusually high closing force.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Which production station is affected?');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');
  await page.keyboard.press('Escape');
  await expect(page.locator('.assistant-response')).toContainText('Which production station is affected?');
  await expect(page.getByRole('button', { name: 'Next conversation step', exact: true })).toBeVisible();
});

test('large board scroll area survives populated evidence at laptop and conference sizes', async ({ page }) => {
  await page.goto('/');
  await steps(page);
  await page.getByRole('button', { name: 'Use reference image', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Human approval required' })).toBeVisible({ timeout: 15000 });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('tab', { name: 'Investigation', exact: true }).click();
    const station = await page.getByRole('region', { name: 'Assistant station' }).boundingBox();
    const board = await page.getByRole('region', { name: 'Live investigation board' }).boundingBox();
    const body = await page.locator('.board-body').boundingBox();
    expect(station!.x + station!.width).toBeLessThan(board!.x);
    expect(board!.width / (board!.width + station!.width)).toBeGreaterThan(.68);
    expect(body!.height).toBeGreaterThanOrEqual(viewport.width >= 1700 ? 500 : 400);
    const avatar = await page.locator('.assistant-media > .avatar').boundingBox();
    expect(avatar!.height).toBeGreaterThanOrEqual(300);
    await page.locator('.board-body').evaluate(element => { element.scrollTop = 0; });
    await expect(page.getByText('Front-left door and upper hinge', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Incident', exact: true }).click();
    await page.getByRole('heading', { name: 'Human approval required' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Approve and create action', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.locator('.board-body').evaluate(element => getComputedStyle(element).overflowY)).toBe('visible');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('visible avatar controls disclose disconnection without starting a paid session', async ({ page }) => {
  let starts = 0;
  await page.route('**/api/health', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ json: { ...body, speech: { configured: true, verified: true, reason: 'Synthetic adapter test',
      voice: 'en-US-Harper:MAI-Voice-2.1-Flash', character: 'layla', style: '', photoAvatarBaseModel: 'vasa-1', avatarRelayAvailable: true } } });
  });
  await page.route('**/api/speech/avatar-session', route => { starts++; return route.fulfill({ status: 503, json: { error: 'Test connection denied.' } }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Configure avatar & MAI voice' }).click();
  await page.getByLabel('Speech output provider').selectOption('avatar');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Connect avatar (billable)', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnect live avatar', exact: true })).toBeDisabled();
  await expect(page.locator('.connection-summary')).toContainText('Disconnected');
  await expect(page.locator('.connected-avatar-caption')).toContainText('layla / Talking head');
  expect(await page.locator('.connected-avatar video').evaluate(element => {
    const style = getComputedStyle(element);
    return { fit: style.objectFit, top: style.paddingTop, side: style.paddingLeft, bottom: style.paddingBottom };
  })).toEqual({ fit: 'contain', top: '56px', side: '24px', bottom: '24px' });
  expect(starts).toBe(0);
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const avatar = await page.locator('.connected-avatar').boundingBox();
    expect(avatar!.width).toBeGreaterThanOrEqual(300);
    expect(avatar!.height).toBeGreaterThanOrEqual(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Connect avatar (billable)', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Connect avatar (billable)', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Test connection denied');
  expect(starts).toBe(1);
});

test('Azure microphone requires consent and fails explicitly without browser fallback', async ({ page }) => {
  let recognitionStarts = 0;
  await page.route('**/api/health', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ json: { ...body, speech: { ...body.speech, configured: true } } });
  });
  await page.route('**/api/speech/recognition-session', async route => {
    recognitionStarts++;
    expect(route.request().postDataJSON()).toEqual({ consent: true });
    await route.fulfill({ status: 503, json: { error: 'Synthetic recognition authorization denied. No browser fallback was used.' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
  await expect(page.getByLabel('Speech input provider')).toHaveValue('azure');
  expect(recognitionStarts).toBe(0);
  await page.getByRole('checkbox', { name: 'Allow Azure Speech-to-Text (microphone audio sent to Azure)', exact: true }).check();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic recognition authorization denied');
  expect(recognitionStarts).toBe(1);
  await expect(page.getByRole('button', { name: 'Start microphone', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Demo controls', exact: true }).click();
  await expect(page.getByLabel('Speech input provider')).toHaveValue('azure');
  await page.getByLabel('Speech input provider').selectOption('browser');
  await expect(page.getByRole('checkbox', { name: 'Allow browser speech recognition', exact: true })).not.toBeChecked();
});

test('hands-free start requires consent and stops before listening if MAI output fails', async ({ page }) => {
  let microphoneStarts = 0;
  await page.route('**/api/health', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ json: { ...body, speech: { ...body.speech, configured: true, verified: true } } });
  });
  await page.route('**/api/speech/audio', route => route.fulfill({ status: 502, json: { error: 'Synthetic MAI playback failure.' } }));
  await page.route('**/api/speech/recognition-session', route => {
    microphoneStarts++;
    return route.fulfill({ status: 503, json: { error: 'Unexpected microphone start.' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start hands-free conversation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('allow microphone audio');
  expect(microphoneStarts).toBe(0);
  await page.getByLabel('Speech output provider').selectOption('mai');
  await page.getByRole('checkbox', { name: 'Allow Azure Speech-to-Text (microphone audio sent to Azure)', exact: true }).check();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start hands-free conversation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic MAI playback failure');
  await expect(page.getByRole('button', { name: 'Start hands-free conversation', exact: true })).toBeVisible();
  expect(microphoneStarts).toBe(0);
  await expect(page.locator('.assistant-response')).toContainText('What have you observed?');
});

test('MAI failure is explicit and never switches to browser speech', async ({ page }) => {
  await page.route('**/api/health', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ json: { ...body, speech: { configured: true, verified: false, reason: 'Synthetic adapter test',
      voice: 'en-US-Harper:MAI-Voice-2.1-Flash', character: 'lisa', style: 'casual-sitting', avatarRelayAvailable: false } } });
  });
  await page.route('**/api/speech/verify', route => route.fulfill({ json: { configured: true, verified: true,
    reason: 'Synthetic adapter test', voice: 'en-US-Harper:MAI-Voice-2.1-Flash', character: 'lisa', style: 'casual-sitting', avatarRelayAvailable: true } }));
  await page.route('**/api/speech/audio', route => route.fulfill({ status: 502, json: { error: 'Azure Speech unavailable. No alternative voice was selected.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo controls', exact: true }).click();
  await page.getByRole('button', { name: 'Check Azure Speech access', exact: true }).click();
  await page.getByLabel('Speech output provider').selectOption('mai');
  await page.getByRole('button', { name: 'Test MAI Flash voice (billable)', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No alternative voice was selected');
  await expect(page.getByLabel('Speech output provider')).toHaveValue('mai');
});

test('avatar bootstrap failure does not display a fake live avatar', async ({ page }) => {
  await page.route('**/api/health', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ json: { ...body, speech: { configured: true, verified: true, reason: 'Synthetic adapter test',
      voice: 'en-US-Harper:MAI-Voice-2.1-Flash', character: 'lisa', style: 'casual-sitting', avatarRelayAvailable: true } } });
  });
  await page.route('**/api/speech/avatar-session', route => route.fulfill({ status: 503, json: { error: 'Avatar relay unavailable. No fallback was used.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo controls', exact: true }).click();
  await page.getByLabel('Speech output provider').selectOption('avatar');
  await page.getByRole('button', { name: 'Connect Azure avatar (billable)', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No fallback was used');
  await expect(page.locator('.connected-avatar-caption')).toContainText('Failed');
  await expect(page.getByText(/Placeholder avatar/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Test MAI Flash voice (billable)', exact: true })).toBeDisabled();
});
