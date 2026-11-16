import { test, expect } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../src/api";

test("live rent response and payment scroll into view from a private hand", async ({
  page,
  browser,
  baseURL,
}) => {
  let backend = "";
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (url.hostname.endsWith(".convex.cloud")) backend = `https://${url.host}`;
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Start a table/ }).click();
  await page.getByRole("textbox", { name: "Your name" }).fill("Hazel");
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
  await guest.getByRole("textbox", { name: "Your name" }).fill("Cedar");
  await guest.getByRole("button", { name: "Join the table →" }).click();
  await expect(page.getByText("Cedar", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /Property Rush/ }).click();
  await page.getByRole("button", { name: "Play Property Rush →" }).click();
  await expect(guest.getByText("Your hand", { exact: true })).toBeVisible();
  const sessions = await Promise.all(
    [page, guest].map(async (client) =>
      JSON.parse(
        (await client.evaluate(() =>
          localStorage.getItem("tabletop.fresh.session.v1"),
        ))!,
      ),
    ),
  );
  const client = new ConvexHttpClient(backend);
  const move = async (index: number, table: any, action: any) =>
    client.mutation(api.act, {
      secret: sessions[index].secret,
      code,
      gameId: table.gameId,
      expectedVersion: table.version,
      actionId: crypto.randomUUID(),
      action,
    });
  let actor = -1;
  for (let step = 0; step < 180; step++) {
    const table = await client.query(api.get, {
      secret: sessions[0].secret,
      code,
    });
    const current = sessions.findIndex(
      (session) => session.seat.playerId === table.game.turnPlayerId,
    );
    const own = await client.query(api.get, {
      secret: sessions[current].secret,
      code,
    });
    const me = own.game.seats.find((seat: any) => seat.id === own.playerId);
    const rival = own.game.seats.find((seat: any) => seat.id !== own.playerId);
    const hasProperty = Object.values(me.properties).some(
      (cards: any) => cards.length > 0,
    );
    if (own.game.phase === "discard") {
      await move(current, own, {
        type: "discard",
        cardIds: me.hand
          .slice(0, me.hand.length - 7)
          .map((card: any) => card.id),
      });
    } else if (own.game.phase === "play" && own.game.playsLeft > 0) {
      if (
        hasProperty &&
        me.hand.some((card: any) => card.kind === "rent") &&
        rival.bank.reduce((sum: number, card: any) => sum + card.value, 0) > 2
      ) {
        actor = current;
        break;
      }
      const property = me.hand.find((card: any) => card.kind === "property");
      if (!hasProperty && property)
        await move(current, own, { type: "place", cardId: property.id });
      else {
        const card =
          me.hand.find((card: any) => card.kind !== "rent") ?? me.hand[0];
        if (card) await move(current, own, { type: "bank", cardId: card.id });
        else await move(current, own, { type: "endTurn" });
      }
    } else await move(current, own, { type: "endTurn" });
  }
  expect(actor).not.toBe(-1);
  const actorPage = [page, guest][actor],
    targetPage = [page, guest][1 - actor];
  await targetPage
    .getByText("Your hand", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    targetPage.getByRole("button", { name: "Game rules" }),
  ).not.toBeInViewport();
  await actorPage
    .getByRole("button", { name: "Rent 2, bank value 1", exact: true })
    .first()
    .click();
  await actorPage
    .getByRole("button", { name: actor === 0 ? "Cedar" : "Hazel", exact: true })
    .click();
  await actorPage
    .getByRole("button", { name: "Request rent · 2", exact: true })
    .click();
  await expect(
    targetPage.getByRole("button", { name: "Accept", exact: true }),
  ).toBeInViewport();
  await targetPage.screenshot({
    path: "test-results/property-response-mobile.png",
    fullPage: true,
  });
  await targetPage.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    targetPage.getByText("Choose bank cards to pay 2", { exact: true }),
  ).toBeInViewport();
  await targetPage.screenshot({
    path: "test-results/property-payment-mobile.png",
    fullPage: true,
  });
  await context.close();
});
