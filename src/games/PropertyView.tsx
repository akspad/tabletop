import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, COLORS, Color } from './property';

type Props = {
  game: any;
  playerId: string;
  players: { id: string; name: string; color: string }[];
  act: (action: any) => Promise<void>;
  busy: boolean;
};

const PALETTE: Record<Color, string> = { coral: '#a94336', amber: '#815800', mint: '#27634f', sky: '#275d83', plum: '#76456f' };
const title = (card: Card) => card.kind === 'property' ? `${card.color} property` : card.kind === 'money' ? `${card.value} money` : card.kind === 'rent' ? 'Rent 2' : card.kind === 'steal' ? 'Steal' : 'Block';
const explanation = (card: Card) => card.kind === 'property' ? 'Two of a color make a set' : card.kind === 'money' ? 'Add to your bank' : card.kind === 'rent' ? 'Charge one rival 2' : card.kind === 'steal' ? 'Take an unprotected property' : 'Cancel rent or a steal';

export default function PropertyView({ game, playerId, players, act, busy }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const seats: any[] = game.seats ?? [];
  const me = seats.find(seat => seat.id === playerId);
  const hand: Card[] = me?.hand ?? [];
  const selected = hand.find(card => card.id === selectedId);
  const pending = game.pending;
  const pendingProperty: Card | undefined = pending?.type === 'steal'
    ? COLORS.flatMap(color => seats.find(seat => seat.id === pending.target)?.properties[color] ?? []).find(card => card.id === pending.propertyId)
    : undefined;
  const myTurn = game.turnPlayerId === playerId;
  const responding = pending?.target === playerId;
  const playing = game.status === 'playing';
  const canPlay = playing && myTurn && game.phase === 'play' && game.playsLeft > 0 && !busy;
  const name = (id: string) => players.find(player => player.id === id)?.name ?? 'Player';
  const complete = (seat: any) => COLORS.filter(color => seat.properties[color].length === 2).length;
  const toggle = (id: string) => setChosenIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  const send = async (action: any) => {
    try {
      await act(action);
      setSelectedId(null);
      setTargetId(null);
      setPropertyId(null);
      setChosenIds([]);
    } catch {}
  };
  useEffect(() => { setChosenIds([]); }, [game.phase, game.turnPlayerId]);
  const bank: Card[] = me?.bank ?? [];
  const payment = bank.filter(card => chosenIds.includes(card.id)).reduce((sum, card) => sum + card.value, 0);
  const bankTotal = bank.reduce((sum, card) => sum + card.value, 0);
  const discardCount = Math.max(0, hand.length - 7);
  const target = seats.find(seat => seat.id === targetId);
  const stealChoices: Card[] = target ? COLORS.flatMap(color => target.properties[color].length < 2 && me.properties[color].length < 2 ? target.properties[color] : []) : [];

  const button = (label: string, onPress: () => void, disabled = false, secondary = false) => (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy }} disabled={disabled || busy} onPress={onPress} style={[styles.button, secondary && styles.secondary, (disabled || busy) && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );

  return <View style={styles.root}>
    <View style={styles.turnPanel}>
      <Text style={styles.eyebrow}>{pending ? 'RESPONSE IN PROGRESS' : myTurn ? 'YOUR TURN' : `${name(game.turnPlayerId).toUpperCase()}’S TURN`}</Text>
      <Text style={styles.turnTitle}>{pending ? `${name(pending.target)} must respond` : game.phase === 'discard' ? 'Finish by discarding to 7' : `${game.playsLeft} of 3 plays left`}</Text>
      <Text style={styles.body}>{pending ? `${name(pending.actor)} ${pending.type === 'rent' ? 'charges 2 in rent' : `wants a ${pendingProperty?.color ?? ''} property`}.` : game.lastEvent}</Text>
      <Text style={styles.meta}>{game.deckCount} cards in deck · {game.discardCount} discarded</Text>
    </View>

    {responding && game.phase === 'response' && <View style={styles.actionPanel}>
      <Text style={styles.sectionTitle}>{pending.type === 'rent' ? 'Rent requested: 2' : `Your ${pendingProperty?.color ?? ''} property is being stolen`}</Text>
      <Text style={styles.body}>{pending.type === 'rent' ? 'Pay only from your bank. Your properties are safe.' : 'Accept the transfer, or discard a Block to cancel it.'}</Text>
      <View style={styles.row}>
        {button('Accept', () => void send({ type: 'accept' }), !playing)}
        {button('Use Block', () => void send({ type: 'block', cardId: hand.find(card => card.kind === 'block')?.id }), !hand.some(card => card.kind === 'block') || !playing, true)}
      </View>
      {!hand.some(card => card.kind === 'block') && <Text style={styles.meta}>You have no Block card.</Text>}
    </View>}

    {responding && game.phase === 'payment' && <View style={styles.actionPanel}>
      <Text style={styles.sectionTitle}>Choose bank cards to pay 2</Text>
      <Text style={styles.body}>Selected: {payment}. Overpayment gets no change.</Text>
      <View style={styles.wrap}>{bank.map(card => <Pressable key={card.id} accessibilityRole="button" accessibilityState={{ selected: chosenIds.includes(card.id), disabled: busy }} disabled={busy} onPress={() => toggle(card.id)} style={[styles.paymentCard, chosenIds.includes(card.id) && styles.selected]}>
        <Text style={styles.paymentValue}>{card.value}</Text><Text style={styles.small}>{title(card)}</Text>
      </Pressable>)}</View>
      {button(`Pay ${payment}`, () => void send({ type: 'pay', cardIds: chosenIds }), !playing || (bankTotal < 2 ? chosenIds.length !== bank.length : payment < 2))}
    </View>}

    <Text style={styles.sectionTitle}>The neighborhood</Text>
    {seats.map(seat => <View key={seat.id} style={[styles.playerPanel, seat.id === playerId && styles.myPanel]}>
      <View style={styles.headingRow}><Text style={styles.playerName}>{name(seat.id)}{seat.id === playerId ? ' · You' : ''}</Text><Text style={styles.setCount}>{complete(seat)}/3 sets</Text></View>
      <View style={styles.wrap}>{COLORS.map(color => <View key={color} style={[styles.group, { borderColor: PALETTE[color] }]}>
        <Text style={[styles.colorLabel, { color: PALETTE[color] }]}>{color}</Text>
        <Text style={styles.groupCount}>{seat.properties[color].length === 2 ? 'SET ✓' : `${seat.properties[color].length} / 2`}</Text>
      </View>)}</View>
      <Text style={styles.bankLabel}>Bank {seat.bank.reduce((sum: number, card: Card) => sum + card.value, 0)} · {seat.handCount} cards in hand</Text>
      <View style={styles.wrap}>{seat.bank.length ? seat.bank.map((card: Card) => <View key={card.id} style={styles.bankChip}><Text style={styles.small}>{title(card)} · {card.value}</Text></View>) : <Text style={styles.meta}>No banked cards yet</Text>}</View>
    </View>)}

    <View style={styles.headingRow}><Text style={styles.sectionTitle}>Your hand</Text><Text style={styles.meta}>{hand.length} cards · private</Text></View>
    {myTurn && game.phase === 'discard' && <View style={styles.actionPanel}>
      <Text style={styles.sectionTitle}>Select {discardCount} to discard</Text>
      <Text style={styles.body}>Selected {chosenIds.length} of {discardCount}. You only discard at the end of a turn.</Text>
      {button('Discard & finish turn', () => void send({ type: 'discard', cardIds: chosenIds }), chosenIds.length !== discardCount || !playing)}
    </View>}
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.hand}>
      {hand.map(card => {
        const isDiscard = myTurn && game.phase === 'discard';
        const active = isDiscard ? chosenIds.includes(card.id) : selectedId === card.id;
        return <Pressable key={card.id} accessibilityRole="button" accessibilityLabel={`${title(card)}, bank value ${card.value}`} accessibilityState={{ selected: active, disabled: busy }} disabled={busy} onPress={() => {
          if (isDiscard) toggle(card.id);
          else { setSelectedId(active ? null : card.id); setTargetId(null); setPropertyId(null); }
        }} style={[styles.card, active && styles.selected]}>
          <View style={[styles.cardBand, { backgroundColor: card.color ? PALETTE[card.color] : '#235d47' }]}><Text style={styles.cardType}>{card.kind === 'property' ? card.color : card.kind}</Text></View>
          <Text style={styles.cardTitle}>{title(card)}</Text>
          <Text style={styles.cardDescription}>{explanation(card)}</Text>
          <Text style={styles.cardValue}>Bank value {card.value}</Text>
        </Pressable>;
      })}
      {!hand.length && <Text style={styles.body}>No cards in hand. Draw two when your next turn starts.</Text>}
    </ScrollView>

    {selected && myTurn && game.phase === 'play' && <View style={styles.actionPanel}>
      <Text style={styles.sectionTitle}>{title(selected)}</Text>
      <View style={styles.row}>
        {button(`Bank for ${selected.value}`, () => void send({ type: 'bank', cardId: selected.id }), !canPlay)}
        {selected.kind === 'property' && button('Place property', () => void send({ type: 'place', cardId: selected.id }), !canPlay || me.properties[selected.color!].length === 2, true)}
      </View>
      {selected.kind === 'property' && me.properties[selected.color!].length === 2 && <Text style={styles.meta}>You already have a complete {selected.color} set.</Text>}
      {(selected.kind === 'rent' || selected.kind === 'steal') && <>
        {selected.kind === 'rent' && complete(me) === 0 && !COLORS.some(color => me.properties[color].length) && <Text style={styles.body}>Place a property before charging rent.</Text>}
        <Text style={styles.bankLabel}>Choose an opponent</Text>
        <View style={styles.wrap}>{seats.filter(seat => seat.id !== playerId).map(seat => <Pressable key={seat.id} accessibilityRole="button" accessibilityState={{ selected: targetId === seat.id, disabled: !canPlay }} disabled={!canPlay} onPress={() => { setTargetId(seat.id); setPropertyId(null); }} style={[styles.target, targetId === seat.id && styles.selected]}><Text style={styles.targetText}>{name(seat.id)}</Text></Pressable>)}</View>
        {selected.kind === 'steal' && target && <>
          <Text style={styles.body}>Choose an incomplete property you have room for.</Text>
          <View style={styles.wrap}>{stealChoices.map(card => <Pressable key={card.id} accessibilityRole="button" accessibilityState={{ selected: propertyId === card.id, disabled: !canPlay }} disabled={!canPlay} onPress={() => setPropertyId(card.id)} style={[styles.target, propertyId === card.id && styles.selected]}><Text style={[styles.targetText, { color: PALETTE[card.color!] }]}>{card.color} property</Text></Pressable>)}</View>
          {!stealChoices.length && <Text style={styles.meta}>No eligible properties. Complete sets are protected.</Text>}
        </>}
        {button(selected.kind === 'rent' ? 'Request rent · 2' : 'Request steal', () => void send({ type: selected.kind, cardId: selected.id, targetId, ...(selected.kind === 'steal' ? { propertyId } : {}) }), !canPlay || !targetId || (selected.kind === 'rent' ? !COLORS.some(color => me.properties[color].length) : !propertyId))}
      </>}
    </View>}
    {playing && myTurn && game.phase === 'play' && button('End turn', () => void send({ type: 'endTurn' }), false, true)}
    {!myTurn && !responding && <Text style={styles.waiting}>{pending ? `Waiting for ${name(pending.target)} to respond.` : `Waiting for ${name(game.turnPlayerId)} to play.`}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#f8f3e8', gap: 14, paddingBottom: 18 },
  turnPanel: { backgroundColor: '#e5eddf', borderRadius: 18, padding: 18, gap: 7 },
  eyebrow: { color: '#235d47', fontSize: 12, fontWeight: '800', letterSpacing: 1.3 },
  turnTitle: { color: '#173e30', fontSize: 23, fontWeight: '800' },
  body: { color: '#38463b', fontSize: 16, lineHeight: 23 },
  meta: { color: '#586455', fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: '#233d30', fontSize: 20, fontWeight: '700' },
  actionPanel: { backgroundColor: '#fffdf6', borderWidth: 1, borderColor: '#c7d2bd', padding: 16, borderRadius: 16, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  button: { backgroundColor: '#235d47', minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 13 },
  secondary: { backgroundColor: '#f8f3e8', borderWidth: 1, borderColor: '#235d47' },
  buttonText: { color: '#fffdf5', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  secondaryText: { color: '#235d47' },
  disabled: { opacity: 0.4 },
  playerPanel: { backgroundColor: '#fffcf4', borderWidth: 1, borderColor: '#dedbcf', borderRadius: 16, padding: 14, gap: 10 },
  myPanel: { borderColor: '#73967a', borderWidth: 2 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  playerName: { color: '#263e31', fontSize: 17, fontWeight: '700' },
  setCount: { color: '#235d47', fontWeight: '800', fontSize: 15 },
  group: { minWidth: 72, flexGrow: 1, borderTopWidth: 5, borderWidth: 1, borderRadius: 8, padding: 8, alignItems: 'center', gap: 4 },
  colorLabel: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  groupCount: { color: '#364538', fontSize: 14, fontWeight: '700' },
  bankLabel: { color: '#364538', fontSize: 15, fontWeight: '700' },
  bankChip: { borderRadius: 6, backgroundColor: '#eeeee2', paddingHorizontal: 8, paddingVertical: 5 },
  small: { color: '#38463b', fontSize: 12, textTransform: 'capitalize' },
  hand: { gap: 10, paddingVertical: 5, paddingRight: 8 },
  card: { width: 144, minHeight: 205, backgroundColor: '#fffdf6', borderColor: '#d2cfbf', borderWidth: 2, borderRadius: 14, overflow: 'hidden' },
  selected: { borderColor: '#235d47', borderWidth: 3, backgroundColor: '#e7efdf' },
  cardBand: { padding: 10 },
  cardType: { color: '#fffdf6', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  cardTitle: { color: '#253e30', padding: 10, fontWeight: '800', fontSize: 21, textTransform: 'capitalize' },
  cardDescription: { color: '#495343', fontSize: 13, lineHeight: 18, paddingHorizontal: 10, flexGrow: 1 },
  cardValue: { color: '#235d47', padding: 10, fontSize: 14, fontWeight: '700' },
  target: { borderWidth: 1, borderColor: '#a4b49a', borderRadius: 10, padding: 12, minHeight: 48, justifyContent: 'center' },
  targetText: { color: '#235d47', fontSize: 16, fontWeight: '700', textTransform: 'capitalize' },
  paymentCard: { minWidth: 90, minHeight: 85, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#a4b49a', justifyContent: 'center', gap: 4 },
  paymentValue: { color: '#235d47', fontSize: 26, fontWeight: '800' },
  waiting: { color: '#475b49', textAlign: 'center', fontSize: 16, paddingVertical: 12 },
});
