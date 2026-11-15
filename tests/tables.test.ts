import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { describe, expect, it, vi } from 'vitest';
import schema from '../convex/schema';
import { dailyDate, puzzles, scheduledPuzzle } from '../src/games/crossword';

const modules = import.meta.glob('../convex/**/*.ts');
const mutation = (name: string) => makeFunctionReference<'mutation'>(`tables:${name}`);
const query = (name: string) => makeFunctionReference<'query'>(`tables:${name}`);
const host = 'a'.repeat(64), friend = 'b'.repeat(64), outsider = 'c'.repeat(64);

async function room() {
  const t = convexTest(schema, modules);
  const created = await t.mutation(mutation('create'), { secret: host, name: 'Host' });
  const joined = await t.mutation(mutation('join'), { secret: friend, name: 'Friend', code: created.code });
  return { t, code: created.code as string, hostId: created.playerId as string, friendId: joined.playerId as string };
}

async function snapshot(t: any, code: string, secret = host) {
  return await t.query(query('get'), { secret, code });
}

async function start(t: any, code: string, gameType: string, actionId = 'start_game_1') {
  const table = await snapshot(t, code);
  await t.mutation(mutation('start'), { secret: host, code, gameType, actionId, expectedVersion: table.version });
  return await snapshot(t, code);
}

describe('authoritative private tables', () => {
  it('creates persistent seats; a room code never permits impersonation or reading a running game', async () => {
    const { t, code, hostId, friendId } = await room();
    const table = await snapshot(t, code);
    expect(table.players.map((p: any) => p.id)).toEqual([hostId, friendId]);
    expect(JSON.stringify(table)).not.toContain('secretHash');
    await expect(snapshot(t, code, outsider)).rejects.toThrow();
    await expect(t.mutation(mutation('start'), { secret: friend, code, gameType: 'crossword', actionId: 'not_the_host', expectedVersion: table.version })).rejects.toThrow('host');
    await start(t, code, 'crossword');
    await expect(t.mutation(mutation('join'), { secret: outsider, name: 'Late', code })).rejects.toThrow('running');
    expect(await t.mutation(mutation('join'), { secret: friend, name: 'Reconnect', code })).toMatchObject({ playerId: friendId, code });
    expect((await snapshot(t, code, friend)).players[1].name).toBe('Friend');
  });

  it('deduplicates retries, merges different cell edits, and rejects stale game actions', async () => {
    const { t, code } = await room();
    const table = await start(t, code, 'crossword');
    const request = { secret: host, code, gameId: table.gameId, expectedVersion: table.version, actionId: 'letter_retry_1', action: { type: 'letter', cell: 0, letter: 'G' } };
    const ack = await t.mutation(mutation('act'), request);
    await t.mutation(mutation('act'), { ...request, secret: friend, actionId: 'letter_other_1', action: { type: 'letter', cell: 1, letter: 'A' } });
    expect(await t.mutation(mutation('act'), request)).toEqual(ack);
    const after = await snapshot(t, code);
    expect(after.version).toBe(table.version + 2);
    expect(after.game.letters.slice(0, 2)).toEqual(['G', 'A']);
    await t.mutation(mutation('lobby'), { secret: host, code, actionId: 'back_to_lobby', expectedVersion: after.version });
    const rematch = await start(t, code, 'crossword', 'start_game_2');
    await expect(t.mutation(mutation('act'), { ...request, actionId: 'stale_letter_1' })).rejects.toThrow('earlier game');
    expect(rematch.game.letters[0]).toBe('');
  });

  it('finishes a shared crossword, records each participant, and keeps players when switching games', async () => {
    const { t, code, hostId, friendId } = await room();
    let table = await start(t, code, 'crossword');
    const puzzle = puzzles.find(p => p.id === table.game.puzzleId)!;
    const actions = [...puzzle.rows.join('')];
    for (const [cell, letter] of actions.entries()) {
      await t.mutation(mutation('act'), { secret: cell % 2 ? host : friend, code, gameId: table.gameId, actionId: `solve_cell_${cell}`, expectedVersion: table.version, action: { type: 'letter', cell, letter } });
    }
    table = await snapshot(t, code);
    expect(table.phase).toBe('finished');
    expect(table.result.summary).toContain('We solved');
    expect(await t.run(async ctx => await ctx.db.query('results').collect())).toHaveLength(1);
    expect(await t.run(async ctx => await ctx.db.query('completions').collect())).toHaveLength(2);
    expect((await t.query(query('daily'), { secret: host })).completed).toBe(true);
    expect((await t.query(query('daily'), { secret: friend })).completed).toBe(true);
    await t.mutation(mutation('lobby'), { secret: host, code, actionId: 'lobby_after_solve', expectedVersion: table.version });
    table = await start(t, code, 'hanabi', 'start_hanabi_1');
    expect(table.players.map((p: any) => p.id)).toEqual([hostId, friendId]);
    expect(table.phase).toBe('playing');
  });

  it('does not expose deck or private card faces in any player query and validates game counts', async () => {
    const { t, code } = await room();
    for (const [i, type] of ['hanabi', 'property'].entries()) {
      const table = await start(t, code, type, `start_private_${i}`);
      const safe = await snapshot(t, code, friend);
      expect(table.game).not.toHaveProperty('deck');
      expect(safe.game).not.toHaveProperty('deck');
      expect(JSON.stringify(table)).not.toContain('secretHash');
      await t.mutation(mutation('lobby'), { secret: host, code, actionId: `lobby_private_${i}`, expectedVersion: table.version });
    }
    const single = await t.mutation(mutation('create'), { secret: outsider, name: 'Solo' });
    await expect(t.mutation(mutation('start'), { secret: outsider, code: single.code, gameType: 'hanabi', actionId: 'invalid_solo_game', expectedVersion: 0 })).rejects.toThrow();
  });

  it('checks seat ownership before action retry lookup and rejects malformed intent', async () => {
    const { t, code } = await room();
    const table = await start(t, code, 'crossword');
    await expect(t.mutation(mutation('act'), { secret: outsider, code, gameId: table.gameId, actionId: 'start_game_1', expectedVersion: table.version, action: { type: 'letter', cell: 0, letter: 'G' } })).rejects.toThrow();
    await expect(t.mutation(mutation('act'), { secret: host, code, gameId: table.gameId, actionId: 'x', expectedVersion: table.version, action: { type: 'letter', cell: 0, letter: 'G' } })).rejects.toThrow('retry');
    await expect(t.mutation(mutation('create'), { secret: 'guess', name: 'Bad session' })).rejects.toThrow('invalid');
  });

  it('enforces card-game turn/version checks and retries without leaking the private hand', async () => {
    const { t, code, hostId, friendId } = await room();
    await t.mutation(mutation('create'), { secret: outsider, name: 'Another table' });
    await expect(snapshot(t, code, outsider)).rejects.toThrow('Join this table');
    let table = await start(t, code, 'hanabi');
    const friendView = await snapshot(t, code, friend);
    expect(table.game.hands[hostId].every((card: any) => !('color' in card) && !('number' in card))).toBe(true);
    expect(friendView.game.hands[friendId].every((card: any) => !('color' in card) && !('number' in card))).toBe(true);
    expect(friendView.game.hands[hostId].every((card: any) => typeof card.color === 'string' && typeof card.number === 'number')).toBe(true);
    await expect(t.mutation(mutation('act'), { secret: friend, code, gameId: table.gameId, actionId: 'out_of_turn_play', expectedVersion: table.version, action: { type: 'play', cardId: friendView.game.hands[friendId][0].id } })).rejects.toThrow('turn');
    const request = { secret: host, code, gameId: table.gameId, actionId: 'clue_retry_once', expectedVersion: table.version, action: table.game.legalActions.find((a: any) => a.type === 'clue') };
    await t.mutation(mutation('act'), request);
    await t.mutation(mutation('act'), request);
    const after = await snapshot(t, code);
    expect(after.version).toBe(table.version + 1);
    expect(after.game.clueTokens).toBe(7);
    await expect(t.mutation(mutation('act'), { ...request, secret: friend, actionId: 'stale_card_action' })).rejects.toThrow('table changed');
    await t.mutation(mutation('lobby'), { secret: host, code, actionId: 'switch_to_property', expectedVersion: after.version });
    table = await start(t, code, 'property', 'property_retry_start');
    const me = table.game.seats.find((seat: any) => seat.id === hostId);
    const other = table.game.seats.find((seat: any) => seat.id === friendId);
    expect(me.hand).toHaveLength(7);
    expect(other).not.toHaveProperty('hand');
    const bank = { secret: host, code, gameId: table.gameId, actionId: 'bank_retry_once', expectedVersion: table.version, action: { type: 'bank', cardId: me.hand[0].id } };
    await t.mutation(mutation('act'), bank);
    await t.mutation(mutation('act'), bank);
    table = await snapshot(t, code);
    expect(table.game.playsLeft).toBe(2);
    expect(table.game.seats.find((seat: any) => seat.id === hostId).bank).toHaveLength(1);
  });

  it('scopes completion to the Pacific date even when a prepared puzzle is repeated', async () => {
    const now = Date.parse('2026-11-18T20:00:00Z');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const { t, hostId } = await room();
      const puzzle = scheduledPuzzle(now);
      await t.run(async ctx => await ctx.db.insert('completions', { guestId: hostId, puzzleId: puzzle.id, elapsedMs: 5000, completedAt: now - 86400000 }));
      expect((await t.query(query('daily'), { secret: host, refreshDay: 'untrusted-client-date' })).completed).toBe(false);
      await t.run(async ctx => await ctx.db.insert('completions', { guestId: hostId, puzzleId: `${dailyDate(now)}:${puzzle.id}`, elapsedMs: 5000, completedAt: now }));
      expect((await t.query(query('daily'), { secret: host })).completed).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
});
