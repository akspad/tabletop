# Optional Keiki rules and Property Rush advice

Tabletop has a real Keiki cloud agent, **Tabletop Rules**, with instructions grounded in the shipped Daily Mini, base Hanabi, and simplified Property Rush engines. The reproducible deployment configuration is [keiki/agent.json](../keiki/agent.json), external reference `tabletop-rules`. The connected agent ID is `0715075f-eefa-4cca-b9e2-4c8da17d483e`.

## Use

Start or join a table. During a game, tap the chat bubble immediately left of the question mark. A host can also open the selected game's lobby rules and choose **Ask Keiki about the rules**. Select an example or type a question, then explicitly tap **Ask Keiki** or use the keyboard's Send action. Opening the helper or selecting an example sends nothing. Returning to rules keeps the same table and game. The question-mark button always opens the regular rules, not a remembered chat view.

In a running Property Rush game, the same panel also offers **Suggest a move**. Read the visible disclosure before tapping it: this request shares your own hand faces and the public board with Keiki. Merely opening the panel sends nothing. The returned title, short reason, and local target name are suggestions, not executed moves. Choose **Use this move** to review the confirmation, **Keep thinking** to cancel, or **Confirm move** to submit through the normal authoritative gameplay mutation. Advice is available only when you have a legal move or response. Hanabi, Daily Mini, and lobbies remain rules-only.

The agent has no gameplay mutation tools and never plays automatically. It cannot see another player's Property Rush hand, anyone's hidden Hanabi faces, deck contents/order, or crossword solutions. There are no connected messaging channels, external tools, memory, browser, sandbox, or payment features.

## Legal choices and stale advice

The server authenticates membership and checks the exact game/version before building at most 96 offered actions. Every offered action passes the existing Property Rush engine, including protected sets, response targets, bank-only payment, and exact end-turn discards. Keiki receives numbered move descriptions, not action identifiers, and returns a choice and a reason under a strict JSON schema. Malformed or unoffered choices are rejected.

The server rechecks the same game/version after Keiki responds. The client also discards delayed responses and removes pending advice/confirmation when its live table changes. Confirm uses the recommendation's original game/version and the existing engine, not a newer captured table version. A double-click guard prevents duplicate confirmation requests; the backend still enforces stale versions and action retry IDs. Legal advice is not necessarily strategically good advice.

## Server setup

1. Deploy `keiki/agent.json` through Keiki's deployment API or connected MCP deployment operation. It creates no messaging channels. Use the existing `external_ref` to update rather than duplicate the agent.
2. Enable this agent's API gateway without passthrough. This requires an active Keiki plan; API turns consume that plan's usage. Do not buy a phone line for this integration.
3. Create a developer key bound to this agent, and set `KEIKI_API_KEY` only in the Convex deployment environment. `npx convex env set KEIKI_API_KEY` accepts secure stdin without placing the value in command arguments. Never use an `EXPO_PUBLIC_` key or commit a credential. The initial supplied key works but is organization-wide rather than agent-bound; replacing it with an agent-bound key narrows its privileges.
4. If deploying a different agent ID or Keiki host, update `convex/keiki.ts` to the observed API gateway values. The current endpoint is `https://onkeiki.com/api/v1/openai/chat/completions`.

The Expo publisher removes the Keiki, Convex deployment, and GitHub credentials from the export subprocess environment. No client calls Keiki directly.

## Privacy, limits, and failures

Rules requests accept a game name and a question of at most 300 characters. They authenticate a real table member using the existing device seat. Device credentials, names, room codes, hands, game state, and actions are not attached to rules questions. Never paste private information into a question: its typed text is what is sent.

Only an explicit Property Rush advice request sends a whitelisted live snapshot: your hand faces, public bank faces and property counts, hand/deck/discard counts, current phase and plays left, and a pending request's public type/participants/property color. Players are aliased as You and Player N. Opponents' hand faces, deck faces/order, random state, names, card/player identifiers, room codes, game IDs, versions, and credentials are excluded from the provider payload. The action identifiers remain on the server until the selected legal action is returned to its requesting player.

Keiki processes and stores submitted questions, advice snapshots, and responses in its own conversations and traces. Tabletop stores only guest/global request-budget counters, not AI request/response text or suggestions. Each API call starts a fresh provider conversation; the app does not upload a chat history or share advice with other players. A confirmed move is recorded as ordinary gameplay.

Rules and advice share server-side limits of 20 attempts per guest per UTC day, 200 total per deployment per UTC day, and five seconds between a guest's attempts. Rules submission shows an Ask again countdown; the advisor shows a friendly wait message if the server returns a cooldown. Failed provider attempts count toward those limits. Requests rejected for membership, turn, game, or version do not call the provider or reserve usage. Provider requests time out after 20 seconds. Missing configuration, timeouts, invalid responses, and upstream errors show a safe error; they never become a fabricated AI answer or a gameplay move. Static rules and local practice tutorials do not depend on Keiki.

## Verification

Fifteen rules-helper tests cover membership, input and credential rejection, outbound payload privacy, unchanged gameplay, cooldown, per-guest/global budgets and day reset, and safe upstream failures. Twenty additional advisor tests cover legal offered actions, private-information boundaries, version-bound confirmation, off-turn/other-game rejection, stale provider responses, malformed choices, and provider/configuration failures. See [the verification record](VERIFICATION.md) for live browser and device evidence and its limits.
