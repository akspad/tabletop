import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  View,
} from "react-native";
import { colors, serif, s as ui } from "../ui";
import type { Player } from "../api";

type Direction = "across" | "down";
type Clue = {
  number: number;
  direction: Direction;
  clue: string;
  cells: number[];
};
type Game = {
  status: string;
  puzzleId: string;
  title: string;
  date: string;
  grid: string[];
  letters: string[];
  clues: Clue[];
  editors: { playerId: string; cell: number; direction: Direction }[];
  startedAt: number;
  elapsedMs?: number;
};
export default function CrosswordView({
  game,
  playerId,
  players,
  act,
  onKeyboardOpen,
}: {
  game: Game;
  playerId: string;
  players: Player[];
  act: (action: any) => Promise<void>;
  busy: boolean;
  onKeyboardOpen?: (clueY: number) => void;
}) {
  const first = game.grid.findIndex((value) => value !== "#");
  const [cell, setCell] = useState(first);
  const [direction, setDirection] = useState<Direction>("across");
  const [clock, setClock] = useState(Date.now());
  const input = useRef<TextInputInstance>(null);
  const cursor = useRef(first);
  const clueY = useRef(0);
  const optimistic = useRef(
    new Map<number, { letter: string; stamp: number }>(),
  );
  const sequence = useRef(0);
  const [, redraw] = useState(0);
  const letters = game.letters.map(
    (letter, index) => optimistic.current.get(index)?.letter ?? letter,
  );
  const clue =
    game.clues.find(
      (item) => item.direction === direction && item.cells.includes(cell),
    ) ?? game.clues.find((item) => item.cells.includes(cell));
  const clueCells = clue?.cells ?? [];
  const filled = letters.filter(
    (letter, index) => game.grid[index] !== "#" && !!letter,
  ).length;
  const total = game.grid.filter((value) => value !== "#").length;
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setCell(first);
    setDirection("across");
  }, [game.puzzleId]);
  function focus(next: number, nextDirection: Direction = direction) {
    cursor.current = next;
    setCell(next);
    setDirection(nextDirection);
    void act({ type: "focus", cell: next, direction: nextDirection });
    input.current?.focus();
  }
  function nextCell(from: number, step = 1) {
    const index = clueCells.indexOf(from);
    if (index >= 0 && clueCells[index + step] !== undefined)
      return clueCells[index + step];
    return from;
  }
  function edit(at: number, letter: string) {
    const stamp = ++sequence.current;
    optimistic.current.set(at, { letter, stamp });
    redraw((value) => value + 1);
    void act({ type: "letter", cell: at, letter }).finally(() => {
      if (optimistic.current.get(at)?.stamp === stamp)
        optimistic.current.delete(at);
      redraw((value) => value + 1);
    });
  }
  function write(text: string) {
    const letters = text.toUpperCase().replace(/[^A-Z]/g, "");
    if (!letters) return;
    let current = cursor.current;
    const edits: { type: string; cell: number; letter: string }[] = [];
    for (const letter of letters) {
      edits.push({ type: "letter", cell: current, letter });
      current = nextCell(current);
    }
    focus(current);
    for (const action of edits) edit(action.cell, action.letter);
  }
  const seconds = Math.max(
    0,
    Math.floor((game.elapsedMs ?? clock - game.startedAt) / 1000),
  );
  return (
    <View style={{ gap: 20 }}>
      <View style={[ui.row, { justifyContent: "space-between" }]}>
        <View>
          <Text style={ui.label}>DAILY MINI · 5 × 5</Text>
          <Text style={styles.title}>{game.title}</Text>
        </View>
        <Text style={styles.timer}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </Text>
      </View>
      <View style={styles.progress}>
        <View
          style={[
            styles.progressFill,
            { width: `${total ? (filled / total) * 100 : 0}%` },
          ]}
        />
      </View>
      <View style={styles.board} accessibilityLabel="Crossword grid">
        {game.grid.map((value, index) => {
          const number = game.clues.find(
            (item) => item.cells[0] === index,
          )?.number;
          const editors = (game.editors ?? []).filter(
            (editor) => editor.playerId !== playerId && editor.cell === index,
          );
          const editorColor = players.find(
            (player) => player.id === editors[0]?.playerId,
          )?.color;
          return (
            <Pressable
              key={index}
              accessibilityLabel={
                value === "#"
                  ? "Block"
                  : `Cell ${index + 1}${letters[index] ? `, ${letters[index]}` : ", empty"}${number ? `, clue ${number}` : ""}`
              }
              accessibilityRole={value === "#" ? undefined : "button"}
              disabled={value === "#"}
              onPress={() =>
                focus(
                  index,
                  index === cell
                    ? direction === "across"
                      ? "down"
                      : "across"
                    : direction,
                )
              }
              style={[
                styles.cell,
                value === "#" && styles.block,
                clueCells.includes(index) && styles.word,
                index === cell && styles.selected,
              ]}
            >
              {!!number && (
                <Text
                  style={[
                    styles.number,
                    index === cell && { color: colors.white },
                  ]}
                >
                  {number}
                </Text>
              )}
              <Text
                style={[
                  styles.letter,
                  index === cell && { color: colors.white },
                ]}
              >
                {value === "#" ? "" : letters[index]}
              </Text>
              {!!editorColor && (
                <View
                  style={[styles.editor, { backgroundColor: editorColor }]}
                />
              )}
            </Pressable>
          );
        })}
      </View>
      <View
        style={styles.currentClue}
        onLayout={(event) => {
          clueY.current = event.nativeEvent.layout.y;
        }}
      >
        <Text style={styles.clueTag}>
          {clue?.number} {clue?.direction.toUpperCase()}
        </Text>
        <Text style={styles.clueText}>
          {clue?.clue ?? "Select a square to begin."}
        </Text>
      </View>
      <TextInput
        ref={input}
        accessibilityLabel="Crossword letter input"
        style={styles.keyboardInput}
        value=""
        onFocus={() => onKeyboardOpen?.(clueY.current)}
        onChangeText={(text) => void write(text)}
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === "Backspace") {
            const current = cursor.current;
            if (
              optimistic.current.get(current)?.letter ??
              game.letters[current]
            )
              edit(current, "");
            else {
              const previous = nextCell(current, -1);
              focus(previous);
              edit(previous, "");
            }
          }
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        caretHidden
        keyboardType={Platform.OS === "ios" ? "ascii-capable" : "default"}
        placeholder="Tap here to open your keyboard"
        placeholderTextColor={colors.muted}
      />
      <View style={[ui.row, { justifyContent: "space-between" }]}>
        <Text style={ui.body}>
          {filled} of {total} squares filled
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            edit(cursor.current, "");
            input.current?.focus();
          }}
          style={styles.erase}
        >
          <Text style={{ fontWeight: "700", color: colors.green }}>
            ⌫ Erase
          </Text>
        </Pressable>
      </View>
      <View style={styles.clues}>
        {(["across", "down"] as Direction[]).map((dir) => (
          <View key={dir} style={{ flex: 1, gap: 5 }}>
            <Text style={ui.label}>{dir}</Text>
            {game.clues
              .filter((item) => item.direction === dir)
              .map((item) => (
                <Pressable
                  key={item.number}
                  accessibilityRole="button"
                  onPress={() => focus(item.cells[0], dir)}
                  style={[
                    styles.clueRow,
                    clue === item && { backgroundColor: "#e7edda" },
                  ]}
                >
                  <Text style={styles.clueNumber}>{item.number}</Text>
                  <Text style={styles.listClue}>{item.clue}</Text>
                </Pressable>
              ))}
          </View>
        ))}
      </View>
      <Text style={[ui.body, { fontSize: 12, textAlign: "center" }]}>
        One puzzle, many minds. Everyone edits the same grid.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  title: { fontFamily: serif, fontSize: 27, color: colors.ink },
  timer: {
    fontVariant: ["tabular-nums"],
    fontSize: 18,
    color: colors.green,
    fontWeight: "600",
  },
  progress: { height: 4, backgroundColor: colors.line, borderRadius: 3 },
  progressFill: { height: 4, backgroundColor: colors.green, borderRadius: 3 },
  board: {
    width: "100%",
    aspectRatio: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.ink,
    borderRadius: 10,
    overflow: "hidden",
    padding: 1,
  },
  cell: {
    width: "20%",
    height: "20%",
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  block: { backgroundColor: colors.ink },
  word: { backgroundColor: "#e6edda" },
  selected: { backgroundColor: colors.green },
  number: {
    position: "absolute",
    left: 5,
    top: 3,
    fontSize: 10,
    color: colors.ink,
    fontWeight: "600",
  },
  letter: { fontSize: 30, color: colors.ink, fontWeight: "600" },
  editor: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  currentClue: {
    backgroundColor: "#e7edda",
    borderRadius: 16,
    padding: 17,
    gap: 6,
  },
  clueTag: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "800",
    color: colors.green,
  },
  clueText: { fontSize: 17, lineHeight: 24, color: colors.ink },
  keyboardInput: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    textAlign: "center",
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  erase: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  clues: { flexDirection: "row", gap: 16 },
  clueRow: {
    flexDirection: "row",
    gap: 8,
    padding: 8,
    borderRadius: 10,
    minHeight: 44,
  },
  clueNumber: { fontWeight: "800", fontSize: 13, color: colors.green },
  listClue: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.ink },
});
