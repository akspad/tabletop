import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import * as crossword from '../src/games/crossword';
import * as hanabi from '../src/games/hanabi';
import * as property from '../src/games/property';

const credentials = { secret: v.string(), code: v.string() };
const intent = { ...credentials, actionId: v.string(), expectedVersion: v.number() };
const gameType = v.union(v.literal('crossword'), v.literal('hanabi'), v.literal('property'));
const colors = ['#235d47', '#98503a', '#515a98', '#996c14', '#8c487b'];

async function hash(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Your guest session is invalid. Reopen the app.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

async function guest(ctx: any, secret: string, create = false) {
  const secretHash = await hash(secret);
  const existing = await ctx.db.query('guests').withIndex('by_secret', (q: any) => q.eq('secretHash', secretHash)).unique();
  if (existing) return existing;
  if (!create) throw new Error('Your seat was not found. Join the table again.');
  const id = await ctx.db.insert('guests', { secretHash, createdAt: Date.now() });
  return await ctx.db.get(id);
}

function cleanName(name: string) {
  const value = name.trim().replace(/[\u0000-\u001f]/g, '');
  if (!value || value.length > 24) throw new Error('Use a display name between 1 and 24 characters.');
  return value;
}

async function tableByCode(ctx: any, code: string) {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(clean)) throw new Error('Enter a six-character table code.');
  const table = await ctx.db.query('tables').withIndex('by_code', (q: any) => q.eq('code', clean)).unique();
  if (!table) throw new Error('No table has that code. Check it and try again.');
  return table;
}

async function member(ctx: any, args: {secret: string; code: string}) {
  const user = await guest(ctx, args.secret);
  const table = await tableByCode(ctx, args.code);
  if (!table.players.some((p: any) => p.id === user._id)) throw new Error('Join this table before opening it.');
  return { table, user };
}

async function repeated(ctx: any, table: any, actorId: string, args: any) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(args.actionId)) throw new Error('This action has no valid retry identifier.');
  return await ctx.db.query('actions').withIndex('by_action', (q: any) => q.eq('tableId', table._id).eq('actorId', actorId).eq('actionId', args.actionId)).unique();
}

function current(table: any, expected: number) {
  if (table.version !== expected) throw new Error('The table changed. Please try your action again.');
}

async function write(ctx: any, table: any, actorId: string, actionId: string, change: any) {
  const version = table.version + 1;
  await ctx.db.patch(table._id, { ...change, version, updatedAt: Date.now() });
  await ctx.db.insert('actions', { tableId: table._id, actorId, actionId, version });
  return { version };
}

export const create = mutation({
  args: { secret: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const name = cleanName(args.name);
    const user = await guest(ctx, args.secret, true);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      if (!await ctx.db.query('tables').withIndex('by_code', q => q.eq('code', code)).unique()) break;
      code = '';
    }
    if (!code) throw new Error('Please try creating your table again.');
    await ctx.db.insert('tables', { code, hostId: user._id, players: [{ id: user._id, name, color: colors[0] }], phase: 'lobby', gameType: 'crossword', state: null, gameId: '', version: 0, createdAt: Date.now(), updatedAt: Date.now() });
    return { code, playerId: user._id };
  },
});

export const join = mutation({
  args: { ...credentials, name: v.string() },
  handler: async (ctx, args) => {
    const name = cleanName(args.name);
    const table = await tableByCode(ctx, args.code);
    const user = await guest(ctx, args.secret, true);
    const existing = table.players.find((p: any) => p.id === user._id);
    if (existing) return { code: table.code, playerId: user._id };
    if (table.phase !== 'lobby') throw new Error('A game is running. New seats open when the host returns to the lobby.');
    if (table.players.length >= 5) throw new Error('This table already has five players.');
    await ctx.db.patch(table._id, { players: [...table.players, { id: user._id, name, color: colors[table.players.length] }], version: table.version + 1, updatedAt: Date.now() });
    return { code: table.code, playerId: user._id };
  },
});

export const get = query({
  args: credentials,
  handler: async (ctx, args) => {
    const { table, user } = await member(ctx, args);
    let game = null;
    if (table.state) game = table.gameType === 'crossword' ? crossword.view(table.state, user._id) : table.gameType === 'hanabi' ? hanabi.view(table.state, user._id) : property.view(table.state, user._id);
    return { code: table.code, playerId: user._id, hostId: table.hostId, players: table.players, phase: table.phase, gameType: table.gameType, gameId: table.gameId, game, version: table.version, result: table.state?.result ?? null };
  },
});

export const daily = query({
  args: { secret: v.string(), refreshDay: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const secretHash = await hash(args.secret);
    const user = await ctx.db.query('guests').withIndex('by_secret', q => q.eq('secretHash', secretHash)).unique();
    const puzzle = crossword.scheduledPuzzle(Date.now());
    const date = crossword.dailyDate(Date.now());
    const completion = user ? await ctx.db.query('completions').withIndex('by_guest_puzzle', q => q.eq('guestId', user._id).eq('puzzleId', `${date}:${puzzle.id}`)).first() : null;
    const legacy = !completion && user ? await ctx.db.query('completions').withIndex('by_guest_puzzle', q => q.eq('guestId', user._id).eq('puzzleId', puzzle.id)).first() : null;
    return { date, puzzleId: puzzle.id, title: puzzle.title, completed: !!completion || (!!legacy && crossword.dailyDate(legacy.completedAt) === date), timezone: 'America/Los_Angeles', puzzles: crossword.puzzles.map(p => ({ id: p.id, title: p.title })) };
  },
});

export const start = mutation({
  args: { ...intent, gameType, puzzleId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { table, user } = await member(ctx, args);
    const previous = await repeated(ctx, table, user._id, args);
    if (previous) return { version: previous.version };
    if (table.hostId !== user._id) throw new Error('Only the host can start a game.');
    current(table, args.expectedVersion);
    if (table.phase === 'playing') throw new Error('Finish this game or return to the lobby first.');
    const players = table.players.map((p: any) => p.id);
    const state = args.gameType === 'crossword' ? crossword.create(players, args.puzzleId ?? crossword.scheduledPuzzle(Date.now()).id, Date.now()) : args.gameType === 'hanabi' ? hanabi.create(players) : property.create(players);
    return await write(ctx, table, user._id, args.actionId, { gameType: args.gameType, gameId: args.actionId, state, phase: 'playing' });
  },
});

export const act = mutation({
  args: { ...intent, gameId: v.string(), action: v.any() },
  handler: async (ctx, args) => {
    const { table, user } = await member(ctx, args);
    const previous = await repeated(ctx, table, user._id, args);
    if (previous) return { version: previous.version };
    if (table.phase !== 'playing' || !table.state) throw new Error('There is no running game at this table.');
    if (args.gameId !== table.gameId) throw new Error('That action belonged to an earlier game.');
    if (table.gameType !== 'crossword') current(table, args.expectedVersion);
    const state = table.gameType === 'crossword' ? crossword.apply(table.state, user._id, args.action, Date.now()) : table.gameType === 'hanabi' ? hanabi.apply(table.state, user._id, args.action) : property.apply(table.state, user._id, args.action);
    const finished = state.status === 'finished';
    if (finished) {
      await ctx.db.insert('results', { tableId: table._id, gameType: table.gameType, participants: state.players, result: state.result, completedAt: Date.now() });
      if (table.gameType === 'crossword') {
        const mini = state as crossword.State;
        for (const guestId of mini.players) {
          const completionId = `${mini.date}:${mini.puzzleId}`;
          const existing = await ctx.db.query('completions').withIndex('by_guest_puzzle', q => q.eq('guestId', guestId).eq('puzzleId', completionId)).first();
          if (!existing) await ctx.db.insert('completions', { guestId, puzzleId: completionId, elapsedMs: mini.elapsedMs!, completedAt: Date.now() });
        }
      }
    }
    return await write(ctx, table, user._id, args.actionId, { state, phase: finished ? 'finished' : 'playing' });
  },
});

export const lobby = mutation({
  args: intent,
  handler: async (ctx, args) => {
    const { table, user } = await member(ctx, args);
    const previous = await repeated(ctx, table, user._id, args);
    if (previous) return { version: previous.version };
    if (table.hostId !== user._id) throw new Error('Only the host can return everyone to the lobby.');
    current(table, args.expectedVersion);
    return await write(ctx, table, user._id, args.actionId, { phase: 'lobby', state: null });
  },
});
