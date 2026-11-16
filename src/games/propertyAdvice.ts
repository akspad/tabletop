import { apply, COLORS, view, type Action, type Card, type State } from './property';

export type AdviceOption = { title: string; action: Action };
export type PropertyAdvice = AdviceOption & { gameId: string; version: number; reason: string };

function cardName(card: Card) {
  return card.kind === 'property' ? `${card.color} property` : card.kind === 'money' ? `${card.value}-value money` : card.kind === 'rent' ? 'Rent' : card.kind === 'steal' ? 'Steal' : 'Block';
}

export function propertyAdviceOptions(state: State, actor: string): AdviceOption[] {
  if (state.status !== 'playing' || !state.players.includes(actor)) return [];
  const options: AdviceOption[] = [];
  const me = state.seats[actor];
  const offer = (action: Action, title: string) => {
    if (options.length >= 96) return;
    try {
      apply(state, actor, action);
      options.push({ action, title });
    } catch {}
  };
  if (state.phase === 'response' || state.phase === 'payment') {
    if (state.pending?.target !== actor) return [];
    if (state.phase === 'response') {
      offer({ type: 'accept' }, state.pending.type === 'rent' ? 'Accept the rent request and pay from your bank.' : 'Accept the property transfer.');
      for (const card of me.hand.filter(card => card.kind === 'block')) offer({ type: 'block', cardId: card.id }, 'Use a Block from your hand to cancel this request.');
    } else {
      const total = me.bank.reduce((sum, card) => sum + card.value, 0);
      if (total < 2) offer({ type: 'pay', cardIds: me.bank.map(card => card.id) }, `Pay your entire bank of ${total}; your hand and properties stay safe.`);
      else {
        for (const card of me.bank.filter(card => card.value >= 2)) offer({ type: 'pay', cardIds: [card.id] }, `Pay rent with your ${card.value}-value bank card${card.value > 2 ? ', with no change' : ''}.`);
        const ones = me.bank.filter(card => card.value === 1);
        for (let i = 0; i < ones.length; i++) for (let j = i + 1; j < ones.length; j++) offer({ type: 'pay', cardIds: [ones[i].id, ones[j].id] }, 'Pay rent with two 1-value bank cards.');
      }
    }
    return options;
  }
  if (state.players[state.turnIndex] !== actor) return [];
  if (state.phase === 'discard') {
    const count = me.hand.length - 7;
    const select = (start: number, cards: Card[]) => {
      if (options.length >= 96) return;
      if (cards.length === count) {
        offer({ type: 'discard', cardIds: cards.map(card => card.id) }, `Discard ${cards.map(cardName).join(' and ')} to finish with seven cards.`);
        return;
      }
      for (let i = start; i < me.hand.length; i++) select(i + 1, [...cards, me.hand[i]]);
    };
    if (count > 0) select(0, []);
    return options;
  }
  if (state.playsLeft > 0) for (const card of me.hand) {
    if (card.kind === 'property') {
      const completes = me.properties[card.color!].length === 1;
      const winning = completes && COLORS.filter(color => me.properties[color].length === 2).length === 2;
      offer({ type: 'place', cardId: card.id }, `Place your ${cardName(card)}${winning ? ' to complete your third set and win' : completes ? ' to complete a set' : ''}.`);
    }
    if (card.kind === 'rent' || card.kind === 'steal') for (const targetId of state.players.filter(id => id !== actor)) {
      const target = `Player ${state.players.indexOf(targetId) + 1}`;
      if (card.kind === 'rent') offer({ type: 'rent', cardId: card.id, targetId }, `Request 2 rent from ${target}.`);
      else for (const color of COLORS) for (const property of state.seats[targetId].properties[color]) {
        offer({ type: 'steal', cardId: card.id, targetId, propertyId: property.id }, `Request ${target}'s incomplete ${color} property.`);
      }
    }
    offer({ type: 'bank', cardId: card.id }, `Bank your ${cardName(card)} for ${card.value}.`);
  }
  offer({ type: 'endTurn' }, me.hand.length > 7 ? `End the play phase, then discard ${me.hand.length - 7} cards.` : 'End your turn.');
  return options;
}

export function propertyAdviceContext(state: State, actor: string) {
  const projection = view(state, actor);
  const alias = (id: string) => id === actor ? 'You' : `Player ${state.players.indexOf(id) + 1}`;
  const face = (card: Card) => ({ kind: card.kind, value: card.value, ...(card.color ? { color: card.color } : {}) });
  const requestedProperty = projection.pending?.type === 'steal'
    ? COLORS.flatMap(color => state.seats[projection.pending.target].properties[color]).find(card => card.id === projection.pending.propertyId)
    : undefined;
  return {
    phase: projection.phase,
    playsLeft: projection.playsLeft,
    deckCount: projection.deckCount,
    discardCount: projection.discardCount,
    yourHand: state.seats[actor].hand.map(face),
    board: projection.seats.map((seat: any) => ({
      player: alias(seat.id), handCount: seat.handCount, bank: seat.bank.map(face),
      properties: Object.fromEntries(COLORS.map(color => [color, seat.properties[color].length])),
    })),
    ...(projection.pending ? { request: { type: projection.pending.type, actor: alias(projection.pending.actor), target: alias(projection.pending.target), ...(requestedProperty?.color ? { propertyColor: requestedProperty.color } : {}) } } : {}),
  };
}
