import { expect, test } from '@playwright/test';

for (const width of [390, 320]) {
  test(`compact resume row restores the same game at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Choose The Daily Mini', exact: true }).click();
    await page.getByRole('textbox', { name: 'Your name' }).fill('Willow');
    await page.getByRole('button', { name: 'Create my table →', exact: true }).click();
    const room = await page.getByText(/^ROOM [A-Z0-9]{6}$/).innerText();
    const code = room.replace('ROOM ', '');
    await page.getByRole('button', { name: 'Play The Daily Mini →', exact: true }).click();
    await page.getByRole('button', { name: /^Cell 2,/ }).click();
    await page.getByRole('textbox', { name: 'Crossword letter input' }).pressSequentially('Z');
    await expect(page.getByRole('button', { name: /^Cell 2, Z/ })).toBeVisible();
    const seat = await page.evaluate(() => JSON.parse(localStorage.getItem('tabletop.fresh.session.v1')!).seat);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    const resume = page.getByRole('button', { name: `Resume game in room ${code}`, exact: true });
    await expect(resume).toBeVisible();
    await expect(resume.getByText('Resume game', { exact: true })).toBeVisible();
    await expect(resume.getByText(`${code} →`, { exact: true })).toBeVisible();
    const row = (await resume.boundingBox())!;
    expect(row.height).toBeGreaterThanOrEqual(56);
    expect(row.height).toBeLessThanOrEqual(64);
    expect(row.x).toBeGreaterThanOrEqual(0);
    expect(row.x + row.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/compact-resume-${width}.png` });
    await resume.click();
    await expect(page.getByLabel('Crossword grid', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Cell 2, Z/ })).toBeVisible();
    await expect(page.getByText(room, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tabletop.fresh.session.v1')!).seat)).toEqual(seat);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Cell 2, Z/ })).toBeVisible();
  });
}

test('Keiki privacy stays visible while limits expand and collapse accessibly', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose The Daily Mini', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Sage');
  await page.getByRole('button', { name: 'Create my table →', exact: true }).click();
  await page.getByRole('button', { name: 'Read The Daily Mini rules', exact: true }).click();
  await page.getByRole('button', { name: 'Ask Keiki about the rules', exact: true }).click();
  const privacy = page.getByText('Only your chosen game and question go to Keiki. Keiki stores questions. Don’t include private cards or personal info.', { exact: true });
  await expect(privacy).toBeVisible();
  await expect(page.getByText('AI can be wrong. The app’s rules apply.', { exact: true })).toBeVisible();
  const details = page.getByRole('button', { name: 'Limits and details', exact: true });
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(/Up to 20 questions per guest/)).toHaveCount(0);
  expect((await details.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/compact-keiki-collapsed.png' });
  await details.click();
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  const limits = page.getByText('Up to 20 questions per guest each UTC day, with 5 seconds between questions. No live table data is attached.', { exact: true });
  await expect(limits).toBeVisible();
  await limits.scrollIntoViewIfNeeded();
  await expect(limits).toBeInViewport({ ratio: 0.99 });
  await expect(privacy).toBeVisible();
  await page.screenshot({ path: 'test-results/compact-keiki-expanded.png' });
  await details.click();
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(/Up to 20 questions per guest/)).toHaveCount(0);
  await expect(privacy).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Rules question' })).toBeEditable();
  await expect(page.getByRole('button', { name: 'Ask Keiki', exact: true })).toBeDisabled();
});
