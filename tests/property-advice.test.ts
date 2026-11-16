import { describe, expect, it } from 'vitest';
import { apply, COLORS, create, makeDeck, type Card, type State } from '../src/games/property';
import { propertyAdviceContext, propertyAdviceOptions } from '../src/games/propertyAdvice';

function fixture(): State {
  const state = create(['private-player-a', 'private-player-b'], () => 0.5);
  state.deck = makeDeck();
  state.discard = [];
  for (const seat of Object.values(state.seats)) {
    seat.hand = [];
    seat.bank = [];
    for (const color of COLORS) seat.properties[color] = [];
  }
  return state;
}

function take(state: State, kind: Card['kind'], colorOrValue?: string | number) {
  const index = state.deck.findIndex(card => card.kind === kind && (colorOrValue === undefined || card.color === colorOrValue || card.value === colorOrValue));
  if (index < 0) throw new Error('Fixture has no matching card');
  return state.deck.splice(index, 1)[0];
}

describe('legal Property Rush advice options', () => {
  it('offers a winning placement without mutating or drawing from the real state', () => {
    const state = fixture(), actor = state.players[0], me = state.seats[actor];
    for (const color of ['coral', 'sky'] as const) me.properties[color].push(take(state, 'property', color), take(state, 'property', color));
    me.properties.mint.push(take(state, 'property', 'mint'));
    me.hand.push(take(state, 'property', 'mint'));
    const before = JSON.stringify(state);
    const options = propertyAdviceOptions(state, actor);
    const winning = options.find(option => option.action.type === 'place')!;
    expect(winning.title).toContain('third set and win');
    expect(apply(state, actor, winning.action).status).toBe('finished');
    for (const option of options) expect(() => apply(state, actor, option.action)).not.toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('never offers a protected steal or a placement into a full color', () => {
    const state = fixture(), actor = state.players[0], rival = state.players[1];
    state.seats[actor].hand.push(take(state, 'steal'), take(state, 'property', 'sky'));
    state.seats[actor].properties.sky.push(take(state, 'property', 'sky'), take(state, 'property', 'sky'));
    state.seats[rival].properties.mint.push(take(state, 'property', 'mint'), take(state, 'property', 'mint'));
    state.seats[rival].properties.sky.push(take(state, 'property', 'sky'));
    state.seats[rival].properties.coral.push(take(state, 'property', 'coral'));
    const options = propertyAdviceOptions(state, actor);
    expect(options.some(option => option.action.type === 'place')).toBe(false);
    const steals = options.filter(option => option.action.type === 'steal');
    expect(steals).toHaveLength(1);
    expect(steals[0].title).toContain('coral');
    for (const option of options) expect(() => apply(state, actor, option.action)).not.toThrow();
  });

  it('offers only the targeted player Accept or an owned Block during responses', () => {
    const state = fixture(), actor = state.players[0], target = state.players[1];
    state.pending = { type: 'rent', actor, target };
    state.phase = 'response';
    state.seats[target].hand.push(take(state, 'block'));
    expect(propertyAdviceOptions(state, actor)).toEqual([]);
    const options = propertyAdviceOptions(state, target);
    expect(options.map(option => option.action.type)).toEqual(['accept', 'block']);
    for (const option of options) expect(() => apply(state, target, option.action)).not.toThrow();
  });

  it('offers only valid bank-only payments, including no-change and exact pairs', () => {
    const state = fixture(), actor = state.players[0], target = state.players[1];
    state.pending = { type: 'rent', actor, target };
    state.phase = 'payment';
    state.seats[target].bank.push(take(state, 'money', 1), take(state, 'money', 1), take(state, 'money', 3));
    const options = propertyAdviceOptions(state, target);
    expect(options).toHaveLength(2);
    expect(options.some(option => option.title.includes('no change'))).toBe(true);
    for (const option of options) {
      expect(option.action.type).toBe('pay');
      const next = apply(state, target, option.action);
      expect(next.pending).toBeUndefined();
      expect(next.seats[actor].bank.reduce((sum, card) => sum + card.value, 0)).toBeGreaterThanOrEqual(2);
    }
  });

  it('offers exact end-turn discards and bounds large option lists', () => {
    const state = fixture(), actor = state.players[0];
    state.phase = 'discard';
    state.seats[actor].hand.push(...state.deck.splice(0, 9));
    const options = propertyAdviceOptions(state, actor);
    expect(options).toHaveLength(36);
    for (const option of options) {
      expect(option.action.type).toBe('discard');
      expect(apply(state, actor, option.action).seats[actor].hand).toHaveLength(7);
    }
    state.seats[actor].hand.push(...state.deck.splice(0, 3));
    expect(propertyAdviceOptions(state, actor)).toHaveLength(96);
  });

  it('returns no options off-turn, for outsiders, or after victory', () => {
    const state = fixture();
    expect(propertyAdviceOptions(state, state.players[1])).toEqual([]);
    expect(propertyAdviceOptions(state, 'outsider')).toEqual([]);
    state.status = 'finished';
    expect(propertyAdviceOptions(state, state.players[0])).toEqual([]);
  });

  it('whitelists the opted-in hand and public board without identity or hidden-card leakage', () => {
    const state = fixture(), actor = state.players[0], rival = state.players[1];
    state.seats[actor].hand.push(take(state, 'rent'));
    state.seats[rival].hand.push(take(state, 'steal'));
    state.seats[rival].properties.mint.push(take(state, 'property', 'mint'));
    state.pending = { type: 'steal', actor: rival, target: actor, propertyId: 'not-shared' };
    const context = propertyAdviceContext(state, actor);
    expect(context.yourHand).toEqual([{ kind: 'rent', value: 1 }]);
    expect(context.board).toHaveLength(2);
    for (const seat of context.board) expect(seat).not.toHaveProperty('hand');
    const json = JSON.stringify(context);
    for (const privateValue of [actor, rival, state.seats[actor].hand[0].id, state.seats[rival].hand[0].id, state.deck[0].id, 'not-shared', 'randomState']) expect(json.includes(privateValue)).toBe(false);
    const before = JSON.stringify(context);
    state.deck.push(...state.seats[rival].hand);
    state.seats[rival].hand = [take(state, 'block')];
    state.deck.reverse();
    expect(JSON.stringify(propertyAdviceContext(state, actor))).toBe(before);
  });

  it('includes the publicly requested steal color without its card identifier', () => {
    const state = fixture(), actor = state.players[0], rival = state.players[1];
    const card = take(state, 'property', 'mint');
    state.seats[actor].properties.mint.push(card);
    state.pending = { type: 'steal', actor: rival, target: actor, propertyId: card.id };
    expect(propertyAdviceContext(state, actor).request?.propertyColor).toBe('mint');
    expect(JSON.stringify(propertyAdviceContext(state, actor)).includes(card.id)).toBe(false);
  });
});
