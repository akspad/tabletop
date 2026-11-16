import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useAction, useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import * as Crypto from 'expo-crypto';
import { api, type Player } from './api';
import type { Action } from './games/property';
import { cleanError } from './errors';
import { Button, Card, Label, colors, s } from './ui';

export type PropertyAdvisorContext = { gameId: string; version: number; players: Player[] };
type Advice = { gameId: string; version: number; title: string; reason: string; action: Action };
const staleMessage = 'The table changed. Ask for a fresh suggestion.';

export default function PropertyAdvisor({ secret, code, context }: {
  secret: string; code: string; context: PropertyAdvisorContext;
}) {
  const advise = useAction(api.adviseProperty);
  const act = useMutation(api.act);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'ask' | 'apply' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const latest = useRef<PropertyAdvisorContext | null>(context);
  const previous = useRef(context);
  const requested = useRef(false);
  const working = useRef(false);
  latest.current = context;
  const currentAdvice = advice?.gameId === context.gameId && advice.version === context.version ? advice : null;
  useEffect(() => {
    latest.current = context;
    return () => { latest.current = null; };
  }, []);
  useEffect(() => {
    if (previous.current.gameId !== context.gameId || previous.current.version !== context.version) {
      setAdvice(null);
      setConfirming(false);
      setError('');
      if (requested.current) setMessage(staleMessage);
    }
    previous.current = context;
  }, [context.gameId, context.version]);

  async function suggest() {
    if (working.current) return;
    working.current = true;
    requested.current = true;
    const snapshot = { gameId: context.gameId, version: context.version };
    setBusy('ask');
    setAdvice(null);
    setConfirming(false);
    setMessage('');
    setError('');
    try {
      const result: Advice = await advise({ secret, code, gameId: snapshot.gameId, expectedVersion: snapshot.version });
      if (!latest.current) return;
      if (latest.current.gameId !== snapshot.gameId || latest.current.version !== snapshot.version || result.gameId !== snapshot.gameId || result.version !== snapshot.version) {
        setMessage(staleMessage);
        return;
      }
      setAdvice(result);
    } catch (failure) {
      if (!latest.current) return;
      if (latest.current.gameId !== snapshot.gameId || latest.current.version !== snapshot.version) setMessage(staleMessage);
      else {
        const data = failure instanceof ConvexError ? failure.data : null;
        setError(data && typeof data === 'object' && 'code' in data && data.code === 'COOLDOWN'
          ? 'Give Keiki a moment before asking for another suggestion.'
          : cleanError(failure));
      }
    } finally {
      working.current = false;
      if (latest.current) setBusy(null);
    }
  }

  async function confirm() {
    if (working.current || !confirming || !currentAdvice) return;
    working.current = true;
    setBusy('apply');
    setError('');
    try {
      await act({ secret, code, gameId: currentAdvice.gameId, expectedVersion: currentAdvice.version, actionId: Crypto.randomUUID(), action: currentAdvice.action });
      if (!latest.current) return;
      setAdvice(null);
      setConfirming(false);
      requested.current = false;
      setMessage('Move played.');
    } catch (failure) {
      if (latest.current) setError(cleanError(failure));
    } finally {
      working.current = false;
      if (latest.current) setBusy(null);
    }
  }

  const targetId = currentAdvice && 'targetId' in currentAdvice.action ? currentAdvice.action.targetId : null;
  const target = context.players.find(player => player.id === targetId)?.name;
  return <Card testID="property-advisor" style={{ padding: 18, gap: 12 }}>
    <Label>OPTIONAL · PROPERTY MOVE ADVISOR</Label>
    <Text style={[s.body, { color: colors.ink }]}>Want a second opinion on your next move?</Text>
    <Text style={s.body}>Each suggestion shares your Property Rush hand and the public board with Keiki, never opponents’ hands or the deck. Keiki stores requests.</Text>
    <Button secondary title="Suggest a move" loading={busy === 'ask'} disabled={busy !== null} onPress={() => void suggest()} />
    {busy === 'ask' && <Text accessibilityLiveRegion="polite" style={s.body}>Keiki is considering your moves. Nothing is played automatically.</Text>}
    {message ? <Text accessibilityLiveRegion="polite" style={s.body}>{message}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={[s.body, { color: colors.red }]}>{error}</Text> : null}
    {currentAdvice && <View testID="property-advice" style={{ gap: 12 }}>
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{currentAdvice.title}</Text>
      <Text style={[s.body, { color: colors.ink }]}>{currentAdvice.reason}</Text>
      {target && <Text style={s.body}>Target: {target}</Text>}
      <Text style={s.body}>AI can be wrong. Review the move before playing.</Text>
      {confirming ? <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>Play this suggested move?</Text>
        <Text style={s.body}>{currentAdvice.title}</Text>
        <Button secondary title="Keep thinking" disabled={busy !== null} onPress={() => setConfirming(false)} />
        <Button title="Confirm move" loading={busy === 'apply'} disabled={busy !== null} onPress={() => void confirm()} />
      </View> : <Button title="Use this move" disabled={busy !== null} onPress={() => setConfirming(true)} />}
    </View>}
  </Card>;
}
