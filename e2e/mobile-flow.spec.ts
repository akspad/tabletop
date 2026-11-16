import { expect, test, type Page } from "@playwright/test";

async function expectCreation(page: Page, title: string) {
  await expect(
    page.getByText("Pull up a chair", { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  const form = page.getByTestId("entry-form");
  await expect(
    form.getByText("A table of your own.", { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    form.getByText("YOUR SELECTED GAME", { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByTestId("selected-game").getByText(title, { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(form.getByRole("textbox", { name: "Your name" })).toBeInViewport(
    { ratio: 1 },
  );
  await expect(
    form.getByRole("button", { name: "Create my table →", exact: true }),
  ).toBeInViewport({ ratio: 1 });
}

async function expectKeikiBesideRules(page: Page) {
  const message = page.getByRole("button", {
    name: "Message Keiki",
    exact: true,
  });
  const rules = page.getByRole("button", { name: "Game rules", exact: true });
  await message.scrollIntoViewIfNeeded();
  await expect(message).toBeInViewport({ ratio: 1 });
  await expect(rules).toBeInViewport({ ratio: 1 });
  const chatBox = (await message.boundingBox())!;
  const rulesBox = (await rules.boundingBox())!;
  expect(Math.abs(chatBox.y - rulesBox.y)).toBeLessThan(1);
  expect(Math.abs(chatBox.width - rulesBox.width)).toBeLessThan(1);
  expect(Math.abs(chatBox.height - rulesBox.height)).toBeLessThan(1);
  expect(rulesBox.x - chatBox.x - chatBox.width).toBeGreaterThanOrEqual(0);
  expect(rulesBox.x - chatBox.x - chatBox.width).toBeLessThanOrEqual(9);
}

test("guest lobby waits without host selection controls and joins the host’s game", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choose The Daily Mini", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Your name" }).fill("Maple Host");
  await page
    .getByRole("button", { name: "Create my table →", exact: true })
    .click();
  const room = page.getByText(/^ROOM [A-Z0-9]{6}$/);
  await expect(room).toBeVisible();
  const code = (await room.innerText()).replace("ROOM ", "");
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const guest = await guestContext.newPage();
    await guest.goto(`${baseURL}/?code=${code}`);
    await guest.getByRole("textbox", { name: "Your name" }).fill("Sage Guest");
    await guest
      .getByRole("button", { name: "Join the table →", exact: true })
      .click();
    await expect(
      guest.getByText(
        "You’re all set. Your host will choose the game and get things started.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      guest.getByText("What are we playing?", { exact: true }),
    ).toHaveCount(0);
    await expect(guest.getByRole("radio")).toHaveCount(0);
    await expect(
      guest.getByText("CHOOSE YOUR MINI", { exact: true }),
    ).toHaveCount(0);
    await expect(
      guest.getByRole("button", { name: /^Play |^Read .* rules$|^Learn / }),
    ).toHaveCount(0);
    await expect(guest.getByText(code, { exact: true })).toBeVisible();
    await expect(guest.getByText("Maple Host", { exact: true })).toBeVisible();
    await expect(
      guest.getByRole("button", { name: "Copy invite", exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByRole("button", { name: "Home", exact: true }),
    ).toBeVisible();
    await guest.screenshot({ path: "test-results/guest-lobby-390.png" });
    await expect(
      page.getByRole("radio", { name: /The Daily Mini/ }),
    ).toBeChecked();
    await page
      .getByRole("button", { name: "Play The Daily Mini →", exact: true })
      .click();
    await expect(
      page.getByLabel("Crossword grid", { exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByLabel("Crossword grid", { exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByRole("button", { name: "Game rules", exact: true }),
    ).toBeVisible();
    await expectKeikiBesideRules(guest);
    await guest
      .getByRole("button", { name: "Message Keiki", exact: true })
      .click();
    await expect(
      guest.getByRole("textbox", { name: "Rules question", exact: true }),
    ).toBeVisible();
    await guest
      .getByRole("button", { name: "Close rules", exact: true })
      .click();
  } finally {
    await guestContext.close();
  }
});

for (const title of ["The Daily Mini", "Hanabi", "Property Rush"]) {
  test(`home tile prepares ${title} without creating or starting a game`, async ({
    page,
  }) => {
    const mutations: string[] = [];
    page.on("websocket", (socket) =>
      socket.on("framesent", (event) => {
        try {
          const frame = JSON.parse(event.payload.toString());
          if (frame.type === "Mutation") mutations.push(frame.udfPath);
        } catch {}
      }),
    );
    await page.goto("/");
    await expect(
      page.getByText(
        "Play puzzles and card games with friends. Start a table, share the code, and play together.",
        { exact: true },
      ),
    ).toBeInViewport();
    if (title === "The Daily Mini") {
      await expect(
        page.getByRole("button", {
          name: "Choose The Daily Mini",
          exact: true,
        }),
      ).toBeInViewport();
      await page.screenshot({ path: "test-results/clarity-home-390.png" });
    }
    await expect(
      page.getByRole("button", { name: `Read ${title} rules`, exact: true }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: `Choose ${title}`, exact: true })
      .click();
    await expectCreation(page, title);
    await expect(
      page.getByText(
        `Choose your name. ${title} will be selected at your table.`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText(/^ROOM [A-Z0-9]{6}$/)).toHaveCount(0);
    expect(mutations).toEqual([]);
    await page
      .getByRole("textbox", { name: "Your name" })
      .pressSequentially("Willow");
    await page
      .getByRole("button", { name: "Create my table →", exact: true })
      .click();
    await expect(
      page.getByRole("radio", { name: new RegExp(title) }),
    ).toBeChecked();
    const play = page.getByRole("button", {
      name: `Play ${title} →`,
      exact: true,
    });
    await expect(play).toBeInViewport({ ratio: 1 });
    if (title === "The Daily Mini") await expect(play).toBeEnabled();
    else await expect(play).toBeDisabled();
    await expect(
      page.getByText("Everyone’s welcome.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Crossword grid")).toHaveCount(0);
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]) {
  test(`first selection waits for form layout and survives delayed daily data at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    let releaseDaily = () => {};
    const mutations: string[] = [];
    await page.routeWebSocket(/^wss:\/\/[^/]+\.convex\.cloud\//, (socket) => {
      const server = socket.connectToServer();
      let held = true;
      const buffered: (string | Buffer)[] = [];
      server.onMessage((message) => {
        if (held) buffered.push(message);
        else socket.send(message);
      });
      socket.onMessage((message) => {
        try {
          const frame = JSON.parse(message.toString());
          if (frame.type === "Mutation") mutations.push(frame.udfPath);
        } catch {}
        server.send(message);
      });
      releaseDaily = () => {
        held = false;
        for (const message of buffered.splice(0)) socket.send(message);
      };
    });
    await page.goto("/");
    await expect(
      page.getByText("A FRESH MINI EVERY DAY · PACIFIC TIME", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start today’s mini", exact: true }),
    ).toHaveCount(0);
    for (const title of ["Word Relay", "Draw Together"]) {
      const card = page.getByTestId(
        `coming-soon-${title.toLowerCase().replace(/ /g, "-")}`,
      );
      await expect(card.getByText(title, { exact: true })).toBeVisible();
      await expect(
        card.getByText("COMING SOON", { exact: true }),
      ).toBeVisible();
      await expect(card.getByRole("button")).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: new RegExp(`Choose ${title}|Read ${title}|Play ${title}`),
        }),
      ).toHaveCount(0);
    }
    await page
      .getByRole("button", { name: "Choose Property Rush", exact: true })
      .click();
    await expectCreation(page, "Property Rush");
    releaseDaily();
    await expect(page.getByText(/^TODAY’S PUZZLE/)).toBeVisible();
    await expectCreation(page, "Property Rush");
    for (const title of [
      "Property Rush",
      "Hanabi",
      "The Daily Mini",
      "Property Rush",
    ]) {
      await page
        .getByRole("button", { name: `Choose ${title}`, exact: true })
        .click();
      await expectCreation(page, title);
    }
    await expect(page.getByText(/^ROOM [A-Z0-9]{6}$/)).toHaveCount(0);
    expect(mutations).toEqual([]);
    await page.screenshot({
      path: `test-results/selected-entry-${viewport.width}.png`,
    });
    await page
      .getByRole("button", { name: "Tabletop home", exact: true })
      .click();
    await page
      .getByTestId("coming-soon-draw-together")
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/coming-soon-${viewport.width}.png`,
    });
  });

  test(`persistent lobby action and compact crossword at ${viewport.width}`, async ({
    page,
  }) => {
    const actions: string[] = [];
    page.on("websocket", (socket) =>
      socket.on("framesent", (event) => {
        try {
          const frame = JSON.parse(event.payload.toString());
          if (frame.type === "Action") actions.push(frame.udfPath);
        } catch {}
      }),
    );
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Choose The Daily Mini", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Your name" }).fill("Fern");
    await page
      .getByRole("button", { name: "Create my table →", exact: true })
      .click();
    const play = page.getByRole("button", {
      name: "Play The Daily Mini →",
      exact: true,
    });
    await expect(play).toHaveCount(1);
    await expect(play).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("radio", { name: /Today/ })).toBeChecked();
    await expect(
      page.getByRole("radio", { name: /Word Relay|Draw Together/ }),
    ).toHaveCount(0);
    const top = await play.boundingBox();
    await page.getByRole("radio", { name: /Hanabi/ }).click();
    await expect(
      page.getByRole("button", { name: "Play Hanabi →", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "Play Hanabi →", exact: true }),
    ).toBeDisabled();
    await page.getByRole("radio", { name: /The Daily Mini/ }).click();
    await page
      .getByRole("button", { name: "Home", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(play).toBeInViewport({ ratio: 1 });
    const bottom = await play.boundingBox();
    expect(Math.abs(top!.y - bottom!.y)).toBeLessThan(1);
    const home = await page
      .getByRole("button", { name: "Home", exact: true })
      .boundingBox();
    expect(home!.y + home!.height).toBeLessThan(bottom!.y);
    await page.screenshot({
      path: `test-results/clarity-lobby-${viewport.width}.png`,
    });
    await play.click();
    await expect(
      page.getByRole("button", { name: "Game rules", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    const grid = page.getByLabel("Crossword grid", { exact: true });
    await expect(grid).toBeInViewport({ ratio: 1 });
    const board = await grid.boundingBox();
    expect(board!.y).toBeLessThan(230);
    expect(Math.abs(board!.width - board!.height)).toBeLessThan(1);
    const cell = page.getByRole("button", { name: /^Cell 1,/ });
    const square = await cell.boundingBox();
    expect(Math.abs(square!.width - square!.height)).toBeLessThan(1);
    expect(square!.width).toBeGreaterThan(50);
    await expect(page.getByText(/^\d+ ACROSS$/)).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `test-results/clarity-crossword-${viewport.width}.png`,
    });
    await page.getByRole("button", { name: /^Cell 2,/ }).tap();
    const keyboard = page.getByRole("textbox", {
      name: "Crossword letter input",
      exact: true,
    });
    await expect(keyboard).toBeFocused();
    await expect(keyboard).toBeInViewport({ ratio: 1 });
    await expect(page.getByText(/^\d+ ACROSS$/)).toBeInViewport({ ratio: 1 });
    await keyboard.pressSequentially("Z");
    await expect(
      page.getByRole("button", { name: /^Cell 2, Z/ }),
    ).toBeVisible();
    await keyboard.press("Backspace");
    await expect(
      page.getByRole("button", { name: /^Cell 2, empty/ }),
    ).toBeVisible();
    await expectKeikiBesideRules(page);
    await page
      .getByRole("button", { name: "Message Keiki", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Rules question", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "A pocket-sized crossword for the whole table. There is one shared grid and no hidden answers.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Back to rules", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Rules question", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Close rules", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Message Keiki", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Rules question", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close rules", exact: true })
      .click();
    await page.getByRole("button", { name: "Game rules", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Rules question", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Ask Keiki about the rules",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Ask Keiki about the rules", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Rules question", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Back to rules", exact: true })
      .click();
    await expect(
      page.getByText(
        "A pocket-sized crossword for the whole table. There is one shared grid and no hidden answers.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close rules", exact: true })
      .click();
    if (viewport.width === 390) {
      await page.setViewportSize({ width: 800, height: 900 });
      await expect(
        page.getByText("The Daily Mini", { exact: true }),
      ).toBeVisible();
      await expectKeikiBesideRules(page);
      await page
        .getByRole("button", { name: "Message Keiki", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Rules question", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Close rules", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Game rules", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Rules question", exact: true }),
      ).toHaveCount(0);
    }
    expect(actions).toEqual([]);
  });
}
