import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from '../convex/schema';

const modules = import.meta.glob('../convex/**/*.ts');
const ask = makeFunctionReference<'action'>('keiki:ask');
const create = makeFunctionReference<'mutation'>('tables:create');
const get = makeFunctionReference<'query'>('tables:get');
const secret = 'd'.repeat(64);

async function setup() {
  const t = convexTest(schema, modules);
  const seat = await t.mutation(create, { secret, name: 'Rule learner' });
  vi.stubEnv('KEIKI_API_KEY', 'unit-test-credential');
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Pay from your bank, not your properties.' } }] })));
  vi.stubGlobal('fetch', fetcher);
  const args = { secret, code: seat.code, gameType: 'property' as const, question: 'Can I pay rent with properties?' };
  return { t, seat, args, fetcher };
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('optional Keiki rules helper', () => {
  it('sends only the chosen game and explicit question, without changing the table', async () => {
    const { t, args, fetcher } = await setup();
    const before = await t.query(get, { secret, code: args.code });
    expect(await t.action(ask, args)).toBe('Pay from your bank, not your properties.');
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://onkeiki.com/api/v1/openai/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer unit-test-credential');
    expect(JSON.parse(options.body)).toEqual({
      model: '0715075f-eefa-4cca-b9e2-4c8da17d483e', stream: false, reasoning_effort: 'none',
      messages: [{ role: 'user', content: 'Game: Property Rush\nRules question: Can I pay rent with properties?' }],
    });
    for (const privateValue of [secret, args.code, before.playerId, 'Rule learner']) expect(options.body).not.toContain(privateValue);
    expect(await t.query(get, { secret, code: args.code })).toEqual(before);
    expect(await t.run(ctx => ctx.db.query('helperBudgets').collect())).toHaveLength(2);
  });

  it('rejects unknown sessions and nonmembers before any provider request or budget write', async () => {
    const { t, args, fetcher } = await setup();
    await expect(t.action(ask, { ...args, secret: 'e'.repeat(64) })).rejects.toThrow('seat');
    const other = await t.mutation(create, { secret: 'e'.repeat(64), name: 'Other table' });
    await expect(t.action(ask, { ...args, code: other.code })).rejects.toThrow('Join this table');
    expect(fetcher).not.toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.query('helperBudgets').collect())).toHaveLength(0);
  });

  it.each(['', '  ', 'x'.repeat(301), `My token is ${secret}`])('rejects an invalid or credential-bearing question', async question => {
    const { t, args, fetcher } = await setup();
    await expect(t.action(ask, { ...args, question })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps local rules usable when Keiki is unconfigured', async () => {
    const { t, args, fetcher } = await setup();
    vi.stubEnv('KEIKI_API_KEY', '');
    await expect(t.action(ask, args)).rejects.toThrow('rules and practice tutorials still work');
    expect(fetcher).not.toHaveBeenCalled();
    expect((await t.query(get, { secret, code: args.code })).phase).toBe('lobby');
  });

  it('enforces a server-side cooldown', async () => {
    const { t, args, fetcher } = await setup();
    await t.action(ask, args);
    try {
      await t.action(ask, args);
      throw new Error('Expected the server cooldown');
    } catch (failure: any) {
      const data = JSON.parse(JSON.parse(failure.data));
      expect(data.code).toBe('COOLDOWN');
      expect(data.message).toBe('Give Keiki a moment before your next question.');
      expect(data.retryAfterMs).toBeGreaterThan(0);
      expect(data.retryAfterMs).toBeLessThanOrEqual(5_000);
    }
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('caps a guest at 20 questions each UTC day and resets on a new day', async () => {
    const { t, args, seat, fetcher } = await setup();
    const now = Date.now();
    const day = Math.floor(now / 86_400_000);
    await t.run(ctx => ctx.db.insert('helperBudgets', { key: seat.playerId, day, count: 20, lastAt: now - 10_000 }));
    await expect(t.action(ask, args)).rejects.toThrow('daily Keiki question limit');
    expect(fetcher).not.toHaveBeenCalled();
    vi.spyOn(Date, 'now').mockReturnValue((day + 1) * 86_400_000 + 10_000);
    expect(await t.action(ask, args)).toContain('bank');
    const row = await t.run(ctx => ctx.db.query('helperBudgets').withIndex('by_key', q => q.eq('key', seat.playerId)).unique());
    expect(row?.count).toBe(1);
  });

  it('enforces the deployment-wide daily cost cap without partially reserving a guest', async () => {
    const { t, args, fetcher } = await setup();
    await t.run(ctx => ctx.db.insert('helperBudgets', { key: 'all', day: Math.floor(Date.now() / 86_400_000), count: 200, lastAt: Date.now() }));
    await expect(t.action(ask, args)).rejects.toThrow('daily Keiki question limit');
    expect(fetcher).not.toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.query('helperBudgets').collect())).toHaveLength(1);
  });

  it.each([
    () => Promise.resolve(new Response('private provider diagnostic', { status: 503 })),
    () => Promise.resolve(new Response('not json')),
    () => Promise.resolve(new Response(JSON.stringify({ choices: [] }))),
    () => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'x'.repeat(4_001) } }] }))),
    () => Promise.reject(new Error('private provider timeout diagnostic')),
  ])('returns a safe fallback on upstream failure, never provider diagnostics', async response => {
    const { t, args, fetcher } = await setup();
    fetcher.mockImplementation(response);
    await expect(t.action(ask, args)).rejects.toThrow('Keiki could not answer right now');
    expect((await t.query(get, { secret, code: args.code })).phase).toBe('lobby');
  });
});
