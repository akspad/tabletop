# Tabletop

**Your friends are here. Start playing in 30 seconds.**

A fresh Expo + React Native + TypeScript app for a private, reusable game table. Guests use secure device sessions without registering an email address. Convex owns the seats, actions, hidden-information projections, daily progress, and results.

## Open it

- **Browser, including phone guests:** https://formal-cat-696.convex.site
- **Invite format:** `https://formal-cat-696.convex.site/?code=YOURCODE`. The lobby supplies the actual code, QR, and copy/share controls. An invite never contains a host credential.
- **Native host:** use Expo Go with the running demo tunnel, or start a tunnel from this folder. The Revyl iOS build is a simulator Release build; it is not a signed physical-iPhone installation package.

```sh
git clone https://github.com/akspad/tabletop.git
cd tabletop
npm ci
cp .env.example .env.local
```

Set these public values in `.env.local`, then run `npm run tunnel` and open its QR/link in Expo Go:

```dotenv
EXPO_PUBLIC_CONVEX_URL=https://formal-cat-696.convex.cloud
EXPO_PUBLIC_APP_URL=https://formal-cat-696.convex.site
```

The browser site is hosted by Convex HTTP actions and storage, so it does not depend on the development machine or Expo tunnel remaining awake. Native Expo Go does need its Metro tunnel to remain running. See [publishing](docs/hosting.md) to update the browser build.

## The games

**Daily Mini, 1–5 players.** One shared 5×5 crossword with simultaneous cell-level edits, Across/Down navigation, shared elapsed time, cursors, and per-device completion. Three fixed, checked puzzles are prepared for November 15–17, 2026. The daily timezone is America/Los_Angeles; a running game retains its puzzle. After the prepared dates, the existing puzzle bank rotates rather than generating new grids. Completion remains scoped to the date.

**Hanabi, 2–5 players.** Standard five-color base rules, all matching positive/negative clues, full token and fuse accounting, and the final round including the last-card drawer. Queries never return a player's own unrevealed card faces or the deck. Confirmed plays produce shared success/mistake feedback; no animation decides an outcome. Motion settings are respected.

**Property Rush, 2–4 players.** The original simplified 60-card rules: three distinct-color sets of two, banks, rent, protected complete sets, steals, blocks, mandatory responses, selected payments, and discarding to seven. Hands remain private. No wildcards, buildings, trading, or action chains.

Both card games include optional tap-through tutorials with clearly labeled practice examples. Practice does not read live hands or change a table. Word Relay and Draw Together are explicitly non-playable Coming soon previews, not additional implemented games.

Home game tiles prepare a table with that game selected; the creation form names the selection prominently. All games use this same entry flow, without a separate daily shortcut button. Hosts have a persistent lobby Play action. Guests see a waiting message instead of controls they cannot use.

**Optional Keiki rules helper.** During a game, tap the chat bubble just left of the question mark. Hosts can also open it from the selected game's lobby rules. Only the chosen game name and the question you explicitly submit are sent to the grounded Keiki agent. It has no game-state tools, contacts, messaging channels, or payment capabilities. Keiki stores questions and answers; don't include private cards or personal information. AI explanations can be wrong, and Convex still enforces the game rules. There is no live move advisor or auto-play. See [Keiki setup and privacy](docs/keiki.md).

The host can rematch or choose another game while retaining the table and players. New seats are locked during play; existing seats can reconnect. A room code locates a table but cannot impersonate a seat.

## Verify

```sh
npm run typecheck
npm test
E2E_BASE_URL=https://formal-cat-696.convex.site npx playwright test
node scripts/verify-live.mjs
```

The live verification script creates three new guest identities, finishes every mode from a normal shuffled deal, checks private projections and retry behavior, and leaves its table in the lobby. It writes evidence without guest secrets. It is a test bot, not a claim about human play speed or game strategy.

See [verification evidence](docs/VERIFICATION.md) and the [short demo](docs/DEMO.md).

## Deployment and provenance

Convex environment: **development**, team `akshay-p-b898b`, project `tabletop`, deployment `formal-cat-696` (`dev/akshay-p`). A deployment key belongs only in the deployment environment, never in `EXPO_PUBLIC_*`, client code, invitations, or committed files.

Application code in this repository was written from scratch on November 15, 2026, after work began at approximately 2:22 p.m. Pacific. Only the fresh Expo application was published here; no code or commit history from the older private Tabletop implementation is included. Types, rules, and all-platform Expo exports were checked locally. An optional [CI recipe](docs/ci-workflow.yml) is included; copying it to `.github/workflows/ci.yml` requires a GitHub credential with workflow permission, which the publication token did not have.

Capy coordinated implementation, review, and verification. Revyl built and ran the actual iOS app. Convex supplies the authoritative realtime backend and persistent HTTPS guest hosting. Keiki powers the optional, explicitly requested rules explanations through a server-only API integration. No contacts or messaging channels are connected, and payments are not included.

[The published event rules](https://events.ycombinator.com/ConsumerMobileHack) require fresh code after 10 a.m., Capy/Revyl/Convex, and a device demo, with submissions due at **6 p.m. Pacific on November 15**. This repository prepares the submission; it does not submit the event form.
