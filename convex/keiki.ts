import { action, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { ConvexError, v } from 'convex/values';
import { member } from './tables';

export const reserve = internalMutation({
  args: { secret: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const { user } = await member(ctx, args);
    const now = Date.now();
    const day = Math.floor(now / 86_400_000);
    const budgets = [];
    for (const [key, limit] of [[user._id, 20], ['all', 200]] as const) {
      const row = await ctx.db.query('helperBudgets').withIndex('by_key', q => q.eq('key', key)).unique();
      const count = row?.day === day ? row.count : 0;
      if (count >= limit) throw new ConvexError({ code: 'DAILY_LIMIT', message: 'The daily Keiki question limit is reached. Use the rules or practice tutorial.' });
      if (key === user._id && row && now - row.lastAt < 5_000) throw new ConvexError({
        code: 'COOLDOWN', message: 'Give Keiki a moment before your next question.', retryAfterMs: 5_000 - (now - row.lastAt),
      });
      budgets.push({ row, key, count });
    }
    for (const { row, key, count } of budgets) {
      const update = { key, day, count: count + 1, lastAt: now };
      if (row) await ctx.db.patch(row._id, update);
      else await ctx.db.insert('helperBudgets', update);
    }
  },
});

export const ask = action({
  args: {
    secret: v.string(), code: v.string(), question: v.string(),
    gameType: v.union(v.literal('crossword'), v.literal('hanabi'), v.literal('property')),
  },
  handler: async (ctx, args): Promise<string> => {
    const question = args.question.trim();
    if (!question || question.length > 300) throw new ConvexError('Ask a rules question using 1–300 characters.');
    if (/\b[a-f0-9]{64}\b/i.test(question)) throw new ConvexError('Do not include private session tokens in your question.');
    const key = process.env.KEIKI_API_KEY;
    if (!key) throw new ConvexError('Keiki is not connected yet. The rules and practice tutorials still work.');
    await ctx.runMutation(internal.keiki.reserve, { secret: args.secret, code: args.code });
    const game = { crossword: 'Daily Mini', hanabi: 'Hanabi', property: 'Property Rush' }[args.gameType];
    try {
      const response = await fetch('https://onkeiki.com/api/v1/openai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          model: '0715075f-eefa-4cca-b9e2-4c8da17d483e',
          stream: false,
          reasoning_effort: 'none',
          messages: [{ role: 'user', content: `Game: ${game}\nRules question: ${question}` }],
        }),
      });
      if (!response.ok) throw new Error('Provider unavailable');
      const result = await response.json();
      const answer = result?.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim() || answer.length > 4_000) throw new Error('Invalid answer');
      return answer.trim();
    } catch {
      throw new ConvexError('Keiki could not answer right now. Try again later, or use the rules and practice tutorial.');
    }
  },
});
