import { describe, expect, it } from 'vitest';
import { apply, Card, COLORS, create, makeDeck, State, view } from '../src/games/property';

function rng(seed = 7) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function fixture(players = ['a', 'b']): State {
  const state = create(players, rng());
  state.deck = makeDeck();
  state.discard = [];
  for (const id of players) {
    state.seats[id].hand = [];
    state.seats[id].bank = [];
    for (const color of COLORS) state.seats[id].properties[color] = [];
  }
  return state;
}
function pull(state: State, kind: Card['kind'], colorOrValue?: string | number): Card {
  const index = state.deck.findIndex(card => card.kind === kind && (colorOrValue === undefined || card.color === colorOrValue || card.value === colorOrValue));
  if (index < 0) throw new Error('Fixture exhausted');
  return state.deck.splice(index, 1)[0];
}
function hand(state: State, id: string, kind: Card['kind'], colorOrValue?: string | number): Card {
  const card = pull(state, kind, colorOrValue);
  state.seats[id].hand.push(card);
  return card;
}
function property(state: State, id: string, color: (typeof COLORS)[number], count = 1) {
  for (let i = 0; i < count; i++) state.seats[id].properties[color].push(pull(state, 'property', color));
}
function bank(state: State, id: string, value: number) {
  const card = pull(state, 'money', value);
  state.seats[id].bank.push(card);
  return card;
}
function invariants(state: State) {
  const cards = [...state.deck, ...state.discard, ...Object.values(state.seats).flatMap(seat => [...seat.hand, ...seat.bank, ...COLORS.flatMap(color => seat.properties[color])])];
  expect(cards).toHaveLength(60);
  expect(new Set(cards.map(card => card.id)).size).toBe(60);
  expect(cards.map(card => card.id).sort()).toEqual(makeDeck().map(card => card.id).sort());
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  expect(state.playsLeft).toBeGreaterThanOrEqual(0);
  expect(state.playsLeft).toBeLessThanOrEqual(3);
  for (const seat of Object.values(state.seats)) for (const color of COLORS) {
    expect(seat.properties[color].length).toBeLessThanOrEqual(2);
    expect(seat.properties[color].every(card => card.color === color && card.kind === 'property')).toBe(true);
  }
}
function rentFixture(values: number[] = [1, 2, 3]) {
  let state = fixture();
  property(state, 'a', 'mint');
  const rent = hand(state, 'a', 'rent');
  for (const value of values) bank(state, 'b', value);
  state = apply(state, 'a', { type: 'rent', cardId: rent.id, targetId: 'b' });
  return state;
}

describe('Property Rush deck and turns', () => {
  it('has exactly the specified 60 uniquely identified cards and values', () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(60);
    for (const color of COLORS) expect(deck.filter(card => card.color === color)).toHaveLength(6);
    expect(deck.filter(card => card.kind === 'money').map(card => card.value).sort()).toEqual([...Array(8).fill(1), ...Array(4).fill(2), ...Array(4).fill(3)]);
    expect(deck.filter(card => card.kind === 'rent')).toHaveLength(6);
    expect(deck.filter(card => card.kind === 'steal' && card.value === 2)).toHaveLength(4);
    expect(deck.filter(card => card.kind === 'block' && card.value === 1)).toHaveLength(4);
    expect(deck.filter(card => card.kind === 'property' && card.value === 1)).toHaveLength(30);
  });

  it('validates 2–4 unique players and deterministic shuffles', () => {
    for (const ids of [[], ['a'], ['a', 'a'], ['a', 'b', 'c', 'd', 'e']]) expect(() => create(ids)).toThrow();
    expect(create(['a', 'b'], rng(4))).toEqual(create(['a', 'b'], rng(4)));
    expect(() => create(['a', 'b'], () => 1)).toThrow();
    for (const ids of [['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
      const state = create(ids, rng());
      expect(state.seats.a.hand).toHaveLength(7);
      for (const id of ids.slice(1)) expect(state.seats[id].hand).toHaveLength(5);
      expect(state.deck).toHaveLength(60 - ids.length * 5 - 2);
      invariants(state);
    }
  });

  it('draws two at each start and allows zero to three plays', () => {
    let state = create(['a', 'b'], rng());
    state = apply(state, 'a', { type: 'endTurn' });
    expect(state.seats.b.hand).toHaveLength(7);
    expect(state.playsLeft).toBe(3);
    for (let i = 0; i < 3; i++) state = apply(state, 'b', { type: 'bank', cardId: state.seats.b.hand[0].id });
    expect(state.playsLeft).toBe(0);
    expect(() => apply(state, 'b', { type: 'bank', cardId: state.seats.b.hand[0].id })).toThrow();
    state = apply(state, 'b', { type: 'endTurn' });
    expect(state.seats.a.hand).toHaveLength(9);
    expect(state.phase).toBe('play');
    invariants(state);
  });

  it('discards down to seven only at the end, then draws for the next player', () => {
    let state = create(['a', 'b'], rng());
    state = apply(state, 'a', { type: 'endTurn' });
    state = apply(state, 'b', { type: 'endTurn' });
    expect(state.seats.a.hand).toHaveLength(9);
    expect(() => apply(state, 'a', { type: 'discard', cardIds: [] })).toThrow();
    state = apply(state, 'a', { type: 'endTurn' });
    expect(state.phase).toBe('discard');
    expect(() => apply(state, 'a', { type: 'bank', cardId: state.seats.a.hand[0].id })).toThrow();
    expect(() => apply(state, 'a', { type: 'discard', cardIds: [state.seats.a.hand[0].id] })).toThrow();
    const ids = state.seats.a.hand.slice(0, 2).map(card => card.id);
    state = apply(state, 'a', { type: 'discard', cardIds: ids });
    expect(state.seats.a.hand).toHaveLength(7);
    expect(state.turnIndex).toBe(1);
    expect(state.seats.b.hand).toHaveLength(9);
    invariants(state);
  });

  it('reshuffles discards deterministically, draws a partial supply, and continues with no cards', () => {
    let state = fixture();
    for (const card of state.deck.splice(0, 58)) state.seats.a.bank.push(card);
    state.discard.push(state.deck.pop()!);
    const before = JSON.stringify(state);
    const a = apply(state, 'a', { type: 'endTurn' });
    const b = apply(JSON.parse(before), 'a', { type: 'endTurn' });
    expect(a).toEqual(b);
    expect(a.seats.b.hand).toHaveLength(2);
    expect(a.deck).toHaveLength(0);
    expect(a.discard).toHaveLength(0);
    state = apply(a, 'b', { type: 'endTurn' });
    expect(state.seats.a.hand).toHaveLength(0);
    invariants(state);
    const partial = fixture();
    partial.seats.a.bank = partial.deck.splice(0, 59);
    expect(apply(partial, 'a', { type: 'endTurn' }).seats.b.hand).toHaveLength(1);
  });

  it('shuffles a larger discard pile on replenishment and preserves every card', () => {
    const state = fixture(['a', 'b', 'c', 'd']);
    state.seats.a.bank = state.deck.splice(0, 54);
    state.discard = state.deck.splice(0);
    const seed = state.randomState;
    const next = apply(state, 'a', { type: 'endTurn' });
    expect(next.seats.b.hand).toHaveLength(2);
    expect(next.deck).toHaveLength(4);
    expect(next.discard).toHaveLength(0);
    expect(next.randomState).not.toBe(seed);
    expect(next).toEqual(apply(state, 'a', { type: 'endTurn' }));
    expect(state.discard).toHaveLength(6);
    invariants(next);
  });
});

describe('Property Rush money, rent and response phases', () => {
  it('banks every kind permanently as money, and never allows a banked action to be played', () => {
    for (const kind of ['property', 'money', 'rent', 'steal', 'block'] as Card['kind'][]) {
      let state = fixture();
      const card = hand(state, 'a', kind);
      state = apply(state, 'a', { type: 'bank', cardId: card.id });
      expect(state.seats.a.bank).toEqual([card]);
      expect(() => apply(state, 'a', { type: 'place', cardId: card.id })).toThrow();
      expect(() => apply(state, 'a', { type: 'rent', cardId: card.id, targetId: 'b' })).toThrow();
      invariants(state);
    }
  });

  it('requires an owned property and valid opponent for rent', () => {
    const state = fixture();
    const card = hand(state, 'a', 'rent');
    expect(() => apply(state, 'a', { type: 'rent', cardId: card.id, targetId: 'b' })).toThrow();
    property(state, 'a', 'mint');
    for (const targetId of ['a', 'unknown']) expect(() => apply(state, 'a', { type: 'rent', cardId: card.id, targetId })).toThrow();
  });

  it('persists the pending response and prevents either player continuing around it', () => {
    const state = rentFixture();
    expect(state.phase).toBe('response');
    expect(state.playsLeft).toBe(2);
    const restored: State = JSON.parse(JSON.stringify(state));
    expect(view(restored, 'b').pending).toEqual({ type: 'rent', actor: 'a', target: 'b' });
    expect(() => apply(restored, 'a', { type: 'endTurn' })).toThrow();
    expect(() => apply(restored, 'b', { type: 'pay', cardIds: [] })).toThrow();
    const accepted = apply(restored, 'b', { type: 'accept' });
    expect(accepted.phase).toBe('payment');
    expect(() => apply(accepted, 'b', { type: 'block', cardId: 'anything' })).toThrow();
    invariants(accepted);
  });

  it('allows only the designated target to respond in a four-player game', () => {
    let state = fixture(['a', 'b', 'c', 'd']);
    property(state, 'a', 'mint');
    const rent = hand(state, 'a', 'rent');
    const block = hand(state, 'c', 'block');
    state = apply(state, 'a', { type: 'rent', cardId: rent.id, targetId: 'd' });
    for (const actor of ['a', 'b', 'c']) {
      expect(() => apply(state, actor, { type: 'accept' })).toThrow();
      expect(() => apply(state, actor, { type: 'block', cardId: block.id })).toThrow();
    }
    state = apply(state, 'd', { type: 'accept' });
    expect(state.players[state.turnIndex]).toBe('a');
    expect(state.phase).toBe('play');
    invariants(state);
  });

  it('lets the target choose bank-only payments and gives no change', () => {
    let state = rentFixture();
    property(state, 'b', 'sky');
    const ownHand = hand(state, 'b', 'money', 3);
    state = apply(state, 'b', { type: 'accept' });
    const propertyId = state.seats.b.properties.sky[0].id;
    for (const cardIds of [[], [state.seats.b.bank[0].id], [ownHand.id], [propertyId], [state.seats.b.bank[1].id, state.seats.b.bank[1].id]]) {
      expect(() => apply(state, 'b', { type: 'pay', cardIds })).toThrow();
    }
    const paid = state.seats.b.bank.find(card => card.value === 3)!;
    state = apply(state, 'b', { type: 'pay', cardIds: [paid.id] });
    expect(state.seats.a.bank).toEqual([paid]);
    expect(state.seats.b.bank.reduce((sum, card) => sum + card.value, 0)).toBe(3);
    expect(state.seats.b.properties.sky).toHaveLength(1);
    expect(state.phase).toBe('play');
    expect(state.pending).toBeUndefined();
    expect(state.playsLeft).toBe(2);
    invariants(state);
  });

  it('accepts multi-card payments and automatically pays an exact or insufficient bank in full', () => {
    for (const values of [[], [1], [2], [1, 1]]) {
      let state = rentFixture(values);
      property(state, 'b', 'sky');
      state = apply(state, 'b', { type: 'accept' });
      expect(state.phase).toBe('play');
      expect(state.seats.b.bank).toHaveLength(0);
      expect(state.seats.a.bank.reduce((sum, card) => sum + card.value, 0)).toBe(values.reduce((a, b) => a + b, 0));
      expect(state.seats.b.properties.sky).toHaveLength(1);
      invariants(state);
    }
    let state = rentFixture([1, 1, 3]);
    state = apply(state, 'b', { type: 'accept' });
    state = apply(state, 'b', { type: 'pay', cardIds: state.seats.b.bank.filter(card => card.value === 1).map(card => card.id) });
    expect(state.seats.a.bank).toHaveLength(2);
    invariants(state);
  });

  it('allows only the target to Block, does not consume future plays, and cannot chain Blocks', () => {
    for (const type of ['rent', 'steal']) {
      let state = fixture();
      property(state, 'a', 'mint');
      property(state, 'b', 'sky');
      const action = hand(state, 'a', type as 'rent' | 'steal');
      const block = hand(state, 'b', 'block');
      const nonBlock = hand(state, 'b', 'money');
      const counterBlock = hand(state, 'a', 'block');
      state = apply(state, 'a', { type, cardId: action.id, targetId: 'b', propertyId: state.seats.b.properties.sky[0].id });
      expect(() => apply(state, 'a', { type: 'block', cardId: counterBlock.id })).toThrow();
      expect(() => apply(state, 'b', { type: 'block', cardId: nonBlock.id })).toThrow();
      state = apply(state, 'b', { type: 'block', cardId: block.id });
      expect(state.phase).toBe('play');
      expect(state.playsLeft).toBe(2);
      expect(state.seats.b.properties.sky).toHaveLength(1);
      expect(state.discard.map(card => card.id)).toEqual([action.id, block.id]);
      expect(() => apply(state, 'a', { type: 'block', cardId: counterBlock.id })).toThrow();
      state = apply(state, 'a', { type: 'endTurn' });
      expect(state.playsLeft).toBe(3);
      invariants(state);
    }
  });
});

describe('Property Rush properties, safety and victory', () => {
  it('caps a property color at two and protects complete sets from stealing', () => {
    const state = fixture();
    property(state, 'a', 'mint', 2);
    property(state, 'b', 'sky', 2);
    property(state, 'b', 'mint');
    const extra = hand(state, 'a', 'property', 'mint');
    const steal = hand(state, 'a', 'steal');
    expect(() => apply(state, 'a', { type: 'place', cardId: extra.id })).toThrow();
    expect(() => apply(state, 'a', { type: 'steal', cardId: steal.id, targetId: 'b', propertyId: state.seats.b.properties.sky[0].id })).toThrow();
    expect(() => apply(state, 'a', { type: 'steal', cardId: steal.id, targetId: 'b', propertyId: state.seats.b.properties.mint[0].id })).toThrow();
    expect(() => apply(state, 'a', { type: 'steal', cardId: steal.id, targetId: 'b', propertyId: extra.id })).toThrow();
    invariants(state);
  });

  it('wins only on three different complete sets, including an accepted steal', () => {
    for (const finish of ['place', 'steal']) {
      let state = fixture();
      property(state, 'a', 'mint', 2);
      property(state, 'a', 'sky', 2);
      property(state, 'a', 'plum');
      expect(state.status).toBe('playing');
      if (finish === 'place') {
        const card = hand(state, 'a', 'property', 'plum');
        state = apply(state, 'a', { type: 'place', cardId: card.id });
      } else {
        property(state, 'b', 'plum');
        const card = hand(state, 'a', 'steal');
        state = apply(state, 'a', { type: 'steal', cardId: card.id, targetId: 'b', propertyId: state.seats.b.properties.plum[0].id });
        expect(state.status).toBe('playing');
        state = apply(state, 'b', { type: 'accept' });
      }
      expect(state.status).toBe('finished');
      expect(state.result?.winnerId).toBe('a');
      expect(() => apply(state, 'a', { type: 'endTurn' })).toThrow();
      invariants(state);
    }
  });

  it('does not mutate input, rejects invalid/out-of-turn actions, and returns a detached safe view', () => {
    const state = create(['a', 'b'], rng());
    const before = JSON.stringify(state);
    const next = apply(state, 'a', { type: 'bank', cardId: state.seats.a.hand[0].id });
    expect(JSON.stringify(state)).toBe(before);
    next.seats.a.bank[0].value = 99;
    expect(JSON.stringify(state)).toBe(before);
    for (const [actor, action] of [['b', { type: 'endTurn' }], ['outsider', { type: 'endTurn' }], ['a', null], ['a', { type: 'unknown' }], ['a', { type: 'bank', cardId: state.seats.b.hand[0].id }]] as const) {
      expect(() => apply(state, actor, action)).toThrow();
      expect(JSON.stringify(state)).toBe(before);
    }
    for (const viewer of ['a', 'b']) {
      const safe = view(state, viewer);
      expect(safe.deck).toBeUndefined();
      expect(safe.randomState).toBeUndefined();
      expect(safe.discard).toBeUndefined();
      for (const seat of safe.seats) {
        if (seat.id === viewer) expect(seat.hand).toEqual(state.seats[seat.id].hand);
        else {
          expect(seat.hand).toBeUndefined();
          for (const card of state.seats[seat.id].hand) expect(JSON.stringify(safe)).not.toContain(card.id);
        }
      }
      safe.seats[0].properties.mint.push({ fake: true });
      safe.players.reverse();
      expect(JSON.stringify(state)).toBe(before);
    }
  });

  it('fails closed when a nonmember requests a private projection', () => {
    const state = create(['a', 'b'], rng());
    const before = JSON.stringify(state);
    for (const viewer of ['outsider', '', '__proto__']) expect(() => view(state, viewer)).toThrow('You are not a player');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('plays a full dealt game with legal actions, responses, payments and card conservation', () => {
    let state = create(['a', 'b'], rng(1));
    let responses = 0;
    let payments = 0;
    let steps = 0;
    while (state.status === 'playing' && steps++ < 2000) {
      if (state.phase === 'response') {
        responses++;
        const block = state.seats[state.pending!.target].hand.find(card => card.kind === 'block');
        state = apply(state, state.pending!.target, block && responses % 2 === 0 ? { type: 'block', cardId: block.id } : { type: 'accept' });
      } else if (state.phase === 'payment') {
        payments++;
        const cards: Card[] = [];
        for (const card of state.seats[state.pending!.target].bank) {
          cards.push(card);
          if (cards.reduce((sum, current) => sum + current.value, 0) >= 2) break;
        }
        state = apply(state, state.pending!.target, { type: 'pay', cardIds: cards.map(card => card.id) });
      } else {
        const actor = state.players[state.turnIndex];
        const seat = state.seats[actor];
        const rival = state.players.find(id => id !== actor)!;
        if (state.phase === 'discard') state = apply(state, actor, { type: 'discard', cardIds: seat.hand.slice(0, seat.hand.length - 7).map(card => card.id) });
        else if (!state.playsLeft || !seat.hand.length) state = apply(state, actor, { type: 'endTurn' });
        else {
          const place = seat.hand.find(card => card.color && seat.properties[card.color].length < 2);
          const steal = seat.hand.find(card => card.kind === 'steal');
          const eligible = COLORS.flatMap(color => state.seats[rival].properties[color].length < 2 && seat.properties[color].length < 2 ? state.seats[rival].properties[color] : [])[0];
          const rent = seat.hand.find(card => card.kind === 'rent');
          if (rent && COLORS.some(color => seat.properties[color].length) && state.seats[rival].bank.length) state = apply(state, actor, { type: 'rent', cardId: rent.id, targetId: rival });
          else if (place) state = apply(state, actor, { type: 'place', cardId: place.id });
          else if (steal && eligible) state = apply(state, actor, { type: 'steal', cardId: steal.id, targetId: rival, propertyId: eligible.id });
          else state = apply(state, actor, { type: 'bank', cardId: seat.hand[0].id });
        }
      }
      invariants(state);
      state = JSON.parse(JSON.stringify(state));
    }
    expect(state.status).toBe('finished');
    expect(responses).toBeGreaterThan(0);
    expect(payments).toBeGreaterThan(0);
    expect(state.result?.winnerId).toBeTruthy();
  });
});
