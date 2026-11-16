# Optional Keiki rules explanations

Tabletop has a real Keiki cloud agent, **Tabletop Rules**, with instructions grounded in the shipped Daily Mini, base Hanabi, and simplified Property Rush engines. The reproducible deployment configuration is [keiki/agent.json](../keiki/agent.json), external reference `tabletop-rules`. The connected agent ID is `0715075f-eefa-4cca-b9e2-4c8da17d483e`.

## Use

Start or join a table. During a game, tap the chat bubble immediately left of the question mark. A host can also open the selected game's lobby rules and choose **Ask Keiki about the rules**. Select an example or type a question, then explicitly tap **Ask Keiki** or use the keyboard's Send action. Opening the helper or selecting an example sends nothing. Returning to rules keeps the same table and game. The question-mark button always opens the regular rules, not a remembered chat view.

The helper is for explanations, not decisions or live-state hints. In particular, it cannot see a player's Hanabi faces, another player's Property Rush hand, the deck, or crossword solutions. It cannot play, clue, pay, change games, send invitations, or contact anyone. There are no connected messaging channels, external tools, memory, browser, sandbox, or payment features.

## Server setup

1. Deploy `keiki/agent.json` through Keiki's deployment API or connected MCP deployment operation. It creates no messaging channels. Use the existing `external_ref` to update rather than duplicate the agent.
2. Enable this agent's API gateway without passthrough. This requires an active Keiki plan; API turns consume that plan's usage. Do not buy a phone line for this integration.
3. Create a developer key bound to this agent, and set `KEIKI_API_KEY` only in the Convex deployment environment. `npx convex env set KEIKI_API_KEY` accepts secure stdin without placing the value in command arguments. Never use an `EXPO_PUBLIC_` key or commit a credential. The initial supplied key works but is organization-wide rather than agent-bound; replacing it with an agent-bound key narrows its privileges.
4. If deploying a different agent ID or Keiki host, update `convex/keiki.ts` to the observed API gateway values. The current endpoint is `https://onkeiki.com/api/v1/openai/chat/completions`.

The Expo publisher removes the Keiki, Convex deployment, and GitHub credentials from the export subprocess environment. No client calls Keiki directly.

## Privacy, limits, and failures

The Convex action accepts a game name and a question of at most 300 characters. It authenticates a real table member using the existing device seat before calling Keiki. Device credentials, names, room codes, hands, game state, and actions are not automatically attached to the provider request. Never paste private information into a question: its typed text is what is sent.

Keiki processes and stores questions and answers in its own conversations and traces. Tabletop stores only guest/global request-budget counters, not question text. Each API call starts a fresh provider conversation; the app does not upload a chat history. Explanations are not shared with other players.

Server-side limits are 20 attempts per guest per UTC day, 200 total per deployment per UTC day, and five seconds between a guest's attempts. The app disables submission during the short cooldown and shows an Ask again countdown. A server-enforced cooldown returns a structured expected error with the remaining delay; it is shown as a friendly waiting state, never Uncaught Error. Failed provider attempts count toward those limits. Provider requests time out after 20 seconds. Missing configuration, timeouts, invalid responses, and upstream errors show a safe error; they never become a fabricated AI answer. Static rules and local practice tutorials do not depend on Keiki.

## Verification

Fifteen new unit/Convex tests cover membership, input and credential rejection, outbound payload privacy, unchanged gameplay, cooldown, per-guest/global budgets and day reset, and safe upstream failures. Live Keiki checks answered Property Rush rent/no-change and Hanabi final-turn/full-token questions, and refused to inspect hidden hands or contact friends. The public backend successfully called the real API gateway and left its table unchanged. Browser E2E separately verifies explicit submission and the displayed real response.
