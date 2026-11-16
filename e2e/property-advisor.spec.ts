import { expect, test, type Browser, type Page } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api, type Table } from '../src/api';
import type { Session } from '../src/session';
import type { Action } from '../src/games/property';

async function setup(page: Page, browser: Browser, baseURL: string | undefined, title = 'Property Rush', start = true) {
  let backend = '';
  page.on('websocket', socket => {
    const url = new URL(socket.url());
    if (url.hostname.endsWith('.convex.cloud')) backend = `https://${url.host}`;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a table', exact: false }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Hazel');
  await page.getByRole('button', { name: 'Create my table →', exact: true }).click();
  const code = (await page.getByText(/^ROOM [A-Z0-9]{6}$/).innerText()).replace('ROOM ', '');
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const guest = await guestContext.newPage();
  await guest.goto(`${baseURL}/?code=${code}`);
  await guest.getByRole('textbox', { name: 'Your name' }).fill('Cedar');
  await guest.getByRole('button', { name: 'Join the table →', exact: true }).click();
  await expect(page.getByText('Cedar', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(title) }).click();
  if (start) {
    await page.getByRole('button', { name: `Play ${title} →`, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Message Keiki', exact: true })).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Message Keiki', exact: true })).toBeVisible();
  }
  const pages = [page, guest];
  const sessions: Session[] = await Promise.all(pages.map(client => client.evaluate(() => JSON.parse(localStorage.getItem('tabletop.fresh.session.v1')!))));
  const client = new ConvexHttpClient(backend);
  const read = async (index: number): Promise<Table> => client.query(api.get, { secret: sessions[index].secret, code });
  const move = async (index: number, table: Table, action: Action) => client.mutation(api.act, {
    secret: sessions[index].secret, code, gameId: table.gameId, expectedVersion: table.version, actionId: crypto.randomUUID(), action,
  });
  return { pages, sessions, guestContext, read, move };
}

function watchCalls(page: Page) {
  const calls: string[] = [];
  page.on('websocket', socket => {
    socket.on('framesent', frame => {
      try {
        const message = JSON.parse(frame.payload.toString());
        if (message.type === 'Action' || message.type === 'Mutation') calls.push(message.udfPath);
      } catch {}
    });
  });
  page.on('request', request => {
    if (request.url().endsWith('/api/action') && request.postData()?.includes('keiki:adviseProperty')) calls.push('keiki:adviseProperty');
  });
  return calls;
}

test('opening the live Property advisor sends nothing and leaves rules questions available', async ({ page, browser, baseURL }) => {
  const calls = watchCalls(page);
  const room = await setup(page, browser, baseURL);
  try {
    const original = await room.read(0);
    await page.getByRole('button', { name: 'Message Keiki', exact: true }).click();
    const card = page.getByTestId('property-advisor');
    await expect(card.getByRole('button', { name: 'Suggest a move', exact: true })).toBeEnabled();
    await expect(page.getByRole('textbox', { name: 'Rules question' })).toBeEditable();
    expect(calls.filter(call => call === 'keiki:adviseProperty' || call === 'tables:act' || call === 'keiki:ask')).toEqual([]);
    expect(await room.read(0)).toEqual(original);
    await card.screenshot({ path: 'test-results/property-advisor-opt-in.png' });
  } finally {
    await room.guestContext.close();
  }
});

test('a waiting player gets a friendly response without advice or a game change', async ({ page, browser, baseURL }) => {
  const room = await setup(page, browser, baseURL);
  try {
    const original = await room.read(0);
    const waiting = room.pages[room.sessions.findIndex(session => session.seat!.playerId !== original.game.turnPlayerId)];
    await waiting.getByRole('button', { name: 'Message Keiki', exact: true }).click();
    await waiting.getByRole('button', { name: 'Suggest a move', exact: true }).click();
    await expect(waiting.getByRole('alert')).toHaveText('Wait for your turn or a request that needs your response.');
    await expect(waiting.getByTestId('property-advice')).toHaveCount(0);
    await expect(waiting.getByRole('button', { name: 'Confirm move', exact: true })).toHaveCount(0);
    expect(await room.read(0)).toEqual(original);
  } finally {
    await room.guestContext.close();
  }
});

test('Property advice is opt-in and only explicit confirmation plays one move', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const hostCalls = watchCalls(page);
  const room = await setup(page, browser, baseURL);
  try {
    const guestCalls = watchCalls(room.pages[1]);
    await room.pages[1].reload();
    const original = await room.read(0);
    const actor = room.sessions.findIndex(session => session.seat!.playerId === original.game.turnPlayerId);
    const actorPage = room.pages[actor];
    const calls = actor === 0 ? hostCalls : guestCalls;
    await actorPage.getByRole('button', { name: 'Message Keiki', exact: true }).click();
    const card = actorPage.getByTestId('property-advisor');
    await expect(card).toBeVisible();
    await expect(card.getByText('Each suggestion shares your Property Rush hand and the public board with Keiki, never opponents’ hands or the deck. Keiki stores requests.', { exact: true })).toBeVisible();
    await expect(actorPage.getByRole('textbox', { name: 'Rules question' })).toBeEditable();
    expect(calls.filter(call => call === 'keiki:adviseProperty' || call === 'tables:act')).toEqual([]);
    expect(await room.read(0)).toEqual(original);
    await card.getByRole('button', { name: 'Suggest a move', exact: true }).click();
    const advice = actorPage.getByTestId('property-advice');
    await expect(advice).toBeVisible({ timeout: 60_000 });
    expect((await advice.innerText()).trim().length).toBeGreaterThan(40);
    await expect(advice.getByText('AI can be wrong. Review the move before playing.', { exact: true })).toBeVisible();
    expect(await room.read(0)).toEqual(original);
    expect(calls.filter(call => call === 'tables:act')).toHaveLength(0);
    await advice.screenshot({ path: 'test-results/property-advisor-suggestion.png' });
    await advice.getByRole('button', { name: 'Use this move', exact: true }).click();
    await expect(advice.getByText('Play this suggested move?', { exact: true })).toBeVisible();
    await advice.getByRole('button', { name: 'Keep thinking', exact: true }).click();
    await expect(advice.getByRole('button', { name: 'Confirm move', exact: true })).toHaveCount(0);
    expect(await room.read(0)).toEqual(original);
    await advice.getByRole('button', { name: 'Use this move', exact: true }).click();
    await advice.screenshot({ path: 'test-results/property-advisor-confirmation.png' });
    await advice.getByRole('button', { name: 'Confirm move', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect.poll(async () => (await room.read(0)).version).toBe(original.version + 1);
    await expect(advice).toHaveCount(0);
    await expect(card.getByText('Move played.', { exact: true })).toBeVisible();
    expect(calls.filter(call => call === 'keiki:adviseProperty')).toHaveLength(1);
    expect(calls.filter(call => call === 'tables:act')).toHaveLength(1);
  } finally {
    await room.guestContext.close();
  }
});

test('a live version change removes advice and its pending confirmation', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const room = await setup(page, browser, baseURL);
  try {
    const original = await room.read(0);
    const actor = room.sessions.findIndex(session => session.seat!.playerId === original.game.turnPlayerId);
    const actorPage = room.pages[actor];
    await actorPage.getByRole('button', { name: 'Message Keiki', exact: true }).click();
    await actorPage.getByRole('button', { name: 'Suggest a move', exact: true }).click();
    const advice = actorPage.getByTestId('property-advice');
    await expect(advice).toBeVisible({ timeout: 60_000 });
    await advice.getByRole('button', { name: 'Use this move', exact: true }).click();
    const own = await room.read(actor);
    const me = own.game.seats.find((seat: any) => seat.id === own.playerId);
    await room.move(actor, own, { type: 'bank', cardId: me.hand[0].id });
    await expect(actorPage.getByText('The table changed. Ask for a fresh suggestion.', { exact: true })).toBeVisible();
    await expect(advice).toHaveCount(0);
    await expect(actorPage.getByRole('button', { name: 'Confirm move', exact: true })).toHaveCount(0);
    expect((await room.read(0)).version).toBe(original.version + 1);
    await actorPage.getByTestId('property-advisor').screenshot({ path: 'test-results/property-advisor-stale.png' });
  } finally {
    await room.guestContext.close();
  }
});

test('an in-flight response cannot restore advice for an older version', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const room = await setup(page, browser, baseURL);
  try {
    let requestId: number | undefined;
    let release: (() => void) | undefined;
    await page.routeWebSocket(/^wss:\/\/[^/]+\.convex\.cloud\//, socket => {
      const server = socket.connectToServer();
      socket.onMessage(message => {
        const frame = JSON.parse(message.toString());
        if (frame.type === 'Action' && frame.udfPath === 'keiki:adviseProperty') requestId = frame.requestId;
        server.send(message);
      });
      server.onMessage(message => {
        const frame = JSON.parse(message.toString());
        if (frame.type === 'ActionResponse' && frame.requestId === requestId) release = () => socket.send(message);
        else socket.send(message);
      });
    });
    await page.reload();
    const original = await room.read(0);
    expect(original.game.turnPlayerId).toBe(original.playerId);
    await page.getByRole('button', { name: 'Message Keiki', exact: true }).click();
    await page.getByRole('button', { name: 'Suggest a move', exact: true }).click();
    await expect.poll(() => Boolean(release), { timeout: 60_000 }).toBe(true);
    const me = original.game.seats.find((seat: any) => seat.id === original.playerId);
    await room.move(0, original, { type: 'bank', cardId: me.hand[0].id });
    await expect(page.getByText('The table changed. Ask for a fresh suggestion.', { exact: true })).toBeVisible();
    release!();
    await expect(page.getByText('Keiki is considering your moves. Nothing is played automatically.', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('property-advice')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirm move', exact: true })).toHaveCount(0);
    expect((await room.read(0)).version).toBe(original.version + 1);
  } finally {
    await room.guestContext.close();
  }
});

for (const title of ['Hanabi', 'The Daily Mini']) {
  test(`live ${title} keeps Keiki rules-only`, async ({ page, browser, baseURL }) => {
    const room = await setup(page, browser, baseURL, title);
    try {
      await page.getByRole('button', { name: 'Message Keiki', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Rules question' })).toBeEditable();
      await expect(page.getByTestId('property-advisor')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Suggest a move', exact: true })).toHaveCount(0);
    } finally {
      await room.guestContext.close();
    }
  });
}

test('Property lobby keeps Keiki rules-only', async ({ page, browser, baseURL }) => {
  const room = await setup(page, browser, baseURL, 'Property Rush', false);
  try {
    await page.getByRole('button', { name: 'Read Property Rush rules', exact: true }).click();
    await page.getByRole('button', { name: 'Ask Keiki about the rules', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Rules question' })).toBeEditable();
    await expect(page.getByTestId('property-advisor')).toHaveCount(0);
  } finally {
    await room.guestContext.close();
  }
});
