import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useConfirmedPlay } from './HanabiCelebration';
import { actionsMatch, COLORS, NUMBERS, type Action, type Card, type Color, type GameView, type Knowledge } from './hanabi';

type Props = {
  game: GameView;
  playerId: string;
  players: { id: string; name: string; color: string }[];
  act: (action: Action) => Promise<void>;
  busy: boolean;
};

const ink: Record<Color, string> = { red: '#a63732', yellow: '#80600a', green: '#235d47', blue: '#315c9b', white: '#645e54' };
const tint: Record<Color, string> = { red: '#f6ded8', yellow: '#f7ebbb', green: '#dcebdc', blue: '#dce7f2', white: '#fffdf8' };

function cluesText(clues: Knowledge): string {
  const color = clues.colors.length ? `Color: ${clues.colors.join(', ')}` : clues.notColors.length ? `Not ${clues.notColors.join(', ')}` : 'Color unknown';
  const number = clues.numbers.length ? `Number: ${clues.numbers.join(', ')}` : clues.notNumbers.length ? `Not ${clues.notNumbers.join(', ')}` : 'Number unknown';
  return `${color}\n${number}`;
}

function DealCard({ reducedMotion, children }: { reducedMotion: boolean; children: React.ReactNode }) {
  const entrance = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) { entrance.setValue(1); return; }
    entrance.setValue(0);
    const animation = Animated.timing(entrance, { toValue: 1, duration: 240, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, entrance]);
  return <Animated.View style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
}

export default function HanabiView({ game, playerId, players, act, busy }: Props) {
  const { move, progress, reducedMotion } = useConfirmedPlay(game);
  const pulse = progress.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [1, 1.08, 1, 1] });
  const teammates = game.players.filter(id => id !== playerId);
  const [target, setTarget] = useState(teammates[0]);
  const [clueKind, setClueKind] = useState<'color' | 'number'>('color');
  const [selected, setSelected] = useState<string | null>(null);
  const targetId = teammates.includes(target) ? target : teammates[0];
  const ownHand = game.hands[playerId] ?? [];
  const selectedId = ownHand.some(card => card.id === selected) ? selected : ownHand[0]?.id;
  const yourTurn = game.status === 'playing' && game.turnPlayerId === playerId;
  const name = (id: string) => players.find(player => player.id === id)?.name ?? id;
  const allowed = (action: Action) => !busy && game.legalActions.some(legal => actionsMatch(legal, action));
  const send = (action: Action) => { if (allowed(action)) void act(action).catch(() => {}); };
  const actionButton = (label: string, action: Action, secondary = false) => {
    const enabled = allowed(action);
    return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={() => send(action)} style={[styles.button, secondary && styles.secondary, !enabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>;
  };
  const targetHand = (game.hands[targetId] ?? []) as Card[];
  const lastAction = game.lastAction?.replace(/^[^ ]+/, id => name(id)).replace(/told ([^:]+):/, (_, id: string) => `told ${name(id)}:`);

  return <View style={styles.board}>
    <View style={styles.turnBanner}>
      <Text style={styles.turnTitle}>{game.status === 'finished' ? 'Game complete' : yourTurn ? 'Your turn' : `${name(game.turnPlayerId)}’s turn`}</Text>
      <Text style={styles.caption}>{busy ? 'Sending move…' : game.finalTurnsRemaining !== null && game.status === 'playing' ? `${game.finalTurnsRemaining} final turns left` : 'Build the five fireworks together'}</Text>
    </View>
    <View style={styles.metrics}>
      <Text style={styles.metric}>Clues {game.clueTokens}/8</Text>
      <Animated.View style={!reducedMotion && move?.outcome === 'mistake' ? { transform: [{ scale: pulse }] } : undefined}>
        <Text style={[styles.metric, move?.outcome === 'mistake' && { color: '#b63d37', backgroundColor: '#ffe0d9' }]}>Mistakes {3 - game.fusesRemaining}/3</Text>
      </Animated.View>
      <Text style={styles.metric}>Deck {game.deckCount}</Text>
      <Text style={styles.metric}>Score {game.score}/25</Text>
    </View>
    <View style={styles.fireworks}>
      {COLORS.map(color => <Animated.View key={color} accessibilityLabel={`${color} firework: ${game.fireworks[color]} of 5`} style={[styles.firework, { backgroundColor: tint[color], borderColor: ink[color] }, !reducedMotion && move?.outcome === 'success' && move.card.color === color && { transform: [{ scale: pulse }] }]}>
        <Text style={[styles.fireworkName, { color: ink[color] }]}>{color}</Text>
        <Text style={[styles.fireworkNumber, { color: ink[color] }]}>{game.fireworks[color]}</Text>
        <Text style={styles.small}>{game.fireworks[color] === 5 ? 'done' : `next ${game.fireworks[color] + 1}`}</Text>
      </Animated.View>)}
    </View>

    <Text style={styles.heading}>Teammates</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {teammates.map(id => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: targetId === id }} onPress={() => setTarget(id)} style={[styles.tab, targetId === id && styles.tabActive]}>
        <View style={[styles.dot, { backgroundColor: players.find(player => player.id === id)?.color ?? '#235d47' }]} />
        <Text style={[styles.tabText, targetId === id && styles.tabTextActive]}>{name(id)}{game.turnPlayerId === id && game.status === 'playing' ? ' · turn' : ''}</Text>
      </Pressable>)}
    </ScrollView>
    <ScrollView horizontal contentContainerStyle={styles.cardRow}>
      {targetHand.map((card, index) => <DealCard key={card.id} reducedMotion={reducedMotion}><View accessibilityLabel={`${name(targetId)}, slot ${index + 1}, ${card.color} ${card.number}. ${cluesText(card.clues)}`} style={[styles.card, { backgroundColor: tint[card.color], borderColor: ink[card.color] }]}>
        <Text style={styles.small}>Slot {index + 1}</Text>
        <Text style={[styles.face, { color: ink[card.color] }]}>{card.number}</Text>
        <Text style={[styles.colorName, { color: ink[card.color] }]}>{card.color}</Text>
        <Text style={styles.cardClues}>{cluesText(card.clues)}</Text>
      </View></DealCard>)}
      {targetHand.length === 0 && <Text style={styles.caption}>No cards remaining.</Text>}
    </ScrollView>
    <View style={styles.clueHeader}>
      <Text style={styles.subheading}>Clue {name(targetId)}</Text>
      <View style={styles.row}>
        {(['color', 'number'] as const).map(kind => <Pressable key={kind} accessibilityRole="button" accessibilityState={{ selected: clueKind === kind }} onPress={() => setClueKind(kind)} style={[styles.kind, clueKind === kind && styles.tabActive]}>
          <Text style={[styles.tabText, clueKind === kind && styles.tabTextActive]}>{kind === 'color' ? 'Color' : 'Number'}</Text>
        </Pressable>)}
      </View>
    </View>
    <View style={styles.clueOptions}>
      {(clueKind === 'color' ? COLORS : NUMBERS).map(value => {
        const action: Action = clueKind === 'color' ? { type: 'clue', targetId, clue: { kind: 'color', value: value as Color } } : { type: 'clue', targetId, clue: { kind: 'number', value: value as (typeof NUMBERS)[number] } };
        const enabled = allowed(action);
        const count = targetHand.filter(card => clueKind === 'color' ? card.color === value : card.number === value).length;
        return <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Clue ${value}: ${count} matching cards, costs one token`} accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={() => send(action)} style={[styles.clueOption, !enabled && styles.disabled, clueKind === 'color' && { backgroundColor: tint[value as Color], borderColor: ink[value as Color] }]}>
          <Text style={[styles.clueValue, clueKind === 'color' && { color: ink[value as Color] }]}>{value}</Text>
          <Text style={styles.small}>{count} {count === 1 ? 'card' : 'cards'}</Text>
        </Pressable>;
      })}
    </View>
    <Text style={styles.caption}>{game.clueTokens === 0 ? 'No clue tokens. Play or discard to continue.' : 'A clue costs 1 token and marks every matching card.'}</Text>

    <View style={styles.clueHeader}>
      <Text style={styles.heading}>Your hand</Text>
      <Text style={styles.caption}>Faces hidden · tap a slot</Text>
    </View>
    <ScrollView horizontal contentContainerStyle={styles.cardRow}>
      {ownHand.map((card, index) => <DealCard key={card.id} reducedMotion={reducedMotion}><Pressable accessibilityRole="button" accessibilityLabel={`Your slot ${index + 1}. ${cluesText(card.clues)}`} accessibilityState={{ selected: selectedId === card.id }} onPress={() => setSelected(card.id)} style={[styles.card, styles.ownCard, selectedId === card.id && styles.selectedCard]}>
        <Text style={styles.small}>Slot {index + 1}</Text>
        <Text style={styles.hiddenFace}>?</Text>
        <Text style={styles.cardClues}>{cluesText(card.clues)}</Text>
      </Pressable></DealCard>)}
      {ownHand.length === 0 && <Text style={styles.caption}>No cards remaining.</Text>}
    </ScrollView>
    <View style={styles.actions}>
      {actionButton(`Play slot ${Math.max(0, ownHand.findIndex(card => card.id === selectedId)) + 1}`, { type: 'play', cardId: selectedId ?? '' })}
      {actionButton('Discard · +1 clue', { type: 'discard', cardId: selectedId ?? '' }, true)}
    </View>
    <Text style={styles.caption}>{!yourTurn ? 'Actions unlock on your turn.' : game.clueTokens === 8 ? 'Clues are full: give a clue or play a card.' : 'Choose one action: clue, play, or discard.'}</Text>
    {lastAction && <Text accessibilityLiveRegion="polite" style={styles.lastAction}>{lastAction}</Text>}
    <Text style={styles.heading}>Discard pile · {game.discards.length}</Text>
    <View style={styles.discards}>
      {game.discards.length === 0 ? <Text style={styles.caption}>No discarded cards yet.</Text> : COLORS.map(color => {
        const cards = game.discards.filter(card => card.color === color);
        return cards.length > 0 ? <Text key={color} style={[styles.discard, { backgroundColor: tint[color], color: ink[color] }]}>{color}: {cards.map(card => card.number).sort().join(' · ')}</Text> : null;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  board: { backgroundColor: '#f8f3e8', padding: 14, gap: 12, borderRadius: 20 },
  turnBanner: { padding: 15, backgroundColor: '#e1ebdc', borderRadius: 14, gap: 4 },
  turnTitle: { fontSize: 22, fontWeight: '800', color: '#235d47' },
  caption: { fontSize: 13, color: '#625e53', lineHeight: 19, flexShrink: 1 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { backgroundColor: '#fffdf8', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, fontSize: 13, fontWeight: '700', color: '#235d47' },
  fireworks: { flexDirection: 'row', gap: 6 },
  firework: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', gap: 3 },
  fireworkName: { fontSize: 11, fontWeight: '700' },
  fireworkNumber: { fontSize: 25, fontWeight: '800' },
  small: { fontSize: 11, color: '#625e53' },
  heading: { fontSize: 18, fontWeight: '800', color: '#235d47' },
  subheading: { fontSize: 14, fontWeight: '700', color: '#235d47', flexShrink: 1 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tab: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#eae4d6', flexDirection: 'row', gap: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#235d47' },
  tabText: { color: '#235d47', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#fffdf8' },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: '#fffdf8' },
  cardRow: { gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  card: { width: 98, minHeight: 155, padding: 9, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 4 },
  face: { fontSize: 32, fontWeight: '800' },
  colorName: { fontSize: 13, fontWeight: '700' },
  cardClues: { fontSize: 11, lineHeight: 16, color: '#4e4b42', textAlign: 'center' },
  clueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  kind: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', backgroundColor: '#eae4d6' },
  clueOptions: { flexDirection: 'row', gap: 6 },
  clueOption: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10, borderWidth: 1, borderColor: '#c4c9b9', backgroundColor: '#fffdf8' },
  clueValue: { fontSize: 13, fontWeight: '800', color: '#235d47' },
  ownCard: { backgroundColor: '#eee9dc', borderColor: '#c8c5b8' },
  selectedCard: { borderColor: '#235d47', borderWidth: 3, padding: 7, backgroundColor: '#e1ebdc' },
  hiddenFace: { fontSize: 35, fontWeight: '800', color: '#235d47' },
  actions: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, minHeight: 48, backgroundColor: '#235d47', borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fffdf8', fontSize: 14, fontWeight: '700' },
  secondary: { backgroundColor: '#e1ebdc', borderColor: '#235d47', borderWidth: 1 },
  secondaryText: { color: '#235d47' },
  disabled: { opacity: 0.4 },
  lastAction: { fontSize: 13, lineHeight: 20, color: '#4e4b42', backgroundColor: '#fffdf8', padding: 12, borderRadius: 10 },
  discards: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  discard: { borderRadius: 8, padding: 8, fontSize: 12, fontWeight: '600' },
});
