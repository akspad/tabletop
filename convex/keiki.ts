import { action, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { ConvexError, v } from 'convex/values';
import { member } from './tables';
import { propertyAdviceContext, propertyAdviceOptions, type PropertyAdvice } from '../src/games/propertyAdvice';

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

export const propertySnapshot = internalQuery({
  args: { secret: v.string(), code: v.string(), gameId: v.string(), expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const { table, user } = await member(ctx, args);
    if (table.gameType !== 'property' || table.phase !== 'playing') throw new ConvexError('Move advice is available only in a running Property Rush game.');
    if (table.gameId !== args.gameId || table.version !== args.expectedVersion) throw new ConvexError({ code: 'STALE_ADVICE', message: 'The table changed. Ask for a fresh suggestion.' });
    const options = propertyAdviceOptions(table.state, user._id);
    if (!options.length) throw new ConvexError('Wait for your turn or a request that needs your response.');
    return { options, context: propertyAdviceContext(table.state, user._id) };
  },
});

export const adviseProperty = action({
  args: { secret: v.string(), code: v.string(), gameId: v.string(), expectedVersion: v.number() },
  handler: async (ctx, args): Promise<PropertyAdvice> => {
    const snapshot = await ctx.runQuery(internal.keiki.propertySnapshot, args);
    const key = process.env.KEIKI_API_KEY;
    if (!key) throw new ConvexError('Keiki is not connected yet. You can keep playing normally.');
    await ctx.runMutation(internal.keiki.reserve, { secret: args.secret, code: args.code });
    let choice: number;
    let reason: string;
    try {
      const response = await fetch('https://onkeiki.com/api/v1/openai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          model: '0715075f-eefa-4cca-b9e2-4c8da17d483e', stream: false, reasoning_effort: 'none',
          response_format: { type: 'json_schema', json_schema: { name: 'property_move', strict: true, schema: {
            type: 'object', additionalProperties: false, required: ['choice', 'reason'], properties: {
              choice: { type: 'integer', enum: snapshot.options.map((_, index) => index) },
              reason: { type: 'string', minLength: 1, maxLength: 280 },
            },
          } } },
          messages: [{ role: 'user', content: JSON.stringify({
            mode: 'property_move_advice',
            instruction: 'Choose one offered legal move for the current player. Explain the strategic reason briefly, using only this snapshot. Do not invent hidden information or claim to execute the move.',
            snapshot: snapshot.context,
            moves: snapshot.options.map((option, index) => ({ choice: index, title: option.title })),
          }) }],
        }),
      });
      if (!response.ok) throw new Error('Provider unavailable');
      const result = await response.json();
      const content = result?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length > 2_000) throw new Error('Invalid advice');
      const recommendation = JSON.parse(content);
      if (!Number.isInteger(recommendation.choice) || !snapshot.options[recommendation.choice] || typeof recommendation.reason !== 'string' || !recommendation.reason.trim() || recommendation.reason.length > 280) throw new Error('Invalid advice');
      choice = recommendation.choice;
      reason = recommendation.reason.trim();
    } catch {
      throw new ConvexError('Keiki could not suggest a move right now. Your game is unchanged; you can keep playing normally.');
    }
    await ctx.runQuery(internal.keiki.propertySnapshot, args);
    return { ...snapshot.options[choice], reason, gameId: args.gameId, version: args.expectedVersion };
  },
});
