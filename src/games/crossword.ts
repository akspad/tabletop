export type Direction = 'across' | 'down';
export type Puzzle = { id: string; date: string; title: string; rows: string[]; across: string[]; down: string[] };
export type Clue = { number: number; direction: Direction; clue: string; cells: number[] };

export const puzzles: Puzzle[] = [
  { id: 'mini-2026-11-15', date: '2026-11-15', title: 'Around the table',
    rows: ['GAMES', 'ALERT', 'METRO', 'ERROR', 'STORE'],
    across: ['What brought us to this table', 'Wide awake and paying attention', 'An urban rail system', 'A mistake in the code', 'A place to buy a board game'],
    down: ['Activities with rules and a winner (sometimes)', 'A warning on your phone', 'The subway, in Paris', 'What an undo button might fix', 'Keep something for later'] },
  { id: 'mini-2026-11-16', date: '2026-11-16', title: 'A little room to grow',
    rows: ['PLANT', 'LOWER', 'AWARE', 'NERVE', 'TREES'],
    across: ['A green roommate that needs watering', 'Move a little farther down', 'Conscious of what is happening', 'Courage to make the first move', 'Park residents with branches'],
    down: ['Put a seed in the ground', 'Turn down, as the volume', 'In the know', 'A messenger between brain and body', 'Sources of shade on a sunny day'] },
  { id: 'mini-2026-11-17', date: '2026-11-17', title: 'Make yourself at home',
    rows: ['HEART', 'EMBER', 'ABUSE', 'RESIN', 'TREND'],
    across: ['A symbol on a valentine', 'A last glowing bit of the campfire', 'Treat badly or misuse', 'Sticky substance from a pine', 'A direction fashion is moving'],
    down: ['The organ that keeps the beat', 'A coal still glowing after the flames', 'Misuse, as a privilege', 'Material used to cast a keepsake', 'Something suddenly everyone is doing'] },
];

export function entries(puzzle: Puzzle): Clue[] {
  const clues: Clue[] = [];
  let number = 0;
  const indices = { across: 0, down: 0 };
  for (let cell = 0; cell < 25; cell++) {
    const row = Math.floor(cell / 5), col = cell % 5;
    if (puzzle.rows[row][col] === '#') continue;
    const starts = {
      across: (col === 0 || puzzle.rows[row][col - 1] === '#') && col < 4 && puzzle.rows[row][col + 1] !== '#',
      down: (row === 0 || puzzle.rows[row - 1][col] === '#') && row < 4 && puzzle.rows[row + 1][col] !== '#',
    };
    if (starts.across || starts.down) number++;
    for (const direction of ['across', 'down'] as const) {
      if (!starts[direction]) continue;
      const cells: number[] = [];
      for (let r = row, c = col; r < 5 && c < 5 && puzzle.rows[r][c] !== '#'; direction === 'across' ? c++ : r++) cells.push(r * 5 + c);
      const clue = puzzle[direction][indices[direction]++];
      if (!clue) throw new Error('Every entry needs a clue.');
      clues.push({ number, direction, clue, cells });
    }
  }
  if (indices.across !== puzzle.across.length || indices.down !== puzzle.down.length) throw new Error('Clue count does not match the grid.');
  return clues;
}

export function validatePuzzle(puzzle: Puzzle) {
  if (puzzle.rows.length !== 5 || puzzle.rows.some(row => !/^[A-Z#]{5}$/.test(row))) throw new Error('A mini must be a 5 by 5 grid.');
  const clues = entries(puzzle);
  for (let cell = 0; cell < 25; cell++) {
    if (puzzle.rows[Math.floor(cell / 5)][cell % 5] === '#') continue;
    if (!clues.some(clue => clue.direction === 'across' && clue.cells.includes(cell)) || !clues.some(clue => clue.direction === 'down' && clue.cells.includes(cell))) throw new Error('Every white cell must cross two clued entries.');
  }
  return clues.map(clue => ({ ...clue, answer: clue.cells.map(cell => puzzle.rows[Math.floor(cell / 5)][cell % 5]).join('') }));
}

export function dailyDate(now: number) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}

export function scheduledPuzzle(now: number) {
  const date = dailyDate(now);
  const exact = puzzles.find(p => p.date === date);
  if (exact) return exact;
  const index = Math.abs(Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000)) % puzzles.length;
  return puzzles[index];
}

export type State = {
  status: 'playing' | 'finished'; players: string[]; puzzleId: string; date: string;
  letters: string[]; editors: { playerId: string; cell: number; direction: Direction }[];
  startedAt: number; elapsedMs?: number; result?: { summary: string; score: number };
};

export function create(players: string[], puzzleId: string, now: number): State {
  const puzzle = puzzles.find(p => p.id === puzzleId);
  if (!puzzle) throw new Error('That mini is not available.');
  validatePuzzle(puzzle);
  return { status: 'playing', players: [...players], puzzleId, date: dailyDate(now), letters: puzzle.rows.join('').split('').map(c => c === '#' ? '#' : ''), editors: [], startedAt: now };
}

export function apply(state: State, actor: string, action: any, now: number): State {
  if (!state.players.includes(actor)) throw new Error('Join this table first.');
  if (state.status !== 'playing') throw new Error('This puzzle is already complete.');
  if (!action || !Number.isInteger(action.cell) || action.cell < 0 || action.cell >= 25 || state.letters[action.cell] === '#') throw new Error('Choose a white cell.');
  const next = { ...state, letters: [...state.letters], editors: state.editors.map(e => ({ ...e })) };
  if (action.type === 'focus') {
    if (action.direction !== 'across' && action.direction !== 'down') throw new Error('Choose Across or Down.');
    next.editors = next.editors.filter(e => e.playerId !== actor);
    next.editors.push({ playerId: actor, cell: action.cell, direction: action.direction });
    return next;
  }
  if (action.type !== 'letter' || typeof action.letter !== 'string' || !/^[A-Za-z]?$/.test(action.letter)) throw new Error('Enter one letter.');
  next.letters[action.cell] = action.letter.toUpperCase();
  const puzzle = puzzles.find(p => p.id === state.puzzleId)!;
  if (next.letters.join('') === puzzle.rows.join('')) {
    next.status = 'finished';
    next.elapsedMs = Math.max(0, now - state.startedAt);
    const seconds = Math.floor(next.elapsedMs / 1000);
    next.result = { summary: `We solved Tabletop’s Daily Mini in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.`, score: 25 - next.letters.filter(c => c === '#').length };
  }
  return next;
}

export function view(state: State, viewer: string) {
  if (!state.players.includes(viewer)) throw new Error('This seat is not at the table.');
  const puzzle = puzzles.find(p => p.id === state.puzzleId)!;
  return { ...state, title: puzzle.title, grid: puzzle.rows.join('').split('').map(c => c === '#' ? '#' : ''), clues: entries(puzzle) };
}
