import { test, expect } from '@playwright/test';

test('a seated player explicitly asks Keiki without changing the table', async ({ page }) => {
  const helperRequests: string[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/api/action') && request.postData()?.includes('keiki:ask')) helperRequests.push('keiki:ask');
  });
  page.on('websocket', socket => {
    if (!new URL(socket.url()).hostname.endsWith('.convex.cloud')) return;
    socket.on('framesent', frame => {
      if (typeof frame.payload !== 'string') return;
      const message = JSON.parse(frame.payload);
      if (message.type === 'Action' && message.udfPath === 'keiki:ask') helperRequests.push('keiki:ask');
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Start a table/ }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Keiki learner');
  await page.getByRole('button', { name: 'Create my table →' }).click();
  const code = await page.getByText(/^ROOM [A-Z0-9]{6}$/).innerText();
  await page.getByRole('radio', { name: /Property Rush/ }).click();
  await page.getByRole('button', { name: 'Read Property Rush rules', exact: true }).click();
  await page.getByRole('button', { name: 'Ask Keiki about the rules', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Rules question' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask Keiki', exact: true })).toBeDisabled();
  expect(helperRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Do I get change if I pay 3 for rent of 2?', exact: true }).click();
  expect(helperRequests).toHaveLength(0);
  await page.clock.install();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
  await page.getByRole('textbox', { name: 'Rules question' }).press('Enter');
  await expect(page.getByText('KEIKI’S EXPLANATION', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/no change/i).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask again in 5s', exact: true })).toBeDisabled();
  await expect(page.getByText('Give Keiki a moment before your next question.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Uncaught Error/)).toHaveCount(0);
  await page.clock.fastForward(5_250);
  await expect(page.getByRole('button', { name: 'Ask Keiki', exact: true })).toBeEnabled();
  await page.clock.resume();
  expect(helperRequests).toHaveLength(1);
  const secret = await page.evaluate(() => JSON.parse(localStorage.getItem('tabletop.fresh.session.v1')!).secret);
  expect((await page.locator('body').innerText()).includes(secret)).toBe(false);
  await page.getByRole('button', { name: 'Back to rules', exact: true }).click();
  await page.getByRole('button', { name: 'Got it. Let’s play.', exact: true }).click();
  await expect(page.getByText(code, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Property Rush →', exact: true })).toBeVisible();
  expect(helperRequests).toHaveLength(1);
});
