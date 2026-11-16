import { makeFunctionReference } from "convex/server";
export const api = {
  askRules: makeFunctionReference<"action">("keiki:ask"),
  adviseProperty: makeFunctionReference<"action">("keiki:adviseProperty"),
  create: makeFunctionReference<"mutation">("tables:create"),
  join: makeFunctionReference<"mutation">("tables:join"),
  get: makeFunctionReference<"query">("tables:get"),
  start: makeFunctionReference<"mutation">("tables:start"),
  act: makeFunctionReference<"mutation">("tables:act"),
  lobby: makeFunctionReference<"mutation">("tables:lobby"),
  daily: makeFunctionReference<"query">("tables:daily"),
};
export type GameType = "crossword" | "hanabi" | "property";
export type Player = { id: string; name: string; color: string };
export type Table = {
  code: string;
  playerId: string;
  hostId: string;
  players: Player[];
  phase: "lobby" | "playing" | "finished";
  gameType: GameType | null;
  gameId: string;
  game: any;
  version: number;
  result?: { summary: string; score?: number; winnerId?: string };
};
