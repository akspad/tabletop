import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking as NativeLinking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import QRCode from "react-native-qrcode-svg";
import { api, type GameType, type Table } from "./api";
import { saveSession, type Session } from "./session";
import { Avatar, Button, Card, Input, Label, colors, s, serif } from "./ui";
import CrosswordView from "./games/CrosswordView";
import HanabiView from "./games/HanabiView";
import HanabiCelebration from "./games/HanabiCelebration";
import PropertyView from "./games/PropertyView";
import GameTutorial from "./GameTutorial";

const games: {
  id: GameType;
  title: string;
  tag: string;
  description: string;
  symbol: string;
  color: string;
  min: number;
  max: number;
}[] = [
  {
    id: "crossword",
    title: "The Daily Mini",
    tag: "COOPERATIVE · 1–5 PLAYERS",
    description:
      "Five by five. A few good clues. A little help from your friends.",
    symbol: "Aa",
    color: "#dce7ba",
    min: 1,
    max: 5,
  },
  {
    id: "hanabi",
    title: "Hanabi",
    tag: "COOPERATIVE · 2–5 PLAYERS",
    description:
      "You see their cards. They see yours. Make something brilliant, together.",
    symbol: "✳",
    color: "#f2c5aa",
    min: 2,
    max: 5,
  },
  {
    id: "property",
    title: "Property Rush",
    tag: "COMPETITIVE · 2–4 PLAYERS",
    description:
      "Collect colorful properties. Make a deal. Build a neighborhood of your own.",
    symbol: "⌂",
    color: "#d5e2e9",
    min: 2,
    max: 4,
  },
];
const rules: Record<GameType, { intro: string; steps: string[] }> = {
  crossword: {
    intro:
      "A pocket-sized crossword for the whole table. There is one shared grid and no hidden answers.",
    steps: [
      "Tap a square or a clue. Tap the same square again to switch between across and down.",
      "Type a letter to fill a square. Everyone sees edits live; a colored dot shows another player’s cursor.",
      "Use Erase to clear a square. The puzzle is complete only when every answer is correct.",
    ],
  },
  hanabi: {
    intro: "Build five fireworks together without seeing your own cards.",
    steps: [
      "Play cards in each color from 1 through 5. You can see everyone’s hand except your own.",
      "On your turn, play a card, discard a card to recover a clue, or spend a clue to tell someone all their cards matching one color or number.",
      "A mistaken play costs a fuse. Keep an eye on the remaining clues, deck, and fuses; the whole table shares the final score.",
    ],
  },
  property: {
    intro:
      "A quick property card game. Complete three sets before your rivals; two properties of one color make a set.",
    steps: [
      "Draw two cards to begin your turn. Use up to three plays to place properties, bank cards as money, charge rent, or steal an incomplete property.",
      "A Block card cancels rent or a steal. Pay rent from your bank only; overpayment gets no change, and complete property sets are protected.",
      "Finish your turn with at most seven cards in hand. The first player with three complete sets wins. You can end a turn early.",
    ],
  },
};
function cleanError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
  return message
    .replace(/\[CONVEX[^\]]*\]\s*/g, "")
    .replace(/\[Request ID:[^\]]*\]\s*/g, "")
    .replace(/Server Error\s*/g, "")
    .split("\n")[0]
    .slice(0, 240);
}
function codeFromUrl(url: string | null) {
  if (!url) return "";
  try {
    const parsed = Linking.parse(url);
    return String(parsed.queryParams?.code ?? "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 6);
  } catch {
    return "";
  }
}
export default function Shell({
  session,
  onSession,
}: {
  session: Session;
  onSession: (session: Session) => void;
}) {
  const [name, setName] = useState(session.name);
  const [joinCode, setJoinCode] = useState("");
  const [homeMode, setHomeMode] = useState<"welcome" | "create" | "join">(
    "welcome",
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const [selected, setSelected] = useState<GameType>("crossword");
  const [puzzleChoice, setPuzzleChoice] = useState("");
  const [rule, setRule] = useState<GameType | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [tutorial, setTutorial] = useState<"hanabi" | "property" | null>(null);
  const pendingTutorial = useRef<"hanabi" | "property" | null>(null);
  useEffect(() => setConfirmEnd(false), [rule]);
  const [copied, setCopied] = useState(false);
  const [refreshDay, setRefreshDay] = useState(() =>
    new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const [copiedResult, setCopiedResult] = useState("");
  const [localHome, setLocalHome] = useState(false);
  const create = useMutation(api.create),
    join = useMutation(api.join),
    start = useMutation(api.start),
    act = useMutation(api.act),
    lobby = useMutation(api.lobby);
  const code = session.seat?.code;
  const table = useQuery(
    api.get,
    code && !localHome ? { secret: session.secret, code } : "skip",
  ) as Table | null | undefined;
  const daily = useQuery(api.daily, { secret: session.secret, refreshDay }) as
    | {
        date: string;
        puzzleId: string;
        completed: boolean;
        puzzles: { id: string; title: string }[];
      }
    | undefined;
  const connection = useConvexConnectionState();
  const busy = pending > 0;
  const isHost = table?.hostId === table?.playerId;
  const activeGame = games.find((game) => game.id === table?.gameType);
  const selectedGame = games.find((game) => game.id === selected)!;
  const actionBusy = useRef(false);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setRefreshDay(
          new Date().toLocaleDateString("en-US", {
            timeZone: "America/Los_Angeles",
          }),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const gameTop = useRef(0);
  const propertyFlow =
    table?.gameType === "property"
      ? `${table.game?.phase}:${table.game?.pending?.target ?? ""}:${table.game?.turnPlayerId ?? ""}`
      : "";
  useEffect(() => {
    Keyboard.dismiss();
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [table?.phase, table?.gameId, table?.code, localHome, propertyFlow]);
  useEffect(() => {
    function receive(url: string | null) {
      const incoming = codeFromUrl(url);
      if (incoming && incoming !== code) {
        setJoinCode(incoming);
        setHomeMode("join");
        setLocalHome(true);
      }
    }
    Linking.getInitialURL().then(receive);
    const subscription = NativeLinking.addEventListener("url", (event) =>
      receive(event.url),
    );
    return () => subscription.remove();
  }, [code]);
  async function persist(next: Session) {
    await saveSession(next);
    onSession(next);
  }
  async function task(work: () => Promise<void>, lock = true) {
    if (lock && actionBusy.current) return;
    if (lock) actionBusy.current = true;
    setError("");
    setPending((value) => value + 1);
    try {
      await work();
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setPending((value) => value - 1);
      if (lock) actionBusy.current = false;
    }
  }
  async function enter(kind: "create" | "join") {
    if (!name.trim()) {
      setError("What should we call you at the table?");
      return;
    }
    await task(async () => {
      const args = { secret: session.secret, name: name.trim() };
      const seat = await (kind === "create"
        ? create(args)
        : join({ ...args, code: joinCode.trim().toUpperCase() }));
      await persist({ ...session, name: name.trim(), seat });
      setLocalHome(false);
    });
  }
  async function gameAction(action: any) {
    if (!table) return;
    const focus = action.type === "focus";
    if (focus) {
      try {
        await act({
          secret: session.secret,
          code: table.code,
          gameId: table.gameId,
          action,
          actionId: Crypto.randomUUID(),
          expectedVersion: table.version,
        });
      } catch (e) {
        setError(cleanError(e));
      }
      return;
    }
    await task(async () => {
      await act({
        secret: session.secret,
        code: table.code,
        gameId: table.gameId,
        action,
        actionId: Crypto.randomUUID(),
        expectedVersion: table.version,
      });
    }, table.gameType !== "crossword");
  }
  async function startGame(rematch = false) {
    if (!table) return;
    const gameType = rematch ? table.gameType : selected;
    if (!gameType) return;
    const puzzleId = rematch
      ? table.game?.puzzleId
      : puzzleChoice || daily?.puzzleId;
    await task(async () => {
      await start({
        secret: session.secret,
        code: table.code,
        gameType,
        actionId: Crypto.randomUUID(),
        expectedVersion: table.version,
        ...(gameType === "crossword" && puzzleId ? { puzzleId } : {}),
      });
    });
  }
  function inviteLink() {
    const base =
      process.env.EXPO_PUBLIC_APP_URL ||
      (Platform.OS === "web" ? globalThis.location?.origin : undefined);
    return base
      ? `${base.replace(/\/$/, "")}/?code=${table?.code ?? ""}`
      : Linking.createURL("/", { queryParams: { code: table?.code ?? "" } });
  }
  async function copyInvite() {
    await task(async () => {
      await Clipboard.setStringAsync(inviteLink());
      setCopied(true);
    });
  }
  async function shareInvite() {
    await task(async () => {
      const link = inviteLink();
      await Share.share({
        message: `Join my Tabletop room ${table?.code}: ${link}`,
        url: link,
      });
    });
  }
  function learn(gameType: "hanabi" | "property") {
    if (rule && Platform.OS === "ios") {
      pendingTutorial.current = gameType;
      setRule(null);
      return;
    }
    setRule(null);
    setTutorial(gameType);
  }
  const home = localHome || !code;
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tabletop home"
          onPress={() => {
            setLocalHome(true);
            setHomeMode("welcome");
            setError("");
          }}
        >
          <Text style={styles.brand}>
            tabletop<Text style={{ color: "#b87d51" }}>.</Text>
          </Text>
        </Pressable>
        <View style={s.row}>
          {!connection.isWebSocketConnected && (
            <Text style={styles.offline}>Reconnecting</Text>
          )}
          <View style={styles.liveDot} />
          <Text style={styles.headerCaption}>
            {!home && table ? `ROOM ${table.code}` : "MADE FOR COMPANY"}
          </Text>
        </View>
      </View>
      <ScrollView
        ref={scroll}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View accessibilityRole="alert" style={styles.error}>
            <Text
              style={{
                color: colors.red,
                fontSize: 14,
                lineHeight: 21,
                flex: 1,
              }}
            >
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
              onPress={() => setError("")}
              hitSlop={12}
            >
              <Text style={{ color: colors.red, fontSize: 20 }}>×</Text>
            </Pressable>
          </View>
        ) : null}
        {home ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroLabel}>
                <View
                  style={[styles.liveDot, { backgroundColor: colors.lime }]}
                />
                <Text style={styles.heroEyebrow}>
                  A LITTLE LESS SCROLL. A LITTLE MORE PLAY.
                </Text>
              </View>
              <Text style={styles.heroTitle}>
                Your people.
                {"\n"}
                Your table.
              </Text>
              <Text style={styles.heroBody}>Gather around something good.</Text>
              <View style={styles.heroArt}>
                <View
                  style={[
                    styles.miniTile,
                    {
                      transform: [{ rotate: "-13deg" }],
                      backgroundColor: colors.lime,
                    },
                  ]}
                >
                  <Text style={styles.artLetter}>t</Text>
                </View>
                <View
                  style={[
                    styles.miniTile,
                    {
                      transform: [{ rotate: "11deg" }],
                      marginLeft: -15,
                      marginTop: 28,
                      backgroundColor: colors.peach,
                    },
                  ]}
                >
                  <Text style={styles.artLetter}>t</Text>
                </View>
                <View style={styles.spark}>
                  <Text style={{ fontSize: 25, color: colors.lime }}>✳</Text>
                </View>
              </View>
            </View>
            {!!session.seat && (
              <Card style={{ gap: 14 }}>
                <Text
                  style={{ fontSize: 18, fontWeight: "700", color: colors.ink }}
                >
                  Your seat is saved.
                </Text>
                <Text style={s.body}>
                  Return to room {session.seat.code}, just where you left it.
                </Text>
                <Button
                  secondary
                  title={`Return to ${session.seat.code} →`}
                  onPress={() => {
                    setLocalHome(false);
                    setError("");
                  }}
                />
              </Card>
            )}
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Pull up a chair</Text>
              <Text style={styles.smallCaption}>NO ACCOUNT NEEDED</Text>
            </View>
            {homeMode === "welcome" ? (
              <View style={styles.entryCards}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setHomeMode("create");
                    setError("");
                  }}
                  style={[styles.entryCard, { backgroundColor: "#e7edda" }]}
                >
                  <Text style={styles.entryIcon}>＋</Text>
                  <Text style={styles.entryTitle}>Start a table</Text>
                  <Text style={styles.entryBody}>
                    Host a game. Invite your people.
                  </Text>
                  <Text style={styles.entryArrow}>Make room ↗</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setHomeMode("join");
                    setError("");
                  }}
                  style={styles.entryCard}
                >
                  <Text style={styles.entryIcon}>↗</Text>
                  <Text style={styles.entryTitle}>Join your friends</Text>
                  <Text style={styles.entryBody}>
                    Have a code? There’s a seat for you.
                  </Text>
                  <Text style={styles.entryArrow}>Take a seat ↗</Text>
                </Pressable>
              </View>
            ) : (
              <Card style={{ gap: 15 }}>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <Text style={[styles.sectionTitle, { fontSize: 25 }]}>
                    {homeMode === "create"
                      ? "A table of your own."
                      : "You’re in good company."}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                    onPress={() => {
                      setHomeMode("welcome");
                      setError("");
                    }}
                    hitSlop={10}
                  >
                    <Text style={{ fontSize: 23, color: colors.muted }}>×</Text>
                  </Pressable>
                </View>
                <Text style={s.body}>
                  {homeMode === "create"
                    ? "Choose your name. We’ll save you a seat."
                    : "Enter your name and the room’s six-character code."}
                </Text>
                <Input
                  accessibilityLabel="Your name"
                  placeholder="Your name"
                  value={name}
                  onChangeText={setName}
                  maxLength={24}
                  autoComplete="nickname"
                  autoCapitalize="words"
                />
                {homeMode === "join" && (
                  <Input
                    accessibilityLabel="Room code"
                    placeholder="ROOM CODE"
                    value={joinCode}
                    onChangeText={(text) =>
                      setJoinCode(text.replace(/[^a-z0-9]/gi, "").toUpperCase())
                    }
                    maxLength={6}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={{ letterSpacing: 5, fontWeight: "700" }}
                  />
                )}
                <Button
                  loading={busy}
                  disabled={homeMode === "join" && joinCode.length !== 6}
                  title={
                    homeMode === "create"
                      ? "Create my table →"
                      : "Join the table →"
                  }
                  onPress={() =>
                    void enter(homeMode === "join" ? "join" : "create")
                  }
                />
                <Text style={styles.privacy}>
                  Just a name. No login, no fuss. Your private seat stays on
                  this device.
                </Text>
              </Card>
            )}
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>On the table</Text>
              <Text style={styles.smallCaption}>THREE WAYS TO CONNECT</Text>
            </View>
            {games.map((game) => (
              <View key={game.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Read ${game.title} rules`}
                  onPress={() => setRule(game.id)}
                  style={styles.gameRow}
                >
                  <View
                    style={[styles.gameSymbol, { backgroundColor: game.color }]}
                  >
                    <Text style={styles.symbolText}>{game.symbol}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.gameTag}>{game.tag}</Text>
                    <Text style={styles.gameTitle}>{game.title}</Text>
                    <Text style={styles.gameDescription}>
                      {game.description}
                    </Text>
                    {game.id === "crossword" && daily && (
                      <Text style={styles.daily}>
                        {daily.completed
                          ? "✓ You’ve completed today’s mini"
                          : `TODAY’S PUZZLE · ${daily.date} · PACIFIC TIME`}
                      </Text>
                    )}
                  </View>
                  <Text style={{ color: colors.green, fontSize: 20 }}>↗</Text>
                </Pressable>
                {game.id === "crossword" && daily && (
                  <View style={{ paddingTop: 14 }}>
                    <Text style={[styles.daily, { marginBottom: 12 }]}>
                      {daily.completed
                        ? `${daily.date} · PACIFIC TIME`
                        : "A fresh mini, every day in Los Angeles."}
                    </Text>
                    <Button
                      secondary
                      title="Start today’s mini"
                      onPress={() => {
                        setSelected("crossword");
                        setPuzzleChoice(daily.puzzleId);
                        setHomeMode("create");
                        setError("");
                        scroll.current?.scrollTo({ y: 330, animated: true });
                      }}
                    />
                  </View>
                )}
              </View>
            ))}
            <Text style={styles.footer}>
              Less screen time. More together time.
            </Text>
          </>
        ) : !table ? (
          <View style={{ paddingVertical: 70, alignItems: "center", gap: 20 }}>
            {table === undefined ? (
              <>
                <ActivityIndicator color={colors.green} />
                <Text style={s.body}>Finding your table…</Text>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>This table has closed.</Text>
                <Text style={s.body}>
                  Start a new one, or join your friends with another code.
                </Text>
              </>
            )}
            <Button
              secondary
              title="Back to home"
              onPress={() => setLocalHome(true)}
            />
          </View>
        ) : (
          <>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <View>
                <Label>
                  {table.phase === "lobby"
                    ? "THE GATHERING PLACE"
                    : table.phase === "finished"
                      ? "THAT WAS A GOOD ONE"
                      : (activeGame?.tag ?? "YOUR TABLE")}
                </Label>
                <Text style={[s.title, { fontSize: 34 }]}>
                  {table.phase === "lobby"
                    ? "Everyone’s welcome."
                    : table.phase === "finished"
                      ? "A moment to celebrate."
                      : activeGame?.title}
                </Text>
              </View>
              {table.gameType && table.phase !== "lobby" && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Game rules"
                  onPress={() => setRule(table.gameType!)}
                  style={styles.rulesButton}
                >
                  <Text style={{ color: colors.green, fontWeight: "700" }}>
                    ?
                  </Text>
                </Pressable>
              )}
            </View>
            <View style={styles.players}>
              {table.players.map((player) => (
                <View key={player.id} style={styles.playerPill}>
                  <Avatar name={player.name} color={player.color} size={27} />
                  <Text style={styles.playerName}>
                    {player.name}
                    {player.id === session.seat?.playerId ? " (you)" : ""}
                  </Text>
                  {player.id === table.hostId && (
                    <Text style={{ fontSize: 10, color: colors.muted }}>
                      HOST
                    </Text>
                  )}
                </View>
              ))}
            </View>
            {table.phase === "lobby" ? (
              <>
                <Card style={{ gap: 18 }}>
                  <View style={[s.row, { justifyContent: "space-between" }]}>
                    <View>
                      <Label>YOUR ROOM CODE</Label>
                      <Text selectable style={styles.roomCode}>
                        {table.code}
                      </Text>
                    </View>
                    <View style={styles.qr}>
                      <QRCode
                        value={inviteLink()}
                        size={78}
                        color={colors.green}
                        backgroundColor={colors.white}
                      />
                    </View>
                  </View>
                  <Text style={s.body}>
                    Scan to pull up a chair, or send the invite link. Keep this
                    room open while friends join.
                  </Text>
                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Button
                        secondary
                        title={copied ? "Copied ✓" : "Copy invite"}
                        onPress={() => void copyInvite()}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Share link ↗"
                        onPress={() => void shareInvite()}
                      />
                    </View>
                  </View>
                </Card>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>What are we playing?</Text>
                </View>
                {games.map((game) => (
                  <Pressable
                    key={game.id}
                    accessibilityRole="radio"
                    accessibilityState={{
                      selected: selected === game.id,
                      disabled: !isHost,
                    }}
                    disabled={!isHost}
                    onPress={() => setSelected(game.id)}
                    style={[
                      styles.selectGame,
                      selected === game.id && styles.selectGameActive,
                    ]}
                  >
                    <View
                      style={[
                        styles.gameSymbol,
                        { backgroundColor: game.color, width: 56, height: 62 },
                      ]}
                    >
                      <Text style={[styles.symbolText, { fontSize: 30 }]}>
                        {game.symbol}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={styles.gameTitle}>{game.title}</Text>
                      <Text style={styles.gameTag}>{game.tag}</Text>
                    </View>
                    <View
                      style={[
                        styles.radio,
                        selected === game.id && {
                          backgroundColor: colors.green,
                          borderColor: colors.green,
                        },
                      ]}
                    >
                      {selected === game.id && (
                        <Text style={{ color: colors.white, fontSize: 12 }}>
                          ✓
                        </Text>
                      )}
                    </View>
                  </Pressable>
                ))}
                {isHost && selected !== "crossword" && (
                  <Button
                    secondary
                    title={`Learn ${selectedGame.title}`}
                    onPress={() => learn(selected)}
                  />
                )}
                {!isHost && (
                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Button
                        secondary
                        title="Learn Hanabi"
                        onPress={() => learn("hanabi")}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        secondary
                        title="Learn Property Rush"
                        onPress={() => learn("property")}
                      />
                    </View>
                  </View>
                )}
                {isHost ? (
                  <View style={{ gap: 13 }}>
                    {selected === "crossword" && daily && (
                      <Card style={{ gap: 12 }}>
                        <Label>CHOOSE YOUR MINI</Label>
                        {daily.puzzles.map((puzzle) => (
                          <Pressable
                            key={puzzle.id}
                            accessibilityRole="radio"
                            accessibilityState={{
                              selected:
                                (puzzleChoice || daily.puzzleId) === puzzle.id,
                            }}
                            onPress={() => setPuzzleChoice(puzzle.id)}
                            style={{
                              flexDirection: "row",
                              gap: 12,
                              alignItems: "center",
                              minHeight: 44,
                            }}
                          >
                            <View
                              style={[
                                styles.radio,
                                (puzzleChoice || daily.puzzleId) ===
                                  puzzle.id && {
                                  backgroundColor: colors.green,
                                  borderColor: colors.green,
                                },
                              ]}
                            >
                              {(puzzleChoice || daily.puzzleId) ===
                                puzzle.id && (
                                <Text style={{ color: colors.white }}>✓</Text>
                              )}
                            </View>
                            <Text
                              style={{
                                color: colors.ink,
                                fontSize: 14,
                                flex: 1,
                              }}
                            >
                              {puzzle.title}
                              {puzzle.id === daily.puzzleId ? " · Today" : ""}
                            </Text>
                          </Pressable>
                        ))}
                      </Card>
                    )}
                    <Button
                      loading={busy}
                      disabled={
                        table.players.length < selectedGame.min ||
                        table.players.length > selectedGame.max
                      }
                      title={`Play ${selectedGame.title} →`}
                      onPress={() => void startGame()}
                    />
                    <Text
                      style={[s.body, { fontSize: 13, textAlign: "center" }]}
                    >
                      {table.players.length < selectedGame.min
                        ? `Invite ${selectedGame.min - table.players.length} more player${selectedGame.min - table.players.length > 1 ? "s" : ""} to play.`
                        : table.players.length > selectedGame.max
                          ? `${selectedGame.title} supports up to ${selectedGame.max} players. Choose another game.`
                          : "Everyone here? Start when you’re ready."}
                    </Text>
                  </View>
                ) : (
                  <Card>
                    <Text style={[s.body, { textAlign: "center" }]}>
                      You’re all set. Your host will choose the game and get
                      things started.
                    </Text>
                  </Card>
                )}
              </>
            ) : table.phase === "finished" ? (
              <Card
                style={{ gap: 22, alignItems: "center", paddingVertical: 35 }}
              >
                <View style={styles.resultBadge}>
                  <Text style={{ fontSize: 45, color: colors.green }}>✳</Text>
                </View>
                <Label>BETTER TOGETHER</Label>
                <Text
                  style={[
                    styles.sectionTitle,
                    { textAlign: "center", fontSize: 30 },
                  ]}
                >
                  {table.result?.summary ?? "Game complete"}
                </Text>
                {table.result?.score !== undefined && (
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.score}>{table.result.score}</Text>
                    <Text style={s.label}>FINAL SCORE</Text>
                  </View>
                )}
                {table.result?.winnerId && (
                  <Text style={s.body}>
                    Winner:{" "}
                    {table.players.find(
                      (player) => player.id === table.result?.winnerId,
                    )?.name ?? "Your table"}
                  </Text>
                )}
                {isHost ? (
                  <View style={{ width: "100%", gap: 12 }}>
                    <Button
                      loading={busy}
                      title="Play again"
                      onPress={() => void startGame(true)}
                    />
                    <Button
                      loading={busy}
                      secondary
                      title="Choose another game"
                      onPress={() =>
                        void task(async () => {
                          await lobby({
                            secret: session.secret,
                            code: table.code,
                            actionId: Crypto.randomUUID(),
                            expectedVersion: table.version,
                          });
                        })
                      }
                    />
                  </View>
                ) : (
                  <Text style={[s.body, { textAlign: "center" }]}>
                    Your host can take the table back to the lobby for another
                    game.
                  </Text>
                )}
                <Button
                  secondary
                  title={
                    copiedResult === table.gameId
                      ? "Result copied ✓"
                      : "Copy result"
                  }
                  onPress={() =>
                    void task(async () => {
                      if (!table.result) return;
                      const copied = await Clipboard.setStringAsync(
                        table.result.summary,
                      );
                      if (!copied)
                        throw new Error(
                          "Copying isn’t available on this device. Please select the result text to copy it.",
                        );
                      setCopiedResult(table.gameId);
                    })
                  }
                />
                <Button
                  secondary
                  title="Read the rules"
                  onPress={() => setRule(table.gameType ?? "crossword")}
                />
              </Card>
            ) : (
              <View
                onLayout={(event) => {
                  gameTop.current = event.nativeEvent.layout.y;
                }}
              >
                {table.gameType === "crossword" ? (
                  <CrosswordView
                    game={table.game}
                    playerId={table.playerId}
                    players={table.players}
                    act={gameAction}
                    busy={busy}
                    onKeyboardOpen={(clueY) => {
                      if (Platform.OS !== "web")
                        scroll.current?.scrollTo({
                          y: Math.max(0, gameTop.current + clueY - 100),
                          animated: true,
                        });
                    }}
                  />
                ) : table.gameType === "hanabi" ? (
                  <HanabiView
                    game={table.game}
                    playerId={table.playerId}
                    players={table.players}
                    act={gameAction}
                    busy={busy}
                  />
                ) : (
                  <PropertyView
                    game={table.game}
                    playerId={table.playerId}
                    players={table.players}
                    act={gameAction}
                    busy={busy}
                  />
                )}
              </View>
            )}
            <View style={styles.tableFooter}>
              <Text style={styles.privacy}>
                A live table. A private seat. Good company.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLocalHome(true)}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.green,
                    textDecorationLine: "underline",
                  }}
                >
                  Home
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
      {!home &&
        connection.isWebSocketConnected &&
        table?.gameType === "hanabi" &&
        table.game && (
          <HanabiCelebration
            key={table.gameId}
            game={table.game}
            players={table.players}
          />
        )}
      <Modal
        visible={!!rule}
        transparent
        animationType="slide"
        onRequestClose={() => setRule(null)}
        onDismiss={() => {
          if (pendingTutorial.current) {
            setTutorial(pendingTutorial.current);
            pendingTutorial.current = null;
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Close rules"
            onPress={() => setRule(null)}
          />
          <SafeAreaView style={styles.modalSheet} edges={["bottom"]}>
            <ScrollView contentContainerStyle={{ padding: 26, gap: 20 }}>
              <View style={styles.sheetHandle} />
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <Label>A QUICK HOW-TO</Label>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close rules"
                  onPress={() => setRule(null)}
                  hitSlop={15}
                >
                  <Text style={{ fontSize: 26, color: colors.muted }}>×</Text>
                </Pressable>
              </View>
              <Text style={s.title}>
                {games.find((game) => game.id === rule)?.title}
              </Text>
              <Text style={s.body}>{rule && rules[rule].intro}</Text>
              {rule &&
                rules[rule].steps.map((step, index) => (
                  <View
                    key={step}
                    style={[s.row, { alignItems: "flex-start" }]}
                  >
                    <View style={styles.stepNumber}>
                      <Text style={{ fontWeight: "700", color: colors.green }}>
                        {index + 1}
                      </Text>
                    </View>
                    <Text style={[s.body, { flex: 1, color: colors.ink }]}>
                      {step}
                    </Text>
                  </View>
                ))}
              {(rule === "hanabi" || rule === "property") && (
                <Button
                  secondary
                  title="Learn to play"
                  onPress={() => {
                    if (rule === "hanabi" || rule === "property") learn(rule);
                  }}
                />
              )}
              <Button
                title="Got it. Let’s play."
                onPress={() => setRule(null)}
              />
              {!home &&
                isHost &&
                table?.phase === "playing" &&
                rule === table.gameType &&
                (confirmEnd ? (
                  <Card style={{ gap: 14, backgroundColor: "#faeee5" }}>
                    <Text
                      style={{
                        fontSize: 17,
                        fontWeight: "700",
                        color: colors.ink,
                      }}
                    >
                      End this game for everyone?
                    </Text>
                    <Text style={s.body}>
                      No result will be saved. Everyone keeps their seat and the
                      same room code.
                    </Text>
                    <Button
                      secondary
                      title="Keep playing"
                      onPress={() => setConfirmEnd(false)}
                    />
                    <Button
                      loading={busy}
                      title="End game for everyone"
                      onPress={() =>
                        void task(async () => {
                          await lobby({
                            secret: session.secret,
                            code: table.code,
                            actionId: Crypto.randomUUID(),
                            expectedVersion: table.version,
                          });
                          setRule(null);
                        })
                      }
                    />
                  </Card>
                ) : (
                  <Button
                    secondary
                    title="End game and choose another"
                    onPress={() => setConfirmEnd(true)}
                  />
                ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
      <GameTutorial
        gameType={tutorial}
        visible={tutorial !== null}
        onClose={() => setTutorial(null)}
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingVertical: 19,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  brand: {
    fontFamily: serif,
    fontSize: 29,
    fontWeight: "700",
    color: colors.green,
  },
  headerCaption: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.green,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  offline: { fontSize: 10, color: colors.red },
  scroll: {
    padding: 22,
    gap: 22,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    paddingBottom: 45,
  },
  error: {
    backgroundColor: "#fae9df",
    borderWidth: 1,
    borderColor: "#edc8b7",
    borderRadius: 15,
    padding: 15,
    flexDirection: "row",
    gap: 15,
  },
  hero: {
    backgroundColor: colors.green,
    padding: 25,
    borderRadius: 27,
    minHeight: 300,
    overflow: "hidden",
  },
  heroLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroEyebrow: {
    fontSize: 8,
    color: "#dee8d1",
    fontWeight: "700",
    letterSpacing: 1,
  },
  heroTitle: {
    fontFamily: serif,
    fontSize: 43,
    lineHeight: 48,
    color: colors.white,
    marginTop: 28,
    maxWidth: 220,
  },
  heroBody: {
    fontSize: 13,
    lineHeight: 21,
    color: "#d8e3d6",
    marginTop: 15,
    maxWidth: 170,
  },
  heroArt: {
    position: "absolute",
    right: 16,
    bottom: 31,
    flexDirection: "row",
    alignItems: "center",
  },
  miniTile: {
    width: 62,
    height: 76,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  artLetter: { fontFamily: serif, fontSize: 50, color: colors.green },
  spark: { position: "absolute", right: 12, top: -39 },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginTop: 5,
  },
  sectionTitle: { fontFamily: serif, fontSize: 27, color: colors.ink },
  smallCaption: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.1,
    color: colors.muted,
  },
  entryCards: { flexDirection: "row", gap: 12 },
  entryCard: {
    flex: 1,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    minHeight: 215,
  },
  entryIcon: { fontSize: 28, color: colors.green, marginBottom: 21 },
  entryTitle: {
    fontFamily: serif,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
  },
  entryBody: {
    fontSize: 12,
    lineHeight: 19,
    color: colors.muted,
    marginTop: 9,
  },
  entryArrow: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.green,
    marginTop: 20,
  },
  privacy: { fontSize: 11, lineHeight: 18, color: colors.muted },
  gameRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  gameSymbol: {
    width: 70,
    height: 80,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  symbolText: { fontFamily: serif, fontSize: 37, color: colors.green },
  gameTag: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
  },
  gameTitle: { fontFamily: serif, fontSize: 23, color: colors.ink },
  gameDescription: { fontSize: 12, lineHeight: 19, color: colors.muted },
  daily: { fontSize: 9, fontWeight: "700", color: colors.green, marginTop: 3 },
  footer: {
    fontFamily: serif,
    fontStyle: "italic",
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 12,
  },
  players: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  playerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#eeeee2",
    borderRadius: 25,
    padding: 5,
    paddingRight: 12,
  },
  playerName: { fontSize: 12, color: colors.ink, fontWeight: "600" },
  roomCode: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 5,
    color: colors.green,
  },
  qr: { padding: 7, backgroundColor: colors.white },
  selectGame: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 21,
    backgroundColor: colors.white,
  },
  selectGameActive: {
    borderColor: colors.green,
    borderWidth: 2,
    padding: 15,
    backgroundColor: "#f0f3e6",
  },
  radio: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  rulesButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center",
    alignItems: "center",
  },
  resultBadge: {
    backgroundColor: colors.lime,
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  score: { fontFamily: serif, fontSize: 72, color: colors.green },
  tableFooter: {
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 15,
    alignItems: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(20,40,28,.35)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  modalSheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: "88%",
    width: "100%",
    maxWidth: 620,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors.line,
    alignSelf: "center",
    marginBottom: 4,
  },
  stepNumber: {
    backgroundColor: "#e1e9ce",
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});
