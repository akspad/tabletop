import { test, expect } from "@playwright/test";

test("host can cancel or confirm a live game switch without losing seats", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Start a table/ }).click();
  await page.getByRole("textbox", { name: "Your name" }).fill("Maple");
  await page.getByRole("button", { name: "Create my table →" }).click();
  const code = (await page.getByText(/^ROOM [A-Z0-9]{6}$/).innerText()).replace(
    "ROOM ",
    "",
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const guest = await context.newPage();
  await guest.goto(`${baseURL}/?code=${code}`);
  await guest.getByRole("textbox", { name: "Your name" }).fill("Fern");
  await guest.getByRole("button", { name: "Join the table →" }).click();
  await expect(page.getByText("Fern", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /Hanabi/ }).click();
  await page.getByRole("button", { name: "Learn Hanabi", exact: true }).click();
  await expect(page.getByText("Step 1 of 5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Play Hanabi →" }).click();
  await expect(page.getByText("Clues 8/8", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Game rules" }).click();
  await page
    .getByRole("button", { name: "Learn to play", exact: true })
    .click();
  await expect(page.getByText("Step 1 of 5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", {
      name: /^Clue .+: [1-5] matching cards, costs one token$/,
    })
    .first()
    .click();
  await expect(guest.getByText("Clues 7/8", { exact: true })).toBeVisible();
  await guest.getByRole("button", { name: /^Your slot 1\./ }).click();
  await guest.getByRole("button", { name: "Play slot 1", exact: true }).click();
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Game rules" }).click();
  await page
    .getByRole("button", { name: "End game and choose another", exact: true })
    .click();
  await expect(
    page.getByText(
      "No result will be saved. Everyone keeps their seat and the same room code.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep playing", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "End game for everyone", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Close rules", exact: true })
    .last()
    .click();
  await expect(page.getByText("Clues 7/8", { exact: true })).toBeVisible();
  await expect(guest.getByText("Your hand", { exact: true })).toBeVisible();
  await guest.getByRole("button", { name: "Game rules" }).click();
  await expect(
    guest.getByRole("button", {
      name: "End game and choose another",
      exact: true,
    }),
  ).toHaveCount(0);
  await guest
    .getByRole("button", { name: "Close rules", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Game rules" }).click();
  await page
    .getByRole("button", { name: "End game and choose another", exact: true })
    .click();
  await page
    .getByRole("button", { name: "End game for everyone", exact: true })
    .click();
  for (const client of [page, guest]) {
    await expect(client.getByText("Everyone’s welcome.")).toBeVisible();
    await expect(
      client.getByText(`ROOM ${code}`, { exact: true }),
    ).toBeVisible();
    await expect(client.getByText(/Maple/).first()).toBeVisible();
    await expect(client.getByText(/Fern/).first()).toBeVisible();
    await expect(client.getByText("A moment to celebrate.")).toHaveCount(0);
  }
  await page.screenshot({
    path: "test-results/switch-preserved-room.png",
    fullPage: true,
  });
  await page.getByRole("radio", { name: /Property Rush/ }).click();
  await page.getByRole("button", { name: "Play Property Rush →" }).click();
  await expect(
    guest.getByText("The neighborhood", { exact: true }),
  ).toBeVisible();
  await expect(guest.getByText(`ROOM ${code}`, { exact: true })).toBeVisible();
  await context.close();
});
