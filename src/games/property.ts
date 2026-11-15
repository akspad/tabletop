export const COLORS = ['coral', 'amber', 'mint', 'sky', 'plum'] as const;
export type Color = (typeof COLORS)[number];
export type Card = { id: string; kind: 'property' | 'money' | 'rent' | 'steal' | 'block'; value: number; color?: Color };
export type Seat = { hand: Card[]; bank: Card[]; properties: Record<Color, Card[]> };
export type Pending = { type: 'rent' | 'steal'; actor: string; target: string; propertyId?: string };
export type State = {
  status: 'playing' | 'finished';
  players: string[];
  seats: Record<string, Seat>;
  deck: Card[];
  discard: Card[];
  turnIndex: number;
  playsLeft: number;
  phase: 'play' | 'discard' | 'response' | 'payment';
  pending?: Pending;
  randomState: number;
  lastEvent: string;
  result?: { summary: string; winnerId: string };
};
export type Action =
  | { type: 'bank' | 'place'; cardId: string }
  | { type: 'rent'; cardId: string; targetId: string }
  | { type: 'steal'; cardId: string; targetId: string; propertyId: string }
  | { type: 'accept' | 'endTurn' }
  | { type: 'block'; cardId: string }
  | { type: 'pay' | 'discard'; cardIds: string[] };

function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function makeDeck(): Card[] {
  const cards: Card[] = [];
  const add = (kind: Card['kind'], value: number, count: number, color?: Color) => {
    for (let i = 0; i < count; i++) {
      const card: Card = { id: `${kind}-${color ?? value}-${i}`, kind, value };
      if (color) card.color = color;
      cards.push(card);
    }
  };
  for (const color of COLORS) add('property', 1, 6, color);
  add('money', 1, 8);
  add('money', 2, 4);
  add('money', 3, 4);
  add('rent', 1, 6);
  add('steal', 2, 4);
  add('block', 1, 4);
  return cards;
}

function shuffle(cards: Card[], random: () => number): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const sample = random();
    requireRule(Number.isFinite(sample) && sample >= 0 && sample < 1, 'Invalid random source.');
    const j = Math.floor(sample * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

function draw(state: State, player: string, count: number): void {
  for (let i = 0; i < count; i++) {
    if (!state.deck.length && state.discard.length) {
      state.deck = state.discard;
      state.discard = [];
      shuffle(state.deck, () => {
        let x = state.randomState;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        state.randomState = x >>> 0;
        return state.randomState / 4294967296;
      });
    }
    const card = state.deck.pop();
    if (!card) break;
    state.seats[player].hand.push(card);
  }
}

export function create(players: string[], random: () => number = Math.random): State {
  requireRule(players.length >= 2 && players.length <= 4, 'Property Rush needs 2–4 players.');
  requireRule(players.every(id => typeof id === 'string' && id.length > 0) && new Set(players).size === players.length, 'Players must have unique IDs.');
  const deck = makeDeck();
  shuffle(deck, random);
  const seats: Record<string, Seat> = Object.fromEntries(players.map(id => [id, {
    hand: [], bank: [], properties: { coral: [], amber: [], mint: [], sky: [], plum: [] },
  }]));
  const seed = random();
  requireRule(Number.isFinite(seed) && seed >= 0 && seed < 1, 'Invalid random source.');
  const state: State = {
    status: 'playing', players: [...players], seats, deck, discard: [], turnIndex: 0,
    playsLeft: 3, phase: 'play', randomState: Math.floor(seed * 4294967296) || 1,
    lastEvent: 'The first player drew two cards. Play up to three cards, then end your turn.',
  };
  for (let i = 0; i < 5; i++) for (const id of players) draw(state, id, 1);
  draw(state, players[0], 2);
  return state;
}

function take(cards: Card[], id: unknown): Card {
  const index = cards.findIndex(card => card.id === id);
  requireRule(index >= 0, 'Choose a card you own.');
  return cards.splice(index, 1)[0];
}

function selected(cards: Card[], ids: unknown): Card[] {
  requireRule(Array.isArray(ids) && ids.every(id => typeof id === 'string') && new Set(ids).size === ids.length, 'Choose distinct cards.');
  return ids.map(id => {
    const card = cards.find(card => card.id === id);
    requireRule(card, 'Choose a card you own.');
    return card;
  });
}

function checkWinner(state: State, player: string): void {
  if (COLORS.filter(color => state.seats[player].properties[color].length === 2).length < 3) return;
  state.status = 'finished';
  state.result = { winnerId: player, summary: 'Three complete sets! Property Rush has a winner.' };
  state.lastEvent = 'Three complete sets wins the game.';
}

function nextTurn(state: State): void {
  state.turnIndex = (state.turnIndex + 1) % state.players.length;
  state.playsLeft = 3;
  state.phase = 'play';
  draw(state, state.players[state.turnIndex], 2);
  state.lastEvent = 'The next player drew two cards.';
}

function resolve(state: State): void {
  delete state.pending;
  state.phase = 'play';
}

function transferPayment(state: State, pending: Pending, cards: Card[]): void {
  for (const card of cards) state.seats[pending.actor].bank.push(take(state.seats[pending.target].bank, card.id));
  state.lastEvent = `Rent paid: ${cards.reduce((sum, card) => sum + card.value, 0)}. No change is given.`;
  resolve(state);
}

export function apply(input: State, actor: string, action: any): State {
  requireRule(input.status === 'playing', 'This game is finished.');
  requireRule(input.players.includes(actor), 'You are not a player in this game.');
  requireRule(action && typeof action === 'object' && typeof action.type === 'string', 'Choose a valid action.');
  const state: State = JSON.parse(JSON.stringify(input));
  const seat = state.seats[actor];
  if (state.phase === 'response' || state.phase === 'payment') {
    const pending = state.pending;
    requireRule(pending && pending.target === actor, 'Waiting for the targeted player to respond.');
    if (state.phase === 'payment') {
      requireRule(action.type === 'pay', 'Choose your bank payment.');
      const cards = selected(seat.bank, action.cardIds);
      const total = seat.bank.reduce((sum, card) => sum + card.value, 0);
      const payment = cards.reduce((sum, card) => sum + card.value, 0);
      requireRule(total < 2 ? cards.length === seat.bank.length : payment >= 2, 'Pay at least 2, or your entire bank if you have less.');
      transferPayment(state, pending, cards);
      return state;
    }
    if (action.type === 'block') {
      const card = take(seat.hand, action.cardId);
      requireRule(card.kind === 'block', 'Choose a Block card.');
      state.discard.push(card);
      state.lastEvent = 'The action was blocked. Blocks cannot be blocked.';
      resolve(state);
      return state;
    }
    requireRule(action.type === 'accept', 'Accept or use a Block card.');
    if (pending.type === 'rent') {
      const total = seat.bank.reduce((sum, card) => sum + card.value, 0);
      if (total <= 2) transferPayment(state, pending, [...seat.bank]);
      else {
        state.phase = 'payment';
        state.lastEvent = 'The target is choosing banked cards totaling at least 2.';
      }
    } else {
      const property = COLORS.flatMap(color => seat.properties[color]).find(card => card.id === pending.propertyId);
      requireRule(property?.color && seat.properties[property.color].length < 2, 'Complete property sets are protected.');
      requireRule(state.seats[pending.actor].properties[property.color].length < 2, 'That property color is already full.');
      state.seats[pending.actor].properties[property.color].push(take(seat.properties[property.color], property.id));
      state.lastEvent = 'An unprotected property changed hands.';
      resolve(state);
      checkWinner(state, pending.actor);
    }
    return state;
  }
  requireRule(state.players[state.turnIndex] === actor, 'It is not your turn.');
  if (state.phase === 'discard') {
    requireRule(action.type === 'discard', 'Discard down to seven to finish your turn.');
    const cards = selected(seat.hand, action.cardIds);
    requireRule(cards.length === seat.hand.length - 7, `Discard exactly ${seat.hand.length - 7} cards.`);
    for (const card of cards) state.discard.push(take(seat.hand, card.id));
    nextTurn(state);
    return state;
  }
  if (action.type === 'endTurn') {
    if (seat.hand.length > 7) {
      state.phase = 'discard';
      state.lastEvent = 'Discard down to seven cards to finish this turn.';
    } else nextTurn(state);
    return state;
  }
  requireRule(state.playsLeft > 0, 'You have played three cards. End your turn.');
  requireRule(['bank', 'place', 'rent', 'steal'].includes(action.type), 'Choose a valid play.');
  const card = take(seat.hand, action.cardId);
  if (action.type === 'bank') {
    seat.bank.push(card);
    state.lastEvent = `A card was banked for ${card.value}. It is now money only.`;
  } else if (action.type === 'place') {
    requireRule(card.kind === 'property' && card.color, 'Choose a property card.');
    requireRule(seat.properties[card.color].length < 2, 'You may own only two properties of each color.');
    seat.properties[card.color].push(card);
    state.lastEvent = 'A property was placed.';
    checkWinner(state, actor);
  } else {
    requireRule(card.kind === action.type, `Choose a ${action.type} card.`);
    requireRule(state.players.includes(action.targetId) && action.targetId !== actor, 'Choose an opponent.');
    if (action.type === 'rent') {
      requireRule(COLORS.some(color => seat.properties[color].length > 0), 'Own a property before charging rent.');
      state.pending = { type: 'rent', actor, target: action.targetId };
    } else {
      const target = state.seats[action.targetId];
      const property = COLORS.flatMap(color => target.properties[color]).find(card => card.id === action.propertyId);
      requireRule(property?.color && target.properties[property.color].length < 2, 'Choose a property in an incomplete set.');
      requireRule(seat.properties[property.color].length < 2, 'You already have two properties of that color.');
      state.pending = { type: 'steal', actor, target: action.targetId, propertyId: property.id };
    }
    state.discard.push(card);
    state.phase = 'response';
    state.lastEvent = 'Waiting for the target to accept or block.';
  }
  state.playsLeft--;
  return state;
}

export function view(state: State, viewer: string): any {
  requireRule(state.players.includes(viewer), 'You are not a player in this game.');
  const projection: any = {
    status: state.status, players: [...state.players], turnPlayerId: state.players[state.turnIndex],
    playsLeft: state.playsLeft, phase: state.phase, deckCount: state.deck.length,
    discardCount: state.discard.length, lastEvent: state.lastEvent,
    seats: state.players.map(id => {
      const seat = state.seats[id];
      const publicSeat: any = {
        id, handCount: seat.hand.length,
        bank: seat.bank.map(card => ({ ...card })),
        properties: Object.fromEntries(COLORS.map(color => [color, seat.properties[color].map(card => ({ ...card }))])),
      };
      if (id === viewer) publicSeat.hand = seat.hand.map(card => ({ ...card }));
      return publicSeat;
    }),
  };
  if (state.pending) projection.pending = { ...state.pending };
  if (state.result) projection.result = { ...state.result };
  return projection;
}
