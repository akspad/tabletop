export const COLORS = ['red', 'yellow', 'green', 'blue', 'white'] as const;
export const NUMBERS = [1, 2, 3, 4, 5] as const;
export type Color = (typeof COLORS)[number];
export type CardNumber = (typeof NUMBERS)[number];
export type Clue = { kind: 'color'; value: Color } | { kind: 'number'; value: CardNumber };
export type Action = { type: 'play' | 'discard'; cardId: string } | { type: 'clue'; targetId: string; clue: Clue };
export type Knowledge = { colors: Color[]; notColors: Color[]; numbers: CardNumber[]; notNumbers: CardNumber[] };
export type Card = { id: string; color: Color; number: CardNumber; clues: Knowledge };
export type PlayMove = { sequence: number; actorId: string; card: { color: Color; number: CardNumber }; outcome: 'success' | 'mistake' };
export type State = {
  status: 'playing' | 'finished';
  players: string[];
  turnIndex: number;
  hands: Record<string, Card[]>;
  deck: Card[];
  fireworks: Record<Color, number>;
  discards: { id: string; color: Color; number: CardNumber }[];
  clueTokens: number;
  fusesRemaining: number;
  finalTurnsRemaining: number | null;
  lastAction: string | null;
  moveSequence?: number;
  lastMove?: PlayMove | null;
  result?: { summary: string; score: number };
};
export type HiddenCard = { id: string; clues: Knowledge };
export type GameView = {
  status: State['status'];
  players: string[];
  turnPlayerId: string;
  hands: Record<string, (HiddenCard | Card)[]>;
  fireworks: Record<Color, number>;
  discards: State['discards'];
  clueTokens: number;
  fusesRemaining: number;
  deckCount: number;
  finalTurnsRemaining: number | null;
  score: number;
  lastAction: string | null;
  moveSequence: number;
  lastMove: PlayMove | null;
  legalActions: Action[];
};

export function actionsMatch(left: Action, right: Action): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'clue' && right.type === 'clue') {
    return left.targetId === right.targetId && left.clue.kind === right.clue.kind && left.clue.value === right.clue.value;
  }
  return left.type !== 'clue' && right.type !== 'clue' && left.cardId === right.cardId;
}

function knowledge(): Knowledge {
  return { colors: [], notColors: [], numbers: [], notNumbers: [] };
}

function copyClues(clues: Knowledge): Knowledge {
  return { colors: [...clues.colors], notColors: [...clues.notColors], numbers: [...clues.numbers], notNumbers: [...clues.notNumbers] };
}

function copyCard(card: Card): Card {
  return { ...card, clues: copyClues(card.clues) };
}

export function create(players: string[], random: () => number = Math.random): State {
  if (!Array.isArray(players) || players.length < 2 || players.length > 5 || players.some(id => typeof id !== 'string' || !id.trim()) || new Set(players).size !== players.length) {
    throw new Error('Hanabi requires 2–5 distinct players.');
  }
  const faces = COLORS.flatMap(color => NUMBERS.flatMap(number => Array.from({ length: number === 1 ? 3 : number === 5 ? 1 : 2 }, () => ({ color, number }))));
  for (let i = faces.length - 1; i > 0; i--) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('Random values must be in [0, 1).');
    const j = Math.floor(sample * (i + 1));
    [faces[i], faces[j]] = [faces[j], faces[i]];
  }
  const deck = faces.map((face, i) => ({ ...face, id: `card-${i + 1}`, clues: knowledge() }));
  const hands: State['hands'] = Object.fromEntries(players.map(id => [id, []]));
  for (let slot = 0; slot < (players.length < 4 ? 5 : 4); slot++) {
    for (const id of players) hands[id].push(deck.shift()!);
  }
  return {
    status: 'playing', players: [...players], turnIndex: 0, hands, deck,
    fireworks: { red: 0, yellow: 0, green: 0, blue: 0, white: 0 },
    discards: [], clueTokens: 8, fusesRemaining: 3, finalTurnsRemaining: null, lastAction: null, moveSequence: 0, lastMove: null,
  };
}

function matches(card: Card, clue: Clue): boolean {
  return clue.kind === 'color' ? card.color === clue.value : card.number === clue.value;
}

function score(state: State): number {
  return COLORS.reduce((total, color) => total + state.fireworks[color], 0);
}

export function apply(state: State, actor: string, action: any): State {
  if (state.status !== 'playing') throw new Error('The game has finished.');
  if (!state.players.includes(actor) || state.players[state.turnIndex] !== actor) throw new Error('It is not your turn.');
  if (!action || typeof action !== 'object') throw new Error('Choose a valid action.');
  if (action.type === 'clue') {
    if (state.clueTokens < 1) throw new Error('No clue tokens remain.');
    if (!state.players.includes(action.targetId) || action.targetId === actor) throw new Error('Give a clue to another player.');
    const clue = action.clue;
    if (!clue || !((clue.kind === 'color' && COLORS.includes(clue.value)) || (clue.kind === 'number' && NUMBERS.includes(clue.value)))) throw new Error('Choose a base color or a number from 1 to 5.');
    if (!state.hands[action.targetId].some(card => matches(card, clue))) throw new Error('A clue must match at least one card.');
  } else if (action.type === 'play' || action.type === 'discard') {
    if (typeof action.cardId !== 'string' || !state.hands[actor].some(card => card.id === action.cardId)) throw new Error('Choose a card in your hand.');
    if (action.type === 'discard' && state.clueTokens === 8) throw new Error('You cannot discard with all 8 clue tokens.');
  } else {
    throw new Error('Unknown Hanabi action.');
  }
  const next: State = {
    ...state,
    moveSequence: (state.moveSequence ?? state.lastMove?.sequence ?? 0) + 1,
    lastMove: null,
    players: [...state.players],
    hands: Object.fromEntries(state.players.map(id => [id, state.hands[id].map(copyCard)])),
    deck: state.deck.map(copyCard),
    fireworks: { ...state.fireworks },
    discards: state.discards.map(card => ({ ...card })),
  };
  if (action.type === 'clue') {
    const clue: Clue = action.clue;
    next.clueTokens--;
    for (const card of next.hands[action.targetId]) {
      const positive = matches(card, clue);
      if (clue.kind === 'color') {
        const values = positive ? card.clues.colors : card.clues.notColors;
        if (!values.includes(clue.value)) values.push(clue.value);
      } else {
        const values = positive ? card.clues.numbers : card.clues.notNumbers;
        if (!values.includes(clue.value)) values.push(clue.value);
      }
    }
    next.lastAction = `${actor} told ${action.targetId}: ${clue.kind} ${clue.value}.`;
  } else {
    const index = next.hands[actor].findIndex(card => card.id === action.cardId);
    const [card] = next.hands[actor].splice(index, 1);
    const face = { id: card.id, color: card.color, number: card.number };
    if (action.type === 'discard') {
      next.discards.push(face);
      next.clueTokens++;
      next.lastAction = `${actor} discarded ${card.color} ${card.number}.`;
    } else if (card.number === next.fireworks[card.color] + 1) {
      next.fireworks[card.color] = card.number;
      if (card.number === 5) next.clueTokens = Math.min(8, next.clueTokens + 1);
      next.lastAction = `${actor} played ${card.color} ${card.number}.`;
    } else {
      next.discards.push(face);
      next.fusesRemaining--;
      next.lastAction = `${actor} tried ${card.color} ${card.number}: one fuse lost.`;
    }
    if (action.type === 'play') {
      next.lastMove = { sequence: next.moveSequence!, actorId: actor, card: { color: card.color, number: card.number }, outcome: next.fusesRemaining < state.fusesRemaining ? 'mistake' : 'success' };
    }
    if (next.fusesRemaining > 0 && score(next) < 25 && next.deck.length > 0) {
      next.hands[actor].push(next.deck.shift()!);
      if (next.deck.length === 0) next.finalTurnsRemaining = next.players.length;
    }
  }
  if (state.finalTurnsRemaining !== null) next.finalTurnsRemaining = state.finalTurnsRemaining - 1;
  const total = score(next);
  if (next.fusesRemaining === 0 || total === 25 || next.finalTurnsRemaining === 0) {
    next.status = 'finished';
    next.result = {
      score: next.fusesRemaining === 0 ? 0 : total,
      summary: next.fusesRemaining === 0 ? 'The fireworks exploded. No fuses remain.' : total === 25 ? 'Perfect fireworks! All five colors are complete.' : `Final round complete: ${total} of 25 points.`,
    };
  }
  next.turnIndex = (state.turnIndex + 1) % state.players.length;
  return next;
}

export function view(state: State, viewer: string): GameView {
  if (!state.players.includes(viewer)) throw new Error('Only seated players can view Hanabi.');
  const legalActions: Action[] = [];
  if (state.status === 'playing' && state.players[state.turnIndex] === viewer) {
    for (const card of state.hands[viewer]) {
      legalActions.push({ type: 'play', cardId: card.id });
      if (state.clueTokens < 8) legalActions.push({ type: 'discard', cardId: card.id });
    }
    if (state.clueTokens > 0) {
      for (const targetId of state.players.filter(id => id !== viewer)) {
        for (const color of COLORS) {
          if (state.hands[targetId].some(card => card.color === color)) legalActions.push({ type: 'clue', targetId, clue: { kind: 'color', value: color } });
        }
        for (const number of NUMBERS) {
          if (state.hands[targetId].some(card => card.number === number)) legalActions.push({ type: 'clue', targetId, clue: { kind: 'number', value: number } });
        }
      }
    }
  }
  return {
    status: state.status,
    players: [...state.players],
    turnPlayerId: state.players[state.turnIndex],
    hands: Object.fromEntries(state.players.map(id => [id, state.hands[id].map(card => id === viewer ? { id: card.id, clues: copyClues(card.clues) } : copyCard(card))])),
    fireworks: { ...state.fireworks },
    discards: state.discards.map(card => ({ ...card })),
    clueTokens: state.clueTokens,
    fusesRemaining: state.fusesRemaining,
    deckCount: state.deck.length,
    finalTurnsRemaining: state.finalTurnsRemaining,
    score: score(state),
    lastAction: state.lastAction,
    moveSequence: state.moveSequence ?? state.lastMove?.sequence ?? 0,
    lastMove: state.lastMove ? { sequence: state.lastMove.sequence, actorId: state.lastMove.actorId, card: { color: state.lastMove.card.color, number: state.lastMove.card.number }, outcome: state.lastMove.outcome } : null,
    legalActions,
  };
}
