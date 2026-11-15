import { describe, expect, it } from 'vitest';
import { apply, create, dailyDate, entries, puzzles, scheduledPuzzle, validatePuzzle, view } from '../src/games/crossword';

describe('fixed daily minis', () => {
  it('has three manually checked grids, with every crossing clued and all lengths correct', () => {
    expect(puzzles.length).toBeGreaterThanOrEqual(3);
    for (const puzzle of puzzles) {
      const clues = validatePuzzle(puzzle);
      expect(clues).toHaveLength(10);
      for (const clue of clues) {
        expect(clue.answer).toHaveLength(clue.cells.length);
        expect(clue.answer).toMatch(/^[A-Z]+$/);
      }
      expect(clues.filter(c => c.direction === 'across').map(c => c.answer)).toEqual(puzzle.rows);
      expect(clues.filter(c => c.direction === 'down').map(c => c.answer)).toEqual(puzzle.rows);
      expect(entries(puzzle).filter(c => c.direction === 'across').map(c => c.number)).toEqual([1, 6, 7, 8, 9]);
    }
  });

  it('switches the scheduled puzzle at Los Angeles midnight, not UTC midnight', () => {
    expect(dailyDate(Date.parse('2026-11-16T07:59:59Z'))).toBe('2026-11-15');
    expect(scheduledPuzzle(Date.parse('2026-11-16T07:59:59Z')).id).toBe('mini-2026-11-15');
    expect(scheduledPuzzle(Date.parse('2026-11-16T08:00:00Z')).id).toBe('mini-2026-11-16');
    expect(dailyDate(Date.parse('2026-07-01T06:59:59Z'))).toBe('2026-06-30');
  });

  it('merges independent cell edits without replacing unrelated state', () => {
    const initial = create(['a', 'b'], puzzles[0].id, 1000);
    const first = apply(initial, 'a', { type: 'letter', cell: 0, letter: 'g' }, 2000);
    const second = apply(first, 'b', { type: 'letter', cell: 1, letter: 'a' }, 2000);
    expect(second.letters.slice(0, 2)).toEqual(['G', 'A']);
    expect(initial.letters[0]).toBe('');
    expect(apply(second, 'a', { type: 'letter', cell: 0, letter: 'x' }, 2000).letters.slice(0, 2)).toEqual(['X', 'A']);
  });

  it('runs every prepared puzzle to a real shared completion with elapsed time', () => {
    for (const puzzle of puzzles) {
      let state = create(['a', 'b'], puzzle.id, 1000);
      for (const [cell, letter] of [...puzzle.rows.join('')].entries()) {
        state = apply(state, cell % 2 ? 'a' : 'b', { type: 'letter', cell, letter }, 223000);
      }
      expect(state.status).toBe('finished');
      expect(state.result?.summary).toContain('3:42');
      expect(state.elapsedMs).toBe(222000);
      expect(() => apply(state, 'a', { type: 'letter', cell: 0, letter: 'A' }, 223000)).toThrow();
    }
  });

  it('keeps a running puzzle fixed across midnight and does not return its answer', () => {
    const state = create(['a'], puzzles[0].id, Date.parse('2026-11-16T07:59:59Z'));
    expect(apply(state, 'a', { type: 'letter', cell: 0, letter: 'G' }, Date.parse('2026-11-16T08:00:01Z')).puzzleId).toBe(puzzles[0].id);
    const safe = view(state, 'a');
    expect(safe.grid).toEqual(Array(25).fill(''));
    expect(JSON.stringify(safe)).not.toContain('GAMES');
    expect(() => view(state, 'intruder')).toThrow();
    expect(() => apply(state, 'a', { type: 'letter', cell: 25, letter: 'A' }, 2000)).toThrow();
    expect(() => apply(state, 'intruder', { type: 'letter', cell: 0, letter: 'A' }, 2000)).toThrow();
  });
});
