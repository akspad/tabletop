# Verification record

All dates below are November 15, 2026. This record distinguishes a real Convex game, a rendered browser check, and a Revyl cloud-phone check from a physical-device check.

## Automated and live backend checks

- The standalone public checkout passed `npm ci`, TypeScript, all 102 unit/Convex tests, and Expo exports for web, iOS, and Android. Tests cover membership, host authorization, malformed sessions, stale versions, retry IDs, cross-table privacy, concurrent crossword cells, fixed crossings, Pacific scheduling, Hanabi matching/tokens/final turns, and Property Rush payments/blocks/protection/victory. An export is not a device test.
- `scripts/verify-live.mjs` completed all three games against `formal-cat-696` with three independently generated guest sessions. No fixture state was inserted into the live deployment. The final recorded run, 23:20:26–23:20:43 UTC in room SLC9VH, finished the crossword, reached Hanabi's final round with 34 clues and 3 informed plays, and finished Property Rush with 2 rent responses, 2 selected payments, 3 steals, and a real winner. That run had no blocks; the earlier retained run exercised a Block.
- Browser E2E uses independent storage contexts, actual Convex mutations, fast typing/backspace/Down navigation, both players refreshing, shared completion, direct rematch, result copying, prepared-puzzle selection, and response/payment visibility after scrolling.
- The standalone checkout's eight browser E2Es passed against the published HTTPS site at approximately 4:09 p.m. Pacific. They include live host game-switch cancel/confirm and all tutorial tasks at 390×844 and 320×640. An earlier run had seven passes and one false-negative: the shuffled rent test permits a target bank of exactly 2, which the correct game rules settle immediately on Accept, but the test then expects manual payment selection. The unchanged suite passed on the next deal; this setup edge case remains a known automation limitation, not a claim of deterministic CI.
- Two hosted browser clients verified shared Hanabi success and all three mistake events, including the final mistake over results, expiration, refresh-history suppression, reduced motion, and nonblocking interaction. The recording shows real confirmed plays, not a tutorial simulation.

## Revyl iOS

The iPhone 16 cloud session ran the real Release app, not a screenshot prototype.

Verified in the native app with an HTTPS browser guest:

- Launch, table creation, room code and QR, and a guest joining the same table.
- Native crossword typing, Down navigation, double Backspace, visible active clue above the keyboard, shared browser letters, and shared completion/results.
- Background/reopen restoring the same seat and state, including a pending Property Rush response.
- Hanabi hidden own cards, visible teammate cards, a legal clue, and a successful informed play advancing the score and deck.
- Property Rush banking, end turn, Rent acceptance, selecting bank cards worth 2, payment transfer, and the same outcome on both clients.

Native testing found and fixed two scroll cases and a transport-key-order bug that had disabled live Hanabi controls. Browser regression checks cover those failures.

### Final tutorial build

Release build 6, Capy build `01M7GSDMQCV66NZNE5MKN77WJ6`, Revyl version `bb99dc8e-f86f-4d4c-8f87-d1f3369d970b`, includes the final action-first tutorials. On the iPhone 16 at approximately 3:55–4:12 p.m. Pacific:

- Completed all five Hanabi practice steps: visible versus hidden cards, marking every matching Red card and spending a token, a wrong Blue 3 followed by a correct Red 2, discarding to restore the eighth token, and B/C/A each taking a final turn including the last-card drawer.
- Completed all six Property Rush practice steps: a third distinct-color set, drawing then banking an action as money, rejecting a payment of 1 then transferring 3 without change, blocking a steal, stealing an eligible incomplete property, and discarding from eight to seven before ending the turn. Closing and reopening reset the practice to step one.
- Created a fresh native table, started the live Daily Mini, and confirmed the final 5×5 grid renders square. Native accessibility bounds measured the cells at 68–69 points per side, and the rendered screenshot confirmed the layout.

These tutorials use imaginary local practice hands; they are not evidence of live card-game outcomes. Shared animation behavior was verified in hosted browsers, but a final-build native animation pass is not claimed. Revyl session/app restarts interrupted testing; cloud-session replacement is not evidence of storage surviving a reinstall or a new device.

## Limits

- A Revyl iPhone is a cloud simulator, not a physical iPhone. No physical-device pass is claimed without a person's actual phone result.
- The native build is an unsigned simulator `.app`. Physical native use is through Expo Go unless a separate signed distribution build is prepared.
- Android JavaScript export passed, but no Android device or native Android build test is claimed.
- `npm audit` reported five moderate advisories in Expo tooling dependencies (`minimatch` via Expo fingerprinting and `uuid` via the development tunnel package), with no high or critical advisories. The proposed major Expo downgrade was not applied.
- GitHub Actions is not installed because the publication credential lacked workflow permission. `docs/ci-workflow.yml` is an optional recipe, not an active CI run.
- Internet is required. There is no offline peer-to-peer mode, public matchmaking, seat eviction, friend graph, voice/video, or app-store distribution.
- The three fixed puzzles are word-square minis, so Across and Down share an answer set. Additional prepared dates rotate this bank; new editorial puzzles are not generated live.
- Keiki was skipped because its plugin was not connected and no configured channel was available.
