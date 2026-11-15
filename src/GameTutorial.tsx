import React, { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors, serif } from "./ui";

export type GameTutorialProps = {
  gameType: "hanabi" | "property" | null;
  visible: boolean;
  onClose: () => void;
};

const hanabiSteps = [
  { title: "A little trust. A great show.", subtitle: "Build five fireworks, together.", paragraphs: [
    "Hanabi is cooperative for 2–5 players. Build each color from 1 to 5, in order. Every card placed adds one point, for a perfect score of 25.",
    "The twist: your own card faces stay hidden. You can see your teammates’ cards, and they can see yours. Use clues, not extra hints about hidden faces.",
    "Start with 8 shared clue tokens and 3 fuses. Each player gets 5 cards with 2–3 players, or 4 cards with 4–5 players.",
  ] },
  { title: "Say one thing. Mark every match.", subtitle: "A clue is one whole turn.", paragraphs: [
    "On your turn, choose one action: give a clue, play one card, or discard one card.",
    "Spend 1 shared clue token to tell one teammate a color or number. It must match at least one of their cards. Every matching card is marked automatically; you cannot choose just a subset. Nonmatching cards are marked as not that color or number.",
  ] },
  { title: "One step at a time.", subtitle: "A firework cannot skip a number.", paragraphs: [
    "A pile starts with 1. Then play the next number in that same color: 2, 3, 4, 5. Each color has its own pile.",
    "A wrong play is discarded and costs 1 fuse. Three mistakes end the game with a score of 0. After a play, draw a replacement if cards remain and the game has not ended.",
  ] },
  { title: "Make room for another clue.", subtitle: "A shared resource worth saving.", paragraphs: [
    "Discard one card only when there are fewer than 8 clue tokens. Recover 1 token, then draw a replacement if the deck has cards. At 8 tokens, discarding is unavailable.",
    "Successfully playing a 5 also restores 1 clue token, up to the maximum of 8. A clue does not draw a card.",
    "Played and discarded cards do not return to the deck. The 50-card deck has, in each color, three 1s, two each of 2, 3, and 4, and only one 5. Check the public discards before taking a risk.",
  ] },
  { title: "One last turn for everyone.", subtitle: "You’re ready to make something brilliant.", paragraphs: [
    "When someone draws the last card, the final round begins. Every player gets one more turn, including the person who drew it. There are no replacement cards left to draw.",
    "The game ends after those turns, immediately at 25 points, or immediately when the third fuse is lost. Otherwise, your shared score is the sum of the five piles.",
    "Your turn in a sentence: give one legal clue, play one card, or discard one card when clues are below 8. Read your own clue marks and help the whole table.",
  ] },
];

const propertySteps = [
  { title: "Build your little neighborhood.", subtitle: "Three colors. Three complete sets.", paragraphs: [
    "Property Rush is a simplified 60-card game for 2–4 players. Be first to own 3 complete sets in different colors. A set is exactly 2 properties of one color; you may never own more than 2 of a color.",
    "Everyone starts with 5 cards in hand. The first player draws 2 more to begin their turn. Your hand is private; properties and banks are public.",
    "The deck has 30 properties across 5 colors, 16 money cards, 6 Rent cards, 4 Steal cards, and 4 Block cards. These are this table’s rules, not the rules of another property game.",
  ] },
  { title: "A turn with room to choose.", subtitle: "Draw 2. Play up to 3. Keep at most 7.", paragraphs: [
    "Draw 2 cards at the start of each turn. Use up to 3 plays to place a property, bank a card, charge rent, or steal. Each card played counts as one play; you may end your turn early.",
    "Any card can be banked for its printed value, including properties and action cards. Once banked, it is permanently money only: you cannot return it to your hand, place it as property, or use its action.",
    "End your turn after your plays. If you have more than 7 cards in hand, choose cards to discard until exactly 7 remain. There is no extra draw for playing a card.",
  ] },
  { title: "Rent comes from the bank.", subtitle: "A payment of 3 still pays a bill of 2.", paragraphs: [
    "You must own at least one property to play Rent. Choose one opponent and charge 2. They must accept or use a Block from their hand before your turn can continue.",
    "If they accept, only banked cards can pay—never their hand or properties. Choose bank cards totaling at least 2. If the whole bank has less than 2, pay all of it, even if it is empty. No change is given.",
  ] },
  { title: "Some homes are off-limits.", subtitle: "Complete sets are protected.", paragraphs: [
    "Play Steal to request one opponent’s property from an incomplete set. You must also have room for that color: fewer than 2 properties of your own.",
    "The target must accept or use a Block from their hand. Accepting transfers the property to you; blocking leaves it where it was. You cannot steal from a complete set.",
  ] },
  { title: "Keep a Block up your sleeve.", subtitle: "A response, not your next turn’s play.", paragraphs: [
    "When you are targeted by Rent or Steal, you can discard a Block from your hand to cancel that action. A banked Block is only money and cannot help.",
    "Responding with Block does not spend a play from your future turn. A Block cannot be blocked. Once the response or payment is resolved, the original player continues with any plays they have left.",
    "Collect 3 distinct-color sets of 2 to win immediately. If the draw deck runs out, shuffle the discard pile into a new deck; draw what is available. Bank thoughtfully, protect your sets, and have fun with your rivals.",
  ] },
];

const hanabiTasks = [
  ["Whose cards can you see?", "Tap your teammate’s face-up card."],
  ["One clue. Every match.", "Give Red and watch every matching card light up."],
  ["Build in order.", "Choose the next card, then play it."],
  ["Bring a clue back.", "Discard one hidden card to restore a clue token."],
  ["A last turn for everyone.", "Draw the last card, then take each player’s final turn."],
];
const propertyTasks = [
  ["Your third complete set.", "Place Sky to complete three different-color sets."],
  ["Draw, then make a play.", "Draw two cards, then bank Rent as money."],
  ["Rent comes from the bank.", "Accept rent, then pay 2 from your bank."],
  ["Keep a Block handy.", "Block the incoming steal with the card in your hand."],
  ["Steal with care.", "Take an incomplete Mint property where you have room."],
  ["Seven cards to finish.", "Choose one card to discard, then end with seven."],
];

function Tile({ title, detail, tint = colors.white, marked = false, onPress, disabled = false }: {
  title: string;
  detail: string;
  tint?: string;
  marked?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const contents = <><Text style={styles.tileTitle}>{title}</Text><Text style={styles.small}>{detail}</Text></>;
  const style = [styles.tile, { backgroundColor: tint }, marked && styles.marked, disabled && styles.disabled];
  return onPress ? <Pressable
    accessibilityRole="button"
    accessibilityLabel={title + ". " + detail}
    accessibilityState={{ selected: marked, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}
  >{contents}</Pressable> : <View style={style}>{contents}</View>;
}

function Lesson({ gameType, onClose }: { gameType: "hanabi" | "property"; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [more, setMore] = useState(false);
  const [visibleFace, setVisibleFace] = useState(false);
  const [ownTapped, setOwnTapped] = useState(false);
  const [clued, setClued] = useState(false);
  const [selectedPlay, setSelectedPlay] = useState<"red" | "blue" | null>(null);
  const [played, setPlayed] = useState<"red" | "blue" | null>(null);
  const [mistake, setMistake] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const [finalTurn, setFinalTurn] = useState(-1);
  const [placed, setPlaced] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [banked, setBanked] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [payment, setPayment] = useState<1 | 3 | null>(null);
  const [paymentError, setPaymentError] = useState(false);
  const [paid, setPaid] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [stolen, setStolen] = useState(false);
  const [discardChoice, setDiscardChoice] = useState<number | null>(null);
  const [trimmed, setTrimmed] = useState(false);
  const [ended, setEnded] = useState(false);
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const hanabi = gameType === "hanabi";
  const tasks = hanabi ? hanabiTasks : propertyTasks;
  const reference = hanabi ? hanabiSteps[step] : propertySteps[[0, 1, 2, 4, 3, 1][step]];
  const done = hanabi
    ? [visibleFace, clued, played === "red", discarded, finalTurn === 3][step]
    : [placed, banked, paid, blocked, stolen, ended][step];
  const changeStep = (next: number) => {
    setStep(next);
    setMore(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const feedback = hanabi ? [
    visibleFace ? "You see your teammates’ faces, never your own. Together, build five colors from 1 to 5 for 25 points." : ownTapped ? "Your card stays hidden. Try your teammate’s face-up card." : "",
    clued ? "Both red cards are marked; Blue 1 is not red. One clue costs one token, never a chosen subset." : "",
    played === "red" ? "Red 2 fits on Red 1! Draw a replacement if the deck has cards." : played === "blue" ? "Blue 2 is missing: lose one fuse and discard Blue 3. Try Red 2; three mistakes end the game." : "",
    discarded ? "Clues are full at 8, so Discard is now disabled. You draw a replacement; a successful 5 also restores one clue." : "",
    finalTurn === 3 ? "B, C, then A all got one final turn, including the drawer. The game ends: 12 points together!" : finalTurn >= 0 ? "The deck is empty. Everyone gets one more turn, including A who drew the last card." : "",
  ][step] : [
    placed ? "Three distinct-color sets of two: you win! You can never own more than two properties of a color." : "",
    banked ? "Rent is now permanently money worth 1, not an action. Banking used one of your three plays." : drawn ? "Two cards drawn. Now try banking Rent for its printed value of 1." : "",
    paid ? "The 3 transfers to your rival, with no change. Your 1 stays banked; your hand and properties never pay." : paymentError ? "Just 1 is not enough when your bank holds 4. Try the 3 card." : accepted ? "Accepted. Choose banked cards worth at least 2, or your whole bank if it holds less." : "",
    blocked ? "The steal is cancelled. Your next turn still has three plays, and a Block cannot be blocked." : "",
    stolen ? "Mint fits! This practice rival accepts, so Mint moves to you; in a real game, they could Block instead." : "",
    ended ? "Seven cards kept. Your turn is over, and the next player draws two." : trimmed ? "One discarded, seven left. Now end your turn." : "",
  ][step];

  return <SafeAreaView style={styles.safe}>
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLabel}>
          <Text style={styles.eyebrow}>{hanabi ? "HANABI" : "PROPERTY RUSH"} · TRY IT</Text>
          <Text style={styles.progressText}>Step {step + 1} of {tasks.length}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      <View accessibilityLabel={"Step " + (step + 1) + " of " + tasks.length} style={styles.progress}>
        {tasks.map((_, index) => <View key={index} style={[styles.progressSegment, index <= step && styles.progressFilled]} />)}
      </View>
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{tasks[step][0]}</Text>
        <Text style={styles.instruction}>{tasks[step][1]}</Text>
        <Text style={styles.practiceNote}>Practice only · your table is unchanged</Text>
        <View style={styles.board}>
          {hanabi && step === 0 && <>
            <View style={styles.row}>
              <Tile title="?" detail="Your card · hidden" tint={colors.lime} onPress={() => setOwnTapped(true)} />
              <Tile title="Blue 1" detail="Teammate · visible" tint="#dce7f2" marked={visibleFace} onPress={() => setVisibleFace(true)} />
            </View>
            <Text style={styles.counter}>Five colors · 1 → 2 → 3 → 4 → 5</Text>
          </>}
          {hanabi && step === 1 && <>
            <Text style={styles.counter}>Clue tokens: {clued ? "7 / 8" : "8 / 8"}</Text>
            <View style={styles.row}>
              <Tile title="Red 1" detail={clued ? "✓ Red" : "Slot 1"} tint="#f6ded8" marked={clued} />
              <Tile title="Blue 1" detail={clued ? "Not red" : "Slot 2"} tint="#dce7f2" />
              <Tile title="Red 3" detail={clued ? "✓ Red" : "Slot 3"} tint="#f6ded8" marked={clued} />
            </View>
            <Button title={clued ? "Red clue given · 8 → 7" : "Give Red clue · costs 1"} disabled={clued} onPress={() => setClued(true)} />
          </>}
          {hanabi && step === 2 && <>
            <Text style={styles.counter}>Piles: Red {played === "red" ? "2" : "1"} · Blue 1  |  Fuses: {mistake ? "2" : "3"} / 3</Text>
            <View style={styles.row}>
              <Tile title="Red 2" detail="Choose this card" tint="#f6ded8" marked={selectedPlay === "red"} disabled={played === "red"} onPress={() => setSelectedPlay("red")} />
              <Tile title="Blue 3" detail={mistake ? "Discarded · mistake" : "Choose this card"} tint="#dce7f2" marked={selectedPlay === "blue"} disabled={mistake || played === "red"} onPress={() => setSelectedPlay("blue")} />
            </View>
            <Text style={styles.small}>Example faces revealed for practice only.</Text>
            <Button title={played === "red" ? "Red 2 played ✓" : "Play selected card"} disabled={!selectedPlay || played === "red" || (selectedPlay === "blue" && mistake)} onPress={() => {
              if (selectedPlay === "blue") { setMistake(true); setPlayed("blue"); }
              if (selectedPlay === "red") setPlayed("red");
            }} />
          </>}
          {hanabi && step === 3 && <>
            <Text style={styles.counter}>Clue tokens: {discarded ? "8 / 8 · full" : "7 / 8"}</Text>
            <View style={styles.row}>
              <Tile title="?" detail={discarded ? "New card drawn" : "Your hidden card"} tint={colors.lime} />
              <Tile title={discarded ? "+1 clue" : "Discard →"} detail={discarded ? "7 → 8 tokens" : "Recover one token"} tint="#f6ded8" />
            </View>
            <Button title={discarded ? "Discard unavailable · clues full" : "Discard hidden card"} disabled={discarded} onPress={() => setDiscarded(true)} />
          </>}
          {hanabi && step === 4 && <>
            <Text style={styles.counter}>Deck: {finalTurn < 0 ? "1 card" : "empty"} · Score: 12 / 25</Text>
            <View style={styles.row}>
              {["B", "C", "A"].map((name, index) => <Tile key={name} title={name + (finalTurn > index ? " ✓" : "")} detail={name === "A" ? "Last-card drawer" : "Teammate"} marked={finalTurn === index} tint={finalTurn > index ? colors.lime : colors.white} />)}
            </View>
            <Button title={finalTurn < 0 ? "A draws the last card" : finalTurn === 3 ? "Final round complete ✓" : "Take " + ["B", "C", "A"][finalTurn] + "’s final turn"} disabled={finalTurn === 3} onPress={() => setFinalTurn(turn => turn + 1)} />
          </>}
          {!hanabi && step === 0 && <>
            <Text style={styles.counter}>Your complete sets: {placed ? "3 / 3 · winner!" : "2 / 3"}</Text>
            <View style={styles.row}>
              <Tile title="Coral × 2" detail="Complete" tint="#f6ded8" />
              <Tile title="Mint × 2" detail="Complete" tint="#dcebdc" />
              <Tile title={"Sky × " + (placed ? "2" : "1")} detail={placed ? "Complete" : "One more needed"} tint="#dce7f2" marked={placed} />
            </View>
            <Button title={placed ? "Sky placed · three sets ✓" : "Place Sky from your hand"} disabled={placed} onPress={() => setPlaced(true)} />
          </>}
          {!hanabi && step === 1 && <>
            <Text style={styles.counter}>Hand: {banked ? "6" : drawn ? "7" : "5"}  |  Plays left: {banked ? "2" : "3"} / 3</Text>
            <View style={styles.row}>
              <Tile title={drawn ? "Deck −2" : "Draw pile"} detail={drawn ? "Two cards drawn" : "Start your turn"} tint={colors.lime} />
              <Tile title={banked ? "Bank: 1" : "Rent · value 1"} detail={banked ? "Money only · permanent" : "Card in your hand"} tint="#f6ded8" />
            </View>
            <Button title={banked ? "Rent banked as money ✓" : drawn ? "Bank Rent for 1" : "Draw 2 cards"} disabled={banked} onPress={() => drawn ? setBanked(true) : setDrawn(true)} />
          </>}
          {!hanabi && step === 2 && <>
            <Text style={styles.counter}>{paid ? "Rent paid: 3 · change: 0" : "Rival owns Mint × 1 → Rent 2"}</Text>
            {!accepted && <Button title="Accept Rent 2" onPress={() => setAccepted(true)} />}
            <View style={styles.row}>
              <Tile title="Bank 1" detail="Value 1" marked={payment === 1} disabled={!accepted || paid} onPress={() => { setPayment(1); setPaymentError(false); }} />
              <Tile title={paid ? "3 → rival" : "Bank 3"} detail={paid ? "Transferred · no change" : "Value 3"} marked={payment === 3} disabled={!accepted || paid} onPress={() => { setPayment(3); setPaymentError(false); }} />
            </View>
            {accepted && <Button title={paid ? "Paid 3 · no change ✓" : "Pay " + (payment ?? "selected cards")} disabled={!payment || paid} onPress={() => payment === 3 ? setPaid(true) : setPaymentError(true)} />}
          </>}
          {!hanabi && step === 3 && <>
            <Text style={styles.counter}>{blocked ? "Steal cancelled ✓" : "Rival’s Steal → your Mint property"}</Text>
            <View style={styles.row}>
              <Tile title="Block" detail="In your hand" tint={colors.lime} marked={blocked} />
              <Tile title="Next turn" detail="3 / 3 plays · unchanged" />
            </View>
            <Button title={blocked ? "Block used · action cancelled ✓" : "Use Block from hand"} disabled={blocked} onPress={() => setBlocked(true)} />
          </>}
          {!hanabi && step === 4 && <>
            <Text style={styles.counter}>Your properties: Mint {stolen ? "2" : "1"} · Sky 2</Text>
            <View style={styles.row}>
              <Tile title="Coral × 2" detail="Rival’s set · protected" tint="#f6ded8" disabled onPress={() => {}} />
              <Tile title="Sky × 1" detail="Your Sky is full" tint="#dce7f2" disabled onPress={() => {}} />
            </View>
            <Button title={stolen ? "Mint moved to you ✓" : "Steal rival’s Mint × 1"} disabled={stolen} onPress={() => setStolen(true)} />
          </>}
          {!hanabi && step === 5 && <>
            <Text style={styles.counter}>Hand: {trimmed ? "7" : "8"} cards{ended ? " · turn ended ✓" : ""}</Text>
            <View style={styles.hand}>
              {Array.from({ length: 8 }, (_, index) => trimmed && discardChoice === index ? null : <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={"Select card " + (index + 1) + " to discard"}
                accessibilityState={{ selected: discardChoice === index, disabled: trimmed }}
                disabled={trimmed}
                onPress={() => setDiscardChoice(index)}
                style={[styles.miniCard, discardChoice === index && styles.marked]}
              ><Text style={styles.miniCardText}>{index + 1}</Text></Pressable>)}
            </View>
            <Button title={ended ? "Turn ended ✓" : trimmed ? "End turn with 7" : "Discard selected card"} disabled={ended || discardChoice === null} onPress={() => trimmed ? setEnded(true) : setTrimmed(true)} />
          </>}
        </View>
        {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(value => !value)} style={styles.more}>
          <Text style={styles.moreText}>{more ? "− Less rules" : "+ More rules"}</Text>
        </Pressable>
        {more && <View style={styles.reference}>
          <Text style={styles.referenceTitle}>{reference.title}</Text>
          {reference.paragraphs.map(paragraph => <Text key={paragraph} style={styles.body}>{paragraph}</Text>)}
          {!hanabi && step === 5 && <Text style={styles.body}>{propertySteps[4].paragraphs[2]}</Text>}
        </View>}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.back}><Button title="Back" secondary disabled={step === 0} onPress={() => changeStep(step - 1)} /></View>
        <View style={styles.next}><Button title={step === tasks.length - 1 ? "Ready to play" : "Next →"} disabled={!done} onPress={step === tasks.length - 1 ? onClose : () => changeStep(step + 1)} /></View>
      </View>
    </View>
  </SafeAreaView>;
}

export default function GameTutorial({ gameType, visible, onClose }: GameTutorialProps) {
  if (!visible || !gameType) return null;
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <Lesson key={gameType} gameType={gameType} onClose={onClose} />
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { flex: 1, width: "100%", maxWidth: 640, alignSelf: "center" },
  header: { paddingHorizontal: 18, paddingTop: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  headerLabel: { flex: 1 },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  progressText: { color: colors.muted, fontSize: 12, marginTop: 4 },
  close: { minWidth: 58, minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: colors.white },
  closeText: { color: colors.green, fontSize: 14, fontWeight: "700" },
  progress: { flexDirection: "row", gap: 5, marginHorizontal: 18, marginTop: 10 },
  progressSegment: { height: 4, flex: 1, borderRadius: 4, backgroundColor: colors.line },
  progressFilled: { backgroundColor: colors.green },
  scroll: { flex: 1 },
  content: { padding: 18, gap: 10, paddingBottom: 24 },
  title: { color: colors.ink, fontFamily: serif, fontSize: 27, lineHeight: 32 },
  instruction: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  practiceNote: { color: colors.green, fontSize: 11, fontWeight: "700", lineHeight: 16 },
  board: { backgroundColor: "#edf0e0", borderRadius: 20, padding: 13, gap: 12, borderWidth: 1, borderColor: "#cdd6bb" },
  row: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, minHeight: 84, padding: 10, borderRadius: 14, borderWidth: 2, borderColor: "transparent", gap: 6, justifyContent: "center" },
  tileTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  small: { color: "#536457", fontSize: 12, lineHeight: 17 },
  counter: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  marked: { borderColor: colors.green },
  disabled: { opacity: 0.6 },
  feedback: { color: colors.green, backgroundColor: colors.white, padding: 12, borderRadius: 14, fontSize: 14, lineHeight: 21 },
  more: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 4 },
  moreText: { color: colors.green, fontSize: 14, fontWeight: "700" },
  reference: { padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line, gap: 14 },
  referenceTitle: { color: colors.ink, fontFamily: serif, fontSize: 21 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  hand: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  miniCard: { width: "23%", minHeight: 48, borderRadius: 10, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.white, justifyContent: "center", alignItems: "center" },
  miniCardText: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.line },
  back: { flex: 1 },
  next: { flex: 2 },
});
