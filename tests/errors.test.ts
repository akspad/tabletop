import { ConvexError } from 'convex/values';
import { describe, expect, it } from 'vitest';
import { cleanError } from '../src/errors';

describe('human-readable errors', () => {
  it('uses a structured expected error without framework decoration', () => {
    expect(cleanError(new ConvexError({ code: 'COOLDOWN', message: 'Give Keiki a moment before your next question.', retryAfterMs: 3_000 }))).toBe('Give Keiki a moment before your next question.');
    expect(cleanError(new ConvexError('Use the rules or practice tutorial.'))).toBe('Use the rules or practice tutorial.');
  });

  it('removes Convex, request, and Uncaught Error prefixes from older errors', () => {
    expect(cleanError(new Error('[CONVEX A(keiki:ask)] [Request ID: abc123] Server Error\nUncaught Error: Wait five seconds before asking another question.\n  at handler'))).toBe('Wait five seconds before asking another question.');
    expect(cleanError(new Error('Uncaught Error: Join this table first.'))).toBe('Join this table first.');
  });

  it('keeps unknown errors safe and bounds displayed messages', () => {
    expect(cleanError(new ConvexError({ unexpected: true }))).toBe('Something went wrong. Please try again.');
    expect(cleanError(null)).toBe('Something went wrong. Please try again.');
    expect(cleanError(new Error('x'.repeat(300)))).toHaveLength(240);
  });
});
