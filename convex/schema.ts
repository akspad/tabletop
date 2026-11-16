import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  helperBudgets: defineTable({ key: v.string(), day: v.number(), count: v.number(), lastAt: v.number() }).index('by_key', ['key']),
  webAssets: defineTable({ path: v.string(), storageId: v.id('_storage'), contentType: v.string(), immutable: v.boolean() }).index('by_path', ['path']),
  guests: defineTable({ secretHash: v.string(), createdAt: v.number() }).index('by_secret', ['secretHash']),
  tables: defineTable({
    code: v.string(), hostId: v.string(),
    players: v.array(v.object({ id: v.string(), name: v.string(), color: v.string() })),
    phase: v.union(v.literal('lobby'), v.literal('playing'), v.literal('finished')),
    gameType: v.union(v.literal('crossword'), v.literal('hanabi'), v.literal('property')),
    state: v.any(), gameId: v.string(), version: v.number(), createdAt: v.number(), updatedAt: v.number(),
  }).index('by_code', ['code']),
  actions: defineTable({ tableId: v.id('tables'), actorId: v.string(), actionId: v.string(), version: v.number() })
    .index('by_action', ['tableId', 'actorId', 'actionId']),
  results: defineTable({ tableId: v.id('tables'), gameType: v.string(), participants: v.array(v.string()), result: v.any(), completedAt: v.number() }),
  completions: defineTable({ guestId: v.string(), puzzleId: v.string(), elapsedMs: v.number(), completedAt: v.number() })
    .index('by_guest_puzzle', ['guestId', 'puzzleId']),
});
