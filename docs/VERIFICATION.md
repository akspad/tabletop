# Verification record

All dates below are November 15, 2026. This record distinguishes a real Convex game, a rendered browser check, and a Revyl cloud-phone check from a physical-device check.

## Mobile clarity and Keiki follow-up

- Final TypeScript and all 120 unit/Convex tests passed. All 17 browser E2Es passed on both the local final source and the published HTTPS site with the real Convex backend and Keiki agent; the corrected selected-payment test also passed three additional shuffled deals. Final web, iOS, and Android JavaScript/Hermes exports passed.
- At 390×844 and 320×640, tests verified that home game tiles select a game without creating or starting a table, the host's single lobby Play button stays visible while content scrolls, and the compact crossword retains square cells, a visible clue/input, first-tap focus, typing, and backspace. Separate Rules controls still open the existing tutorials.
- A real, explicitly submitted browser question received a Keiki explanation. Opening the helper and selecting an example caused no action request, and returning left the same room in the lobby. A separate live Convex action compared the full table before/after and confirmed no game change.
- Keiki's connected agent answered the bank-only/no-change and Hanabi final-round/full-token cases, and refused requests to inspect hidden hands or contact friends. It has no game-state tools or messaging channels. Keiki's API gateway is enabled without passthrough; only the Convex server holds its credential.
- Public source and exported web assets were checked against the configured credential values before publication. The native physical-phone route remains Expo Go, not a signed installation package.
- Follow-up checks cover delayed initial daily data, first and repeated game selections, the prominent selected-game form label, removal of the separate daily button, two static Coming soon tiles, host-only lobby selections, and the exact guest waiting message. Host and guest chat buttons are checked immediately left of the rules button, including first-tap entry and mode reset. Browser clock control verifies the retry countdown without depending on model latency. A real concurrent API check returned one answer and one structured COOLDOWN response with a remaining delay, not an unhandled exception.

### Final follow-up native build

Capy build `01M7GZM0SXQVR3RTB75ATJ2H9X`, Revyl version `0b4c43d5-3cea-4103-8b08-72b8c540bfc3`, succeeded and was installed on the iPhone 16. The native chat button is directly left of the question mark and opens the helper on its first tap. Typing a question and using the iOS keyboard's Send action dismissed the keyboard, returned a real Keiki answer, and showed the friendly short retry countdown. Native crossword typing retained a visible active clue above the keyboard. The preceding follow-up build verified the fixed lobby Play safe area and first Property Rush selection scrolling to the full creation form; that unchanged flow also has final browser regressions at both phone sizes. The final root bundle contains the new entry, guest, Coming soon, and error behavior; the earlier tutorial-specific native evidence below remains separately identified.

## Automated and live backend checks

- The standalone public checkout passed `npm ci`, TypeScript, all 102 unit/Convex tests, and Expo exports for web, iOS, and Android. Tests cover membership, host authorization, malformed sessions, stale versions, retry IDs, cross-table privacy, concurrent crossword cells, fixed crossings, Pacific scheduling, Hanabi matching/tokens/final turns, and Property Rush payments/blocks/protection/victory. An export is not a device test.
- `scripts/verify-live.mjs` completed all three games against `formal-cat-696` with three independently generated guest sessions. No fixture state was inserted into the live deployment. The final recorded run, 23:20:26–23:20:43 UTC in room SLC9VH, finished the crossword, reached Hanabi's final round with 34 clues and 3 informed plays, and finished Property Rush with 2 rent responses, 2 selected payments, 3 steals, and a real winner. That run had no blocks; the earlier retained run exercised a Block.
- Browser E2E uses independent storage contexts, actual Convex mutations, fast typing/backspace/Down navigation, both players refreshing, shared completion, direct rematch, result copying, prepared-puzzle selection, and response/payment visibility after scrolling.
- The standalone checkout's original eight browser E2Es passed against the published HTTPS site at approximately 4:09 p.m. Pacific. They include live host game-switch cancel/confirm and all tutorial tasks at 390×844 and 320×640. Repeated verification exposed a shuffled rent-test setup error: a target bank of exactly 2 correctly settles immediately on Accept, but the test expected manual payment selection. The setup now requires a bank greater than 2 to exercise the intended selection branch; the existing response/payment visibility assertions and game rules are unchanged.
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
- Keiki was added later as an optional rules-only API agent. Its setup, privacy boundary, limits, and verification are recorded in [Keiki integration](keiki.md). No messaging channels or contacts are connected. The initially supplied server-only key is organization-wide; an agent-bound replacement is recommended.
