import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const local = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = process.env.EXPO_PUBLIC_CONVEX_URL || local.match(/^EXPO_PUBLIC_CONVEX_URL=(.+)$/m)?.[1];
if (!url) throw new Error('Set EXPO_PUBLIC_CONVEX_URL first.');
const api = Object.fromEntries(['create', 'join', 'get', 'start', 'act', 'lobby', 'daily'].map(name => [name, makeFunctionReference(`tables:${name}`)]));
const clients = ['Demo host', 'Demo friend', 'Demo guest'].map(name => ({ name, secret: randomBytes(32).toString('hex'), client: new ConvexHttpClient(url) }));
const evidence = { backend: url, startedAt: new Date().toISOString(), clients: 3, checks: [], games: {} };
const check = (condition, description) => { if (!condition) throw new Error(description); evidence.checks.push(description); };
const created = await clients[0].client.mutation(api.create, { secret: clients[0].secret, name: clients[0].name });
const code = created.code;
clients[0].id = created.playerId;
for (const person of clients.slice(1)) {
  const joined = await person.client.mutation(api.join, { code, secret: person.secret, name: person.name });
  person.id = joined.playerId;
}
const get = async (person = clients[0]) => await person.client.query(api.get, { code, secret: person.secret });
const action = async (person, table, value, actionId = randomUUID()) => await person.client.mutation(api.act, { code, secret: person.secret, gameId: table.gameId, expectedVersion: table.version, actionId, action: value });
async function start(gameType) {
  const table = await get();
  await clients[0].client.mutation(api.start, { code, secret: clients[0].secret, expectedVersion: table.version, actionId: randomUUID(), gameType });
  return await get();
}
async function lobby() {
  const table = await get();
  await clients[0].client.mutation(api.lobby, { code, secret: clients[0].secret, expectedVersion: table.version, actionId: randomUUID() });
  check((await get()).players.length === 3, 'Returning to the lobby preserves all three seats');
}

let table = await get();
check(table.players.length === 3, 'Three independent guest identities join one live Convex table');
check((await clients[1].client.mutation(api.join, { code, secret: clients[1].secret, name: 'Reopened' })).playerId === clients[1].id, 'Rejoining with a persisted session restores the same seat');
table = await start('crossword');
const today = await clients[0].client.query(api.daily, { secret: clients[0].secret });
const rows = { 'mini-2026-11-15': ['GAMES', 'ALERT', 'METRO', 'ERROR', 'STORE'], 'mini-2026-11-16': ['PLANT', 'LOWER', 'AWARE', 'NERVE', 'TREES'], 'mini-2026-11-17': ['HEART', 'EMBER', 'ABUSE', 'RESIN', 'TREND'] }[today.puzzleId];
if (!rows) throw new Error('Add the scheduled fixed puzzle to this verification script.');
await Promise.all([action(clients[0], table, { type: 'letter', cell: 0, letter: rows[0][0] }), action(clients[1], table, { type: 'letter', cell: 1, letter: rows[0][1] })]);
table = await get(clients[2]);
check(table.game.letters[0] === rows[0][0] && table.game.letters[1] === rows[0][1], 'Concurrent writes to separate crossword cells both survive');
const duplicate = randomUUID();
const before = table.version;
await action(clients[2], table, { type: 'letter', cell: 2, letter: rows[0][2] }, duplicate);
await action(clients[2], table, { type: 'letter', cell: 2, letter: rows[0][2] }, duplicate);
check((await get()).version === before + 1, 'Retrying the same action ID does not apply it twice');
for (const [cell, letter] of [...rows.join('')].entries()) {
  if (cell > 2) await action(clients[cell % 3], table, { type: 'letter', cell, letter });
}
table = await get();
check(table.phase === 'finished', 'A complete shared crossword reaches real results');
for (const person of clients) check((await person.client.query(api.daily, { secret: person.secret })).completed, 'Daily completion is saved for a participating guest');
evidence.games.crossword = { result: table.result, puzzleId: table.game.puzzleId };
await lobby();

table = await start('hanabi');
let turns = 0, clues = 0, plays = 0;
while (table.phase === 'playing' && turns++ < 180) {
  const person = clients.find(p => p.id === table.game.turnPlayerId);
  table = await get(person);
  const game = table.game;
  check(!('deck' in game) && game.hands[person.id].every(card => !('color' in card) && !('number' in card)), 'Hanabi query omits the viewer’s own faces and the deck');
  const colors = ['red', 'yellow', 'green', 'blue', 'white'];
  const numbers = [1, 2, 3, 4, 5];
  const safe = game.hands[person.id].find(card => {
    const possibleColors = card.clues.colors.length ? card.clues.colors : colors.filter(c => !card.clues.notColors.includes(c));
    const possibleNumbers = card.clues.numbers.length ? card.clues.numbers : numbers.filter(n => !card.clues.notNumbers.includes(n));
    return possibleNumbers.length === 1 && possibleColors.every(c => game.fireworks[c] + 1 === possibleNumbers[0]);
  });
  const clue = game.legalActions.find(a => a.type === 'clue' && a.clue.kind === 'number' && a.clue.value === 1 && game.hands[a.targetId].some(card => card.number === 1 && game.fireworks[card.color] === 0 && !card.clues.numbers.includes(1)));
  const discard = game.legalActions.find(a => a.type === 'discard');
  const intended = safe ? { type: 'play', cardId: safe.id } : clue ?? discard ?? game.legalActions.find(a => a.type === 'clue') ?? game.legalActions[0];
  if (intended.type === 'clue') clues++;
  if (intended.type === 'play') plays++;
  await action(person, table, intended);
  table = await get();
}
check(table.phase === 'finished', 'Hanabi completes from a normal shuffled deal through legal player actions');
check(clues > 0 && plays > 0, 'Live Hanabi includes a legal clue and a successful informed card play');
check(table.result.score > 0 && table.game.fusesRemaining === 3 && table.game.finalTurnsRemaining === 0, 'Live Hanabi reaches the final round without an uninformed play or mistake');
evidence.games.hanabi = { result: table.result, turns, clues, plays };
await start('hanabi');
check((await get()).phase === 'playing', 'The host can rematch Hanabi without replacing the table');
await lobby();

table = await start('property');
let steps = 0, rentResponses = 0, payments = 0, blocks = 0, steals = 0;
while (table.phase === 'playing' && steps++ < 1500) {
  const game = table.game;
  const person = clients.find(p => p.id === (game.pending?.target ?? game.turnPlayerId));
  table = await get(person);
  const state = table.game;
  const me = state.seats.find(seat => seat.id === person.id);
  const other = state.seats.filter(seat => seat.id !== person.id);
  check(!('deck' in state) && other.every(seat => !('hand' in seat)), 'Property Rush query omits opponents’ hands and the deck');
  let intended;
  if (state.phase === 'response') {
    if (state.pending.type === 'rent') rentResponses++;
    if (state.pending.type === 'steal') steals++;
    const block = me.hand.find(card => card.kind === 'block');
    if (block && blocks === 0) { intended = { type: 'block', cardId: block.id }; blocks++; }
    else intended = { type: 'accept' };
  } else if (state.phase === 'payment') {
    const chosen = [];
    let total = 0;
    for (const card of [...me.bank].sort((a, b) => a.value - b.value)) { chosen.push(card.id); total += card.value; if (total >= 2) break; }
    intended = { type: 'pay', cardIds: chosen }; payments++;
  } else if (state.phase === 'discard') {
    intended = { type: 'discard', cardIds: me.hand.slice(0, me.hand.length - 7).map(card => card.id) };
  } else if (state.playsLeft === 0) intended = { type: 'endTurn' };
  else {
    const completedSets = Object.values(me.properties).filter(group => group.length === 2).length;
    const property = me.hand.find(card => card.kind === 'property' && me.properties[card.color].length < 2 && !(payments === 0 && completedSets === 2 && me.properties[card.color].length === 1));
    const money = me.hand.find(card => card.kind === 'money');
    const rent = me.hand.find(card => card.kind === 'rent');
    const target = other.find(seat => seat.bank.reduce((sum, card) => sum + card.value, 0) > 2);
    const hasProperty = Object.values(me.properties).some(group => group.length);
    const steal = me.hand.find(card => card.kind === 'steal');
    const stealTarget = other.flatMap(seat => Object.entries(seat.properties).flatMap(([color, cards]) => cards.length === 1 && me.properties[color].length < 2 ? [{ seat, card: cards[0] }] : []))[0];
    if (rent && target && hasProperty && payments < 2) intended = { type: 'rent', cardId: rent.id, targetId: target.id };
    else if (money && me.bank.reduce((sum, card) => sum + card.value, 0) < 5) intended = { type: 'bank', cardId: money.id };
    else if (property) intended = { type: 'place', cardId: property.id };
    else if (steal && stealTarget) intended = { type: 'steal', cardId: steal.id, targetId: stealTarget.seat.id, propertyId: stealTarget.card.id };
    else if (rent && target && hasProperty) intended = { type: 'rent', cardId: rent.id, targetId: target.id };
    else if (me.hand.length) intended = { type: 'bank', cardId: me.hand[0].id };
    else intended = { type: 'endTurn' };
  }
  await action(person, table, intended);
  table = await get();
}
check(table.phase === 'finished', 'Property Rush completes from a normal 60-card shuffled deal');
check(rentResponses > 0 && payments > 0, 'Live Property Rush includes a rent response and selected bank payment');
evidence.games.property = { result: table.result, steps, rentResponses, payments, blocks, steals };
await lobby();
evidence.completedAt = new Date().toISOString();
evidence.code = code;
evidence.checks = [...new Set(evidence.checks)];
const output = process.argv[2] || 'verification/live-smoke.json';
mkdirSync(output.substring(0, output.lastIndexOf('/')) || '.', { recursive: true });
writeFileSync(output, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
