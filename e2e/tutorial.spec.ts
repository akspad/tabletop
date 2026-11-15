import { expect, test, type Locator, type Page } from "@playwright/test";

async function openGuide(page: Page, game: "Hanabi" | "Property Rush") {
  await page.getByRole("button", { name: "Read " + game + " rules", exact: true }).click();
  await page.getByRole("button", { name: "Learn to play", exact: true }).click();
  await expect(page.getByText("Step 1 of " + (game === "Hanabi" ? 5 : 6), { exact: true })).toBeVisible();
}

async function tapVisible(button: Locator) {
  await expect(button).toBeInViewport({ ratio: 1 });
  await button.click();
}

function watchMutations(page: Page) {
  const mutations: string[] = [];
  page.on("websocket", socket => socket.on("framesent", event => {
    try {
      const frame = JSON.parse(event.payload.toString());
      if (frame.type === "Mutation") mutations.push(frame.type);
    } catch {}
  }));
  return mutations;
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
  test("Hanabi hands-on tasks, full rules, mistakes, final turns, and reset at " + viewport.width, async ({ page }) => {
    await page.setViewportSize(viewport);
    const mutations = watchMutations(page);
    await page.goto("/");
    await openGuide(page, "Hanabi");
    const next = page.getByRole("button", { name: "Next →", exact: true });
    const close = page.getByRole("button", { name: "Close", exact: true });
    await expect(next).toBeDisabled();
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
    await expect(page.getByText("Practice only · your table is unchanged", { exact: true })).toBeInViewport({ ratio: 1 });
    await tapVisible(page.getByRole("button", { name: "+ More rules", exact: true }));
    await expect(page.getByText(/Hanabi is cooperative for 2–5 players/)).toBeVisible();
    await expect(page.getByText(/8 shared clue tokens and 3 fuses/)).toBeVisible();
    await page.getByRole("button", { name: "− Less rules", exact: true }).click();
    await tapVisible(page.getByRole("button", { name: "?. Your card · hidden", exact: true }));
    await expect(next).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Blue 1. Teammate · visible", exact: true }));
    await expect(page.getByText(/never your own/)).toBeVisible();
    await tapVisible(next);

    await expect(next).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Give Red clue · costs 1", exact: true }));
    await expect(page.getByText("✓ Red", { exact: true })).toHaveCount(2);
    await expect(page.getByText("Not red", { exact: true })).toBeVisible();
    await expect(page.getByText("Clue tokens: 7 / 8", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Red clue given · 8 → 7", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByText("Step 1 of 5", { exact: true })).toBeVisible();
    await next.click();
    await expect(page.getByText("✓ Red", { exact: true })).toHaveCount(2);
    await next.click();

    await expect(next).toBeDisabled();
    await expect(page.getByRole("button", { name: "Play selected card", exact: true })).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Blue 3. Choose this card", exact: true }));
    await tapVisible(page.getByRole("button", { name: "Play selected card", exact: true }));
    await expect(page.getByText(/Blue 2 is missing/)).toBeVisible();
    await expect(page.getByText(/Fuses: 2 \/ 3/)).toBeVisible();
    await expect(next).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Red 2. Choose this card", exact: true }));
    await tapVisible(page.getByRole("button", { name: "Play selected card", exact: true }));
    await expect(page.getByText(/Red 2 fits on Red 1/)).toBeVisible();
    await tapVisible(next);

    await expect(next).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Discard hidden card", exact: true }));
    await expect(page.getByText("Clue tokens: 8 / 8 · full", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Discard unavailable · clues full", exact: true })).toBeDisabled();
    await tapVisible(next);

    const ready = page.getByRole("button", { name: "Ready to play", exact: true });
    await expect(ready).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "A draws the last card", exact: true }));
    for (const name of ["B", "C", "A"]) {
      await expect(ready).toBeDisabled();
      await tapVisible(page.getByRole("button", { name: "Take " + name + "’s final turn", exact: true }));
    }
    await expect(page.getByText(/including the drawer/)).toBeVisible();
    await expect(page.getByText("A ✓", { exact: true })).toBeVisible();
    await tapVisible(ready);
    await expect(page.getByText("Step 5 of 5", { exact: true })).toHaveCount(0);
    await openGuide(page, "Hanabi");
    await expect(next).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Blue 1. Teammate · visible", exact: true }));
    await next.click();
    await expect(page.getByRole("button", { name: "Give Red clue · costs 1", exact: true })).toBeEnabled();
    await tapVisible(close);
    await expect(page.getByText("Step 2 of 5", { exact: true })).toHaveCount(0);
    expect(mutations).toEqual([]);
  });

  test("Property hands-on sets, bank, pay, block, steal, discard, and reset at " + viewport.width, async ({ page }) => {
    await page.setViewportSize(viewport);
    const mutations = watchMutations(page);
    await page.goto("/");
    await openGuide(page, "Property Rush");
    const next = page.getByRole("button", { name: "Next →", exact: true });
    await expect(next).toBeDisabled();
    await page.getByRole("button", { name: "+ More rules", exact: true }).click();
    await expect(page.getByText(/60-card game for 2–4 players/)).toBeVisible();
    await expect(page.getByText(/3 complete sets in different colors/)).toBeVisible();
    await expect(page.getByText(/never own more than 2 of a color/)).toBeVisible();
    await expect(page.getByText(/Everyone starts with 5 cards/)).toBeVisible();
    await page.getByRole("button", { name: "− Less rules", exact: true }).click();
    await tapVisible(page.getByRole("button", { name: "Place Sky from your hand", exact: true }));
    await expect(page.getByText("Your complete sets: 3 / 3 · winner!", { exact: true })).toBeVisible();
    await tapVisible(next);

    await expect(next).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Draw 2 cards", exact: true }));
    await expect(page.getByText("Hand: 7  |  Plays left: 3 / 3", { exact: true })).toBeVisible();
    await expect(next).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Bank Rent for 1", exact: true }));
    await expect(page.getByText("Hand: 6  |  Plays left: 2 / 3", { exact: true })).toBeVisible();
    await expect(page.getByText(/permanently money worth 1/)).toBeVisible();
    await tapVisible(next);

    await expect(next).toBeDisabled();
    await expect(page.getByRole("button", { name: "Bank 1. Value 1", exact: true })).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Accept Rent 2", exact: true }));
    await tapVisible(page.getByRole("button", { name: "Bank 1. Value 1", exact: true }));
    await tapVisible(page.getByRole("button", { name: "Pay 1", exact: true }));
    await expect(page.getByText(/Just 1 is not enough/)).toBeVisible();
    await expect(next).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Bank 3. Value 3", exact: true }));
    await tapVisible(page.getByRole("button", { name: "Pay 3", exact: true }));
    await expect(page.getByText("Rent paid: 3 · change: 0", { exact: true })).toBeVisible();
    await expect(page.getByText(/your hand and properties never pay/)).toBeVisible();
    await tapVisible(next);

    await expect(next).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Use Block from hand", exact: true }));
    await expect(page.getByText(/next turn still has three plays/)).toBeVisible();
    await expect(page.getByText(/Block cannot be blocked/)).toBeVisible();
    await tapVisible(next);

    await expect(next).toBeDisabled();
    await expect(page.getByRole("button", { name: "Coral × 2. Rival’s set · protected", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sky × 1. Your Sky is full", exact: true })).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Steal rival’s Mint × 1", exact: true }));
    await expect(page.getByText(/they could Block instead/)).toBeVisible();
    await tapVisible(next);

    const ready = page.getByRole("button", { name: "Ready to play", exact: true });
    await expect(ready).toBeDisabled();
    await expect(page.getByRole("button", { name: "Discard selected card", exact: true })).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Select card 8 to discard", exact: true }));
    await tapVisible(page.getByRole("button", { name: "Discard selected card", exact: true }));
    await expect(page.getByText("Hand: 7 cards", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select card 8 to discard", exact: true })).toHaveCount(0);
    await expect(ready).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "End turn with 7", exact: true }));
    await expect(page.getByText("Hand: 7 cards · turn ended ✓", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByText("Step 5 of 6", { exact: true })).toBeVisible();
    await next.click();
    await tapVisible(ready);
    await openGuide(page, "Property Rush");
    await expect(next).toBeDisabled();
    await tapVisible(page.getByRole("button", { name: "Place Sky from your hand", exact: true }));
    await next.click();
    await expect(page.getByRole("button", { name: "Draw 2 cards", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Draw 2 cards", exact: true }).click();
    await page.getByRole("button", { name: "Bank Rent for 1", exact: true }).click();
    await next.click();
    await expect(page.getByText("Rent paid: 3 · change: 0", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Accept Rent 2", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Accept Rent 2", exact: true }).click();
    await page.getByRole("button", { name: "Bank 3. Value 3", exact: true }).click();
    await page.getByRole("button", { name: "Pay 3", exact: true }).click();
    await next.click();
    await expect(page.getByRole("button", { name: "Use Block from hand", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Use Block from hand", exact: true }).click();
    await next.click();
    await expect(page.getByRole("button", { name: "Steal rival’s Mint × 1", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Steal rival’s Mint × 1", exact: true }).click();
    await next.click();
    await expect(page.getByText("Hand: 8 cards", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Discard selected card", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText("Step 6 of 6", { exact: true })).toHaveCount(0);
    expect(mutations).toEqual([]);
  });
}
