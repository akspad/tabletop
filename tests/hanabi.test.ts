import { describe, expect, it } from 'vitest';
import { actionsMatch, apply, COLORS, create, NUMBERS, view, type Action, type Card, type CardNumber, type Color, type State } from '../src/games/hanabi';

function card(id: string, color: Color, number: CardNumber): Card {
  return { id, color, number, clues: { colors: [], notColors: [], numbers: [], notNumbers: [] } };
}

function fixture(): State {
  const state = create(['alice', 'bob'], () => 0.5);
  state.hands.alice = [card('a1', 'red', 1), card('a2', 'blue', 3), card('a3', 'white', 5)];
  state.hands.bob = [card('b1', 'red', 1), card('b2', 'blue', 1), card('b3', 'red', 3)];
  return state;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe('Hanabi creation', () => {
  it.each([2, 3, 4, 5])('deals the standard 50-card deck for %i players', count => {
    const players = Array.from({ length: count }, (_, i) => `p${i}`);
    const state = create(players, seededRandom(7));
    const handSize = count < 4 ? 5 : 4;
    const all = [...state.deck, ...Object.values(state.hands).flat()];
    expect(all).toHaveLength(50);
    expect(new Set(all.map(card => card.id)).size).toBe(50);
    expect(state.deck).toHaveLength(50 - count * handSize);
    players.forEach(id => expect(state.hands[id]).toHaveLength(handSize));
    for (const color of COLORS) for (const number of NUMBERS) {
      expect(all.filter(card => card.color === color && card.number === number)).toHaveLength(number === 1 ? 3 : number === 5 ? 1 : 2);
    }
    expect(state.clueTokens).toBe(8);
    expect(state.fusesRemaining).toBe(3);
    expect(state.finalTurnsRemaining).toBeNull();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(create(players, seededRandom(7))).toEqual(state);
  });

  it.each([[], ['one'], ['a', 'b', 'c', 'd', 'e', 'f'], ['a', 'a'], ['a', ' '], ['a', 2]].map(players => ({ players })))('rejects invalid seats $players', ({ players }) => {
    expect(() => create(players as string[])).toThrow();
  });

  it('does not retain the input players array and rejects invalid randomness', () => {
    const players = ['a', 'b'];
    const state = create(players);
    players[0] = 'changed';
    expect(state.players).toEqual(['a', 'b']);
    for (const value of [1, -0.1, NaN, Infinity]) expect(() => create(['a', 'b'], () => value)).toThrow();
  });
});

describe('Hanabi legality and clues', () => {
  it('rejects nonplayers, out-of-turn moves, foreign cards, malformed actions, and unknown actions', () => {
    const state = fixture();
    expect(() => apply(state, 'bob', { type: 'play', cardId: 'b1' })).toThrow(/turn/);
    expect(() => apply(state, 'outsider', { type: 'play', cardId: 'a1' })).toThrow(/turn/);
    for (const action of [null, {}, { type: 'dance' }, { type: 'play', cardId: 'b1' }, { type: 'play', cardId: 1 }]) expect(() => apply(state, 'alice', action)).toThrow();
  });

  it.each([
    { type: 'clue', targetId: 'alice', clue: { kind: 'color', value: 'red' } },
    { type: 'clue', targetId: 'missing', clue: { kind: 'color', value: 'red' } },
    { type: 'clue', targetId: 'bob', clue: { kind: 'color', value: 'rainbow' } },
    { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 0 } },
    { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 6 } },
    { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: '1' } },
    { type: 'clue', targetId: 'bob', clue: { kind: 'rank', value: 1 } },
    { type: 'clue', targetId: 'bob' },
    { type: 'clue', targetId: 'bob', clue: { kind: 'color', value: 'yellow' } },
    { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 5 } },
  ])('rejects illegal clue %j', action => {
    const state = fixture();
    const snapshot = JSON.stringify(state);
    expect(() => apply(state, 'alice', action)).toThrow();
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('spends exactly one token, reveals every matching color, and marks nonmatches negatively', () => {
    const state = deepFreeze(fixture());
    const next = apply(state, 'alice', { type: 'clue', targetId: 'bob', clue: { kind: 'color', value: 'red' } });
    expect(next.clueTokens).toBe(7);
    expect(next.turnIndex).toBe(1);
    expect(next.deck).toEqual(state.deck);
    expect(next.hands.bob.map(card => card.clues.colors)).toEqual([['red'], [], ['red']]);
    expect(next.hands.bob.map(card => card.clues.notColors)).toEqual([[], ['red'], []]);
    expect(state.hands.bob[0].clues.colors).toEqual([]);
  });

  it('number clues mark all matches and exclusions, including repeated clues', () => {
    let state = apply(fixture(), 'alice', { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 1 } });
    expect(state.hands.bob.map(card => card.clues.numbers)).toEqual([[1], [1], []]);
    expect(state.hands.bob.map(card => card.clues.notNumbers)).toEqual([[], [], [1]]);
    state = apply(state, 'bob', { type: 'clue', targetId: 'alice', clue: { kind: 'color', value: 'red' } });
    state = apply(state, 'alice', { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 1 } });
    expect(state.clueTokens).toBe(5);
    expect(state.hands.bob[0].clues.numbers).toEqual([1]);
    expect(state.hands.bob[2].clues.notNumbers).toEqual([1]);
  });

  it('cannot clue without a token and cannot discard when clues are full', () => {
    const state = fixture();
    expect(() => apply(state, 'alice', { type: 'discard', cardId: 'a1' })).toThrow(/8 clue/);
    state.clueTokens = 0;
    expect(() => apply(state, 'alice', { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 1 } })).toThrow(/tokens/);
    const next = apply(state, 'alice', { type: 'discard', cardId: 'a1' });
    expect(next.clueTokens).toBe(1);
    expect(next.discards).toEqual([{ id: 'a1', color: 'red', number: 1 }]);
  });

  it('keeps positive and negative clues attached to card IDs as slots shift, without inheriting them on a draw', () => {
    let state = fixture();
    state.deck = [card('draw1', 'green', 2), card('draw2', 'yellow', 4)];
    state = apply(state, 'alice', { type: 'clue', targetId: 'bob', clue: { kind: 'color', value: 'red' } });
    state = apply(state, 'bob', { type: 'discard', cardId: 'b1' });
    expect(state.hands.bob.map(card => card.id)).toEqual(['b2', 'b3', 'draw1']);
    expect(state.hands.bob[0].clues.notColors).toEqual(['red']);
    expect(state.hands.bob[1].clues.colors).toEqual(['red']);
    expect(state.hands.bob[2].clues).toEqual({ colors: [], notColors: [], numbers: [], notNumbers: [] });
  });
});

describe('Hanabi playing and completion', () => {
  it('plays only the next ascending number in its own color and draws one card', () => {
    const state = deepFreeze(fixture());
    const next = apply(state, 'alice', { type: 'play', cardId: 'a1' });
    expect(next.fireworks).toEqual({ red: 1, yellow: 0, green: 0, blue: 0, white: 0 });
    expect(next.hands.alice.map(card => card.id)).toEqual(['a2', 'a3', state.deck[0].id]);
    expect(next.deck).toHaveLength(state.deck.length - 1);
    expect(next.clueTokens).toBe(8);
    expect(next.fusesRemaining).toBe(3);
    expect(next.discards).toEqual([]);
    expect(state.fireworks.red).toBe(0);
  });

  it('an invalid play spends a fuse, publicly discards, draws, and still uses the turn', () => {
    const state = fixture();
    const next = apply(state, 'alice', { type: 'play', cardId: 'a2' });
    expect(next.fusesRemaining).toBe(2);
    expect(next.fireworks.blue).toBe(0);
    expect(next.discards).toEqual([{ id: 'a2', color: 'blue', number: 3 }]);
    expect(next.clueTokens).toBe(8);
    expect(next.hands.alice.at(-1)?.id).toBe(state.deck[0].id);
    expect(next.turnIndex).toBe(1);
  });

  it('a duplicate already-played number is an invalid play', () => {
    const state = fixture();
    state.fireworks.red = 1;
    const next = apply(state, 'alice', { type: 'play', cardId: 'a1' });
    expect(next.fusesRemaining).toBe(2);
    expect(next.fireworks.red).toBe(1);
  });

  it.each([0, 7, 8])('a successful five restores a token capped at eight, starting with %i', tokens => {
    const state = fixture();
    state.fireworks.white = 4;
    state.clueTokens = tokens;
    const next = apply(state, 'alice', { type: 'play', cardId: 'a3' });
    expect(next.fireworks.white).toBe(5);
    expect(next.clueTokens).toBe(Math.min(8, tokens + 1));
  });

  it('an unsuccessful five never restores a clue token', () => {
    const state = fixture();
    state.clueTokens = 2;
    const next = apply(state, 'alice', { type: 'play', cardId: 'a3' });
    expect(next.clueTokens).toBe(2);
    expect(next.fusesRemaining).toBe(2);
  });

  it('ends immediately on the third failed play, without drawing or accepting more actions', () => {
    const state = fixture();
    state.fusesRemaining = 1;
    state.fireworks.red = 1;
    const next = apply(state, 'alice', { type: 'play', cardId: 'a2' });
    expect(next.status).toBe('finished');
    expect(next.result?.score).toBe(0);
    expect(next.fusesRemaining).toBe(0);
    expect(next.deck).toHaveLength(state.deck.length);
    expect(view(next, 'bob').legalActions).toEqual([]);
    expect(() => apply(next, 'bob', { type: 'play', cardId: 'b1' })).toThrow(/finished/);
  });

  it('ends immediately at 25 rather than waiting for the deck or final turns', () => {
    const state = fixture();
    state.fireworks = { red: 5, yellow: 5, green: 5, blue: 5, white: 4 };
    const next = apply(state, 'alice', { type: 'play', cardId: 'a3' });
    expect(next.status).toBe('finished');
    expect(next.result?.score).toBe(25);
    expect(next.deck).toHaveLength(state.deck.length);
  });

  it.each([2, 3, 4, 5])('gives all %i players one final turn, including the last-card drawer, without counting the drawing turn', count => {
    const players = Array.from({ length: count }, (_, i) => `p${i}`);
    let state = create(players, seededRandom(11));
    state.deck = [card('last-draw', 'green', 1)];
    state.clueTokens = 7;
    state = apply(state, players[0], { type: 'discard', cardId: state.hands[players[0]][0].id });
    expect(state.deck).toHaveLength(0);
    expect(state.finalTurnsRemaining).toBe(count);
    expect(state.status).toBe('playing');
    const finalActors: string[] = [];
    for (let i = 0; i < count; i++) {
      const actor = state.players[state.turnIndex];
      finalActors.push(actor);
      const action = view(state, actor).legalActions.find(action => action.type === 'clue')!;
      expect(action).toBeDefined();
      state = apply(deepFreeze(state), actor, action);
      expect(state.finalTurnsRemaining).toBe(count - i - 1);
      expect(state.status).toBe(i === count - 1 ? 'finished' : 'playing');
    }
    expect(finalActors).toEqual([...players.slice(1), players[0]]);
    expect(state.result?.score).toBe(0);
  });

  it('shrinks hands without replacement during the final round', () => {
    const state = fixture();
    state.deck = [];
    state.finalTurnsRemaining = 2;
    state.clueTokens = 6;
    const next = apply(state, 'alice', { type: 'discard', cardId: 'a1' });
    expect(next.hands.alice).toHaveLength(2);
    expect(next.finalTurnsRemaining).toBe(1);
    expect(next.status).toBe('playing');
    const end = apply(next, 'bob', { type: 'play', cardId: 'b1' });
    expect(end.status).toBe('finished');
    expect(end.result?.score).toBe(1);
  });

  it.each([2, 3, 4, 5])('plays an entire legal %i-player game with conservation of cards and no state mutation', count => {
    let state = create(Array.from({ length: count }, (_, i) => `p${i}`), seededRandom(27));
    let turns = 0;
    let drawnBy: string | null = null;
    const finalActors: string[] = [];
    while (state.status === 'playing' && turns < 160) {
      const actor = state.players[state.turnIndex];
      if (state.finalTurnsRemaining !== null) finalActors.push(actor);
      const projection = view(state, actor);
      const playable = state.hands[actor].find(card => state.fireworks[card.color] + 1 === card.number);
      const legal = playable ? { type: 'play', cardId: playable.id } as Action : projection.legalActions.find(action => action.type === 'discard') ?? projection.legalActions.find(action => action.type === 'clue');
      expect(legal).toBeDefined();
      const previous = JSON.stringify(state);
      const next = apply(deepFreeze(state), actor, legal);
      expect(JSON.stringify(state)).toBe(previous);
      if (state.deck.length > 0 && next.deck.length === 0) drawnBy = actor;
      state = next;
      const played = Object.values(state.fireworks).reduce((a, b) => a + b, 0);
      expect(state.deck.length + Object.values(state.hands).flat().length + state.discards.length + played).toBe(50);
      expect(state.clueTokens).toBeGreaterThanOrEqual(0);
      expect(state.clueTokens).toBeLessThanOrEqual(8);
      expect(state.fusesRemaining).toBe(3);
      turns++;
    }
    expect(turns).toBeLessThan(160);
    expect(state.status).toBe('finished');
    expect(state.result?.score).toBeGreaterThan(0);
    expect(state.result?.score).toBe(Object.values(state.fireworks).reduce((a, b) => a + b, 0));
    if (state.result?.score !== 25) {
      expect(finalActors).toHaveLength(count);
      expect(new Set(finalActors).size).toBe(count);
      expect(finalActors.at(-1)).toBe(drawnBy);
    }
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('Hanabi secure projections', () => {
  it('publishes only the confirmed played face and server-decided outcome to every seat', () => {
    const state = fixture();
    expect(view(state, 'alice').lastMove).toBeNull();
    const next = apply(deepFreeze(state), 'alice', { type: 'play', cardId: 'a1' });
    const expected = { sequence: 1, actorId: 'alice', card: { color: 'red', number: 1 }, outcome: 'success' };
    expect(next.lastMove).toEqual(expected);
    for (const viewer of next.players) {
      const safe = view(next, viewer);
      expect(safe.lastMove).toEqual(expected);
      expect(Object.keys(safe.lastMove!.card).sort()).toEqual(['color', 'number']);
      expect(safe.hands[viewer].every(card => !('color' in card) && !('number' in card))).toBe(true);
      expect(JSON.stringify(safe.lastMove)).not.toContain(next.hands.alice.at(-1)!.id);
      expect(safe).not.toHaveProperty('deck');
    }
    const safe = view(next, 'alice');
    safe.lastMove!.card.number = 5;
    expect(next.lastMove).toEqual(expected);
  });

  it('emits a mistake event even when the third mistake ends the game', () => {
    const state = fixture();
    state.fusesRemaining = 1;
    const next = apply(state, 'alice', { type: 'play', cardId: 'a2' });
    expect(next.status).toBe('finished');
    expect(view(next, 'alice').lastMove).toEqual({ sequence: 1, actorId: 'alice', card: { color: 'blue', number: 3 }, outcome: 'mistake' });
  });

  it('advances the sequence on each accepted turn, clearing celebrations for clues and discards', () => {
    let state = apply(fixture(), 'alice', { type: 'play', cardId: 'a1' });
    expect(state.moveSequence).toBe(1);
    state = apply(state, 'bob', { type: 'clue', targetId: 'alice', clue: { kind: 'color', value: 'blue' } });
    expect(state.moveSequence).toBe(2);
    expect(view(state, 'bob').lastMove).toBeNull();
    state = apply(state, 'alice', { type: 'discard', cardId: 'a2' });
    expect(state.moveSequence).toBe(3);
    expect(view(state, 'alice').lastMove).toBeNull();
    state = apply(state, 'bob', { type: 'play', cardId: 'b1' });
    expect(state.moveSequence).toBe(4);
    expect(state.lastMove?.sequence).toBe(4);
    expect(state.lastMove?.outcome).toBe('mistake');
    const snapshot = JSON.stringify(state);
    expect(() => apply(state, 'bob', { type: 'play', cardId: 'b2' })).toThrow();
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(create(['alice', 'bob']).moveSequence).toBe(0);
  });

  it('supports persisted games without event fields, without revealing any unplayed face', () => {
    const legacy = fixture();
    delete legacy.moveSequence;
    delete legacy.lastMove;
    expect(view(legacy, 'alice').lastMove).toBeNull();
    expect(view(legacy, 'alice').moveSequence).toBe(0);
    const clue = apply(legacy, 'alice', { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 1 } });
    expect(clue.moveSequence).toBe(1);
    expect(clue.lastMove).toBeNull();
    const play = apply(clue, 'bob', { type: 'play', cardId: 'b1' });
    expect(play.lastMove?.sequence).toBe(2);
    expect(JSON.parse(JSON.stringify(play))).toEqual(play);
    expect(() => view(play, 'outsider')).toThrow();
  });

  it('whitelists event fields rather than leaking hidden state accidentally attached to an event', () => {
    const state = apply(fixture(), 'alice', { type: 'play', cardId: 'a1' });
    Object.assign(state.lastMove!, { deck: state.deck, hand: state.hands.alice });
    Object.assign(state.lastMove!.card, { hidden: state.hands.alice[0] });
    expect(view(state, 'alice').lastMove).toEqual({ sequence: 1, actorId: 'alice', card: { color: 'red', number: 1 }, outcome: 'success' });
  });

  it('matches every legal board intent after transport reorders action and nested clue keys', () => {
    const state = fixture();
    state.clueTokens = 7;
    const localIntents = view(state, 'alice').legalActions;
    const transported: Action[] = localIntents.map(action => action.type === 'clue'
      ? { clue: { value: action.clue.value, kind: action.clue.kind }, targetId: action.targetId, type: action.type } as Action
      : { cardId: action.cardId, type: action.type });
    expect(localIntents.some(action => action.type === 'play')).toBe(true);
    expect(localIntents.some(action => action.type === 'discard')).toBe(true);
    expect(localIntents.some(action => action.type === 'clue' && action.clue.kind === 'color')).toBe(true);
    expect(localIntents.some(action => action.type === 'clue' && action.clue.kind === 'number')).toBe(true);
    for (const [index, intent] of localIntents.entries()) {
      expect(JSON.stringify(transported[index])).not.toBe(JSON.stringify(intent));
      expect(transported.some(legal => actionsMatch(legal, intent))).toBe(true);
      expect(actionsMatch(intent, transported[index])).toBe(true);
    }
  });

  it('does not enable intents with a different action type, card, target, clue kind, or clue value', () => {
    const play: Action = { type: 'play', cardId: 'a1' };
    expect(actionsMatch(play, { type: 'discard', cardId: 'a1' })).toBe(false);
    expect(actionsMatch(play, { type: 'play', cardId: 'a2' })).toBe(false);
    const clue: Action = { type: 'clue', targetId: 'bob', clue: { kind: 'color', value: 'red' } };
    expect(actionsMatch(clue, play)).toBe(false);
    expect(actionsMatch(play, clue)).toBe(false);
    expect(actionsMatch(clue, { type: 'clue', targetId: 'cara', clue: { kind: 'color', value: 'red' } })).toBe(false);
    expect(actionsMatch(clue, { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 1 } })).toBe(false);
    expect(actionsMatch(clue, { type: 'clue', targetId: 'bob', clue: { kind: 'color', value: 'blue' } })).toBe(false);
    expect(actionsMatch({ type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 1 } }, { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 2 } })).toBe(false);
  });

  it('omits own faces and the deck at every seat, including after game end', () => {
    const state = fixture();
    for (const status of ['playing', 'finished'] as const) {
      state.status = status;
      for (const viewer of state.players) {
        const safe = view(state, viewer);
        expect(safe).not.toHaveProperty('deck');
        expect(safe.deckCount).toBe(state.deck.length);
        expect(safe).not.toHaveProperty('turnIndex');
        for (const own of safe.hands[viewer]) {
          expect(Object.keys(own).sort()).toEqual(['clues', 'id']);
          expect(own).not.toHaveProperty('color');
          expect(own).not.toHaveProperty('number');
        }
        for (const other of state.players.filter(id => id !== viewer)) {
          expect(safe.hands[other]).toEqual(state.hands[other]);
        }
        const hiddenIds = state.deck.map(card => card.id);
        expect(hiddenIds.every(id => !JSON.stringify(safe).includes(`"${id}"`))).toBe(true);
      }
    }
  });

  it.each(['outsider', '', '__proto__', undefined, null])('rejects invalid viewer %s instead of revealing all hands', viewer => {
    expect(() => view(fixture(), viewer as string)).toThrow(/seated/);
  });

  it('does not leak mutable references through any projected nested object', () => {
    const state = fixture();
    const before = JSON.stringify(state);
    const safe = view(state, 'alice');
    safe.players.push('injected');
    safe.hands.alice[0].clues.colors.push('red');
    safe.hands.bob[0].clues.notNumbers.push(2);
    (safe.hands.bob[0] as Card).number = 5;
    safe.fireworks.red = 5;
    safe.discards.push({ id: 'fake', color: 'red', number: 5 });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('lists all and only legally available actions for the current player without using own faces', () => {
    const state = fixture();
    const legal = view(state, 'alice').legalActions;
    expect(legal.filter(action => action.type === 'play')).toHaveLength(3);
    expect(legal.some(action => action.type === 'discard')).toBe(false);
    expect(legal.filter(action => action.type === 'clue')).toEqual([
      { type: 'clue', targetId: 'bob', clue: { kind: 'color', value: 'red' } },
      { type: 'clue', targetId: 'bob', clue: { kind: 'color', value: 'blue' } },
      { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 1 } },
      { type: 'clue', targetId: 'bob', clue: { kind: 'number', value: 3 } },
    ]);
    expect(view(state, 'bob').legalActions).toEqual([]);
    for (const action of legal) expect(() => apply(state, 'alice', action)).not.toThrow();
    const altered = structuredClone(state);
    altered.hands.alice.forEach(card => { card.color = 'yellow'; card.number = 5; });
    expect(view(altered, 'alice').legalActions).toEqual(legal);
    state.clueTokens = 0;
    const noTokens = view(state, 'alice').legalActions;
    expect(noTokens.filter(action => action.type === 'discard')).toHaveLength(3);
    expect(noTokens.some(action => action.type === 'clue')).toBe(false);
  });
});
