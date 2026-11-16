import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from '../convex/schema';
import { apply } from '../src/games/property';

const modules = import.meta.glob('../convex/**/*.ts');
const advisor = makeFunctionReference<'action'>('keiki:adviseProperty');
const mutation = (name: string) => makeFunctionReference<'mutation'>(`tables:${name}`);
const get = makeFunctionReference<'query'>('tables:get');
const secret = 'a'.repeat(64), friend = 'b'.repeat(64);

async function setup(gameType = 'property') {
  const t = convexTest(schema, modules);
  const seat = await t.mutation(mutation('create'), { secret, name: 'Private host name' });
  await t.mutation(mutation('join'), { secret: friend, code: seat.code, name: 'Private guest name' });
  const lobby = await t.query(get, { secret, code: seat.code });
  await t.mutation(mutation('start'), { secret, code: seat.code, gameType, actionId: 'start_advisor_game', expectedVersion: lobby.version });
  const before = await t.query(get, { secret, code: seat.code });
  const args = { secret, code: seat.code, gameId: before.gameId, expectedVersion: before.version };
  vi.stubEnv('KEIKI_API_KEY', 'unit-test-key');
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ choice: 0, reason: 'This advances your position without changing the rules.' }) } }] })));
  vi.stubGlobal('fetch', fetcher);
  return { t, args, before, fetcher };
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('opt-in live Property Rush advisor', () => {
  it('returns a legal version-bound suggestion without playing or sending identities and hidden data', async () => {
    const { t, args, before, fetcher } = await setup();
    const result = await t.action(advisor, args);
    expect(result.gameId).toBe(args.gameId);
    expect(result.version).toBe(args.expectedVersion);
    expect(result.title.length).toBeGreaterThan(0);
    const stored = await t.run(ctx => ctx.db.query('tables').withIndex('by_code', q => q.eq('code', args.code)).unique());
    expect(() => apply(stored!.state, before.playerId, result.action)).not.toThrow();
    expect(await t.query(get, { secret, code: args.code })).toEqual(before);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    const payload = JSON.parse(body.messages[0].content);
    expect(payload.mode).toBe('property_move_advice');
    expect(payload.snapshot.yourHand).toHaveLength(before.game.seats[0].hand.length);
    expect(payload.moves.every((move: any) => Object.keys(move).sort().join(',') === 'choice,title')).toBe(true);
    const serialized = JSON.stringify(body);
    for (const value of [secret, friend, args.code, args.gameId, before.playerId, 'Private host name', 'Private guest name', 'randomState']) expect(serialized.includes(value)).toBe(false);
    for (const seat of payload.snapshot.board) expect(seat).not.toHaveProperty('hand');
    await t.mutation(mutation('act'), { ...args, actionId: 'explicit_confirm_1', action: result.action });
    expect((await t.query(get, { secret, code: args.code })).version).toBe(before.version + 1);
    await expect(t.mutation(mutation('act'), { ...args, actionId: 'explicit_confirm_2', action: result.action })).rejects.toThrow('table changed');
  });

  it('rejects off-turn players, unknown sessions and stale versions without calling Keiki', async () => {
    const { t, args, fetcher } = await setup();
    await expect(t.action(advisor, { ...args, secret: friend })).rejects.toThrow('Wait for your turn');
    await expect(t.action(advisor, { ...args, secret: 'c'.repeat(64) })).rejects.toThrow('seat');
    await expect(t.action(advisor, { ...args, expectedVersion: args.expectedVersion - 1 })).rejects.toThrow('table changed');
    await expect(t.action(advisor, { ...args, gameId: 'old-game' })).rejects.toThrow('table changed');
    expect(fetcher).not.toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.query('helperBudgets').collect())).toHaveLength(0);
  });

  it.each(['hanabi', 'crossword'])('does not enable a live advisor for %s', async gameType => {
    const { t, args, fetcher } = await setup(gameType);
    await expect(t.action(advisor, args)).rejects.toThrow('only in a running Property Rush');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('discards a response when a legal move occurs while Keiki is thinking', async () => {
    const { t, args, before, fetcher } = await setup();
    fetcher.mockImplementation(async () => {
      await t.mutation(mutation('act'), { ...args, actionId: 'manual_during_advice', action: { type: 'endTurn' } });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ choice: 0, reason: 'Old position.' }) } }] }));
    });
    await expect(t.action(advisor, args)).rejects.toThrow('table changed');
    expect((await t.query(get, { secret, code: args.code })).version).toBe(before.version + 1);
  });

  it.each([
    'not json', JSON.stringify({ choice: -1, reason: 'Invalid index.' }),
    JSON.stringify({ choice: 1_000, reason: 'Invented action.' }), JSON.stringify({ choice: '0', reason: 'Wrong type.' }),
    JSON.stringify({ choice: 0, reason: '' }), JSON.stringify({ choice: 0, reason: 'x'.repeat(281) }),
  ])('rejects malformed or unoffered model recommendations without mutating the game', async content => {
    const { t, args, before, fetcher } = await setup();
    fetcher.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] })));
    await expect(t.action(advisor, args)).rejects.toThrow('could not suggest a move');
    expect(await t.query(get, { secret, code: args.code })).toEqual(before);
  });

  it('keeps the normal game usable on provider failure or missing configuration', async () => {
    const { t, args, before, fetcher } = await setup();
    vi.stubEnv('KEIKI_API_KEY', '');
    await expect(t.action(advisor, args)).rejects.toThrow('keep playing normally');
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv('KEIKI_API_KEY', 'unit-test-key');
    fetcher.mockRejectedValue(new Error('private upstream diagnostics'));
    await expect(t.action(advisor, args)).rejects.toThrow('Your game is unchanged');
    expect(await t.query(get, { secret, code: args.code })).toEqual(before);
  });
});
