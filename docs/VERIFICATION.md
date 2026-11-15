# Verification record

All dates below are November 15, 2026. This record distinguishes a real Convex game, a rendered browser check, and a Revyl cloud-phone check from a physical-device check.

## Automated and live backend checks

- TypeScript and the focused unit/Convex test suite pass. Tests cover membership, host authorization, malformed sessions, stale versions, retry IDs, cross-table privacy, concurrent crossword cells, fixed crossings, Pacific scheduling, Hanabi matching/tokens/final turns, and Property Rush payments/blocks/protection/victory.
- `scripts/verify-live.mjs` completed all three games against `formal-cat-696` with three independently generated guest sessions. No fixture state was inserted into the live deployment. Hanabi reached the final round with informed plays and no mistakes; Property Rush included rent responses, selected payments, a block, steals, and a real winner.
- Browser E2E uses independent storage contexts, actual Convex mutations, fast typing/backspace/Down navigation, both players refreshing, shared completion, direct rematch, result copying, prepared-puzzle selection, and response/payment visibility after scrolling.

## Revyl iOS

The iPhone 16 cloud session ran the real Release app, not a screenshot prototype.

Verified in the native app with an HTTPS browser guest:

- Launch, table creation, room code and QR, and a guest joining the same table.
- Native crossword typing, Down navigation, double Backspace, visible active clue above the keyboard, shared browser letters, and shared completion/results.
- Background/reopen restoring the same seat and state, including a pending Property Rush response.
- Hanabi hidden own cards, visible teammate cards, a legal clue, and a successful informed play advancing the score and deck.
- Property Rush banking, end turn, Rent acceptance, selecting bank cards worth 2, payment transfer, and the same outcome on both clients.

Native testing found and fixed two scroll cases and a transport-key-order bug that had disabled live Hanabi controls. Browser regression checks cover those failures. Final builds must be rechecked after later UI changes, including animations and tutorials; build identifiers and final evidence are recorded in the handoff.

## Limits

- A Revyl iPhone is a cloud simulator, not a physical iPhone. No physical-device pass is claimed without a person's actual phone result.
- The native build is an unsigned simulator `.app`. Physical native use is through Expo Go unless a separate signed distribution build is prepared.
- Internet is required. There is no offline peer-to-peer mode, public matchmaking, seat eviction, friend graph, voice/video, or app-store distribution.
- The three fixed puzzles are word-square minis, so Across and Down share an answer set. Additional prepared dates rotate this bank; new editorial puzzles are not generated live.
- Keiki was skipped because its plugin was not connected and no configured channel was available.
