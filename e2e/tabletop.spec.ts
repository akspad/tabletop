import { test, expect } from "@playwright/test";
import { puzzles } from "../src/games/crossword";

test("daily shortcut opens the existing create flow and requires a name", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText(/PACIFIC TIME/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Start today’s mini", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Your name" })).toBeVisible();
  await page.getByRole("button", { name: "Create my table →" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "What should we call you at the table?",
  );
  await expect(page.getByText(/^ROOM [A-Z0-9]{6}$/)).toHaveCount(0);
  await page.getByRole("textbox", { name: "Your name" }).fill("Juniper");
  await page.getByRole("button", { name: "Create my table →" }).click();
  await expect(page.getByText("Everyone’s welcome.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play The Daily Mini →" }),
  ).toBeVisible();
});

test("two private browser sessions join, edit one grid, and restore their seats", async ({
  browser,
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Start a table/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Start a table/ }).click();
  await page.getByRole("textbox", { name: "Your name" }).fill("Rowan");
  await page.getByRole("button", { name: "Create my table →" }).click();
  await expect(page.getByText("Everyone’s welcome.")).toBeVisible();
  const code = (await page.getByText(/^ROOM [A-Z0-9]{6}$/).innerText()).replace(
    "ROOM ",
    "",
  );
  await page.screenshot({
    path: "test-results/lobby-mobile.png",
    fullPage: true,
  });
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const guest = await guestContext.newPage();
  guest.on("pageerror", (error) => errors.push(error.message));
  await guest.goto(`${baseURL}/?code=${code}`);
  await guest.getByRole("textbox", { name: "Your name" }).fill("Sage");
  await expect(guest.getByRole("textbox", { name: "Room code" })).toHaveValue(
    code,
  );
  await guest.getByRole("button", { name: "Join the table →" }).click();
  await expect(guest.getByText("Sage (you)", { exact: true })).toBeVisible();
  await expect(page.getByText("Sage", { exact: true })).toBeVisible();
  await page
    .getByRole("radio", { name: puzzles[0].title, exact: false })
    .click();
  await page.getByRole("button", { name: "Play The Daily Mini →" }).click();
  await expect(page.getByRole("button", { name: /^Cell 1,/ })).toBeInViewport();
  const square = await page
    .getByRole("button", { name: /^Cell 1,/ })
    .boundingBox();
  expect(square).not.toBeNull();
  expect(Math.abs(square!.width - square!.height)).toBeLessThan(1);
  await expect(page.getByRole("button", { name: /^Cell 1,/ })).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Cell 1,/ })).toBeVisible();
  await page.getByRole("button", { name: /^Cell 2,/ }).click();
  const keyboard = page.getByRole("textbox", {
    name: "Crossword letter input",
  });
  await keyboard.pressSequentially("WXYZ", { delay: 0 });
  await expect(guest.getByRole("button", { name: /^Cell 2, W/ })).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Cell 3, X/ })).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Cell 4, Y/ })).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Cell 5, Z/ })).toBeVisible();
  await keyboard.press("Backspace");
  await keyboard.press("Backspace");
  await expect(
    guest.getByRole("button", { name: /^Cell 5, empty/ }),
  ).toBeVisible();
  await expect(
    guest.getByRole("button", { name: /^Cell 4, empty/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Cell 1,/ }).click();
  await page.getByRole("button", { name: /^Cell 1,/ }).click();
  await page
    .getByRole("textbox", { name: "Crossword letter input" })
    .pressSequentially("ABCD", { delay: 30 });
  await expect(guest.getByRole("button", { name: /^Cell 1, A/ })).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Cell 6, B/ })).toBeVisible();
  await expect(
    guest.getByRole("button", { name: /^Cell 11, C/ }),
  ).toBeVisible();
  await expect(
    guest.getByRole("button", { name: /^Cell 16, D/ }),
  ).toBeVisible();
  await guest.getByRole("button", { name: /^Cell 2,/ }).click();
  await guest
    .getByRole("textbox", { name: "Crossword letter input" })
    .pressSequentially("Z");
  await expect(page.getByRole("button", { name: /^Cell 2, Z/ })).toBeVisible();
  await guest.reload();
  await expect(guest.getByText("Sage (you)", { exact: true })).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Cell 2, Z/ })).toBeVisible();
  await guest.screenshot({
    path: "test-results/crossword-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByText("Rowan (you)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Cell 2, Z/ })).toBeVisible();
  for (let row = 0; row < 5; row++) {
    await page
      .getByRole("button", {
        name: new RegExp(
          puzzles[0].across[row].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      })
      .click();
    await page
      .getByRole("textbox", { name: "Crossword letter input" })
      .pressSequentially(puzzles[0].rows[row], { delay: 0 });
  }
  await expect(page.getByText("A moment to celebrate.")).toBeVisible();
  await expect(page.getByText("A moment to celebrate.")).toBeInViewport();
  await expect(guest.getByText("A moment to celebrate.")).toBeVisible();
  await expect(page.getByText("25", { exact: true })).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await guestContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy result", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Result copied ✓" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^We solved Tabletop’s Daily Mini in \d+:\d{2}\.$/,
  );
  await guest.getByRole("button", { name: "Copy result", exact: true }).click();
  await expect(
    guest.getByRole("button", { name: "Result copied ✓" }),
  ).toBeVisible();
  await expect(
    guest.getByRole("button", { name: "Play again", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/results-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Play again", exact: true }).click();
  await expect(
    guest.getByText(puzzles[0].title, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Cell 1, empty/ }),
  ).toBeVisible();
  for (let row = 0; row < 5; row++) {
    await page
      .getByRole("button", {
        name: new RegExp(
          puzzles[0].across[row].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      })
      .click();
    await page
      .getByRole("textbox", { name: "Crossword letter input" })
      .pressSequentially(puzzles[0].rows[row], { delay: 0 });
  }
  await expect(page.getByText("A moment to celebrate.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy result", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose another game" }).click();
  await expect(guest.getByText("Everyone’s welcome.")).toBeVisible();
  await page
    .getByRole("radio", { name: puzzles[1].title, exact: false })
    .click();
  await page.getByRole("button", { name: "Play The Daily Mini →" }).click();
  await expect(page.getByText(puzzles[1].title, { exact: true })).toBeVisible();
  await expect(
    guest.getByRole("button", { name: /^Cell 1, empty/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await guestContext.close();
});
