import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { useAction } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api, type GameType } from './api';
import { cleanError } from './errors';
import { Button, Card, Input, Label, colors, s } from './ui';
import PropertyAdvisor, { type PropertyAdvisorContext } from './PropertyAdvisor';

const examples: Record<GameType, string[]> = {
  crossword: ['How do I switch Across and Down?', 'Can we edit at the same time?'],
  hanabi: ['Does a clue mark every matching card?', 'Who gets a final turn when the deck runs out?'],
  property: ['Can I pay rent with my properties?', 'Do I get change if I pay 3 for rent of 2?'],
};

export default function KeikiRules({ secret, code, gameType, propertyContext, onBack }: {
  secret: string; code: string; gameType: GameType; onBack: () => void;
  propertyContext?: PropertyAdvisorContext;
}) {
  const ask = useAction(api.askRules);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const sending = useRef(false);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1_000));
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) setRetryAt(0);
    }, 250);
    return () => clearInterval(timer);
  }, [retryAt]);
  async function send() {
    if (sending.current || seconds > 0 || !question.trim()) return;
    sending.current = true;
    Keyboard.dismiss();
    setBusy(true);
    setError('');
    setAnswer('');
    const started = Date.now();
    setNow(started);
    setRetryAt(started + 5_000);
    try { setAnswer(await ask({ secret, code, gameType, question: question.trim() })); }
    catch (failure) {
      const data = failure instanceof ConvexError ? failure.data : null;
      if (data && typeof data === 'object' && 'code' in data && data.code === 'COOLDOWN' && 'retryAfterMs' in data && typeof data.retryAfterMs === 'number') {
        const current = Date.now();
        setNow(current);
        setRetryAt(current + Math.min(5_000, Math.max(0, data.retryAfterMs)));
      } else setError(cleanError(failure));
    }
    finally { sending.current = false; setBusy(false); }
  }
  return <View style={{ gap: 14 }}>
    {gameType === 'property' && propertyContext && <PropertyAdvisor secret={secret} code={code} context={propertyContext} />}
    <Label>OPTIONAL · POWERED BY KEIKI</Label>
    <Text style={[s.body, { color: colors.ink }]}>Ask a rule, keep the game moving.</Text>
    <Text style={s.body}>{propertyContext ? 'For rules questions, only your chosen game and question go to Keiki. Keiki stores questions. Don’t include private cards or personal info.' : 'Only your chosen game and question go to Keiki. Keiki stores questions. Don’t include private cards or personal info.'}</Text>
    {!answer && examples[gameType].map(example => <Button key={example} secondary title={example} disabled={busy} onPress={() => setQuestion(example)} />)}
    <Input accessibilityLabel="Rules question" placeholder="What would you like explained?" value={question} onChangeText={setQuestion} multiline blurOnSubmit returnKeyType="send" onSubmitEditing={() => void send()} maxLength={300} editable={!busy} style={{ minHeight: 88, textAlignVertical: 'top' }} />
    <Button title={seconds > 0 ? `Ask again in ${seconds}s` : 'Ask Keiki'} loading={busy} disabled={!question.trim() || seconds > 0} onPress={() => void send()} />
    {!busy && seconds > 0 && <Text accessibilityLiveRegion="polite" style={s.body}>Give Keiki a moment before your next question.</Text>}
    {busy && <Text accessibilityLiveRegion="polite" style={s.body}>Keiki is thinking… Your game is unchanged.</Text>}
    {error ? <Text accessibilityRole="alert" style={[s.body, { color: colors.red }]}>{error}</Text> : null}
    {answer ? <Card style={{ padding: 16, gap: 10 }}><Label>KEIKI’S EXPLANATION</Label><Text accessibilityLiveRegion="polite" selectable style={[s.body, { color: colors.ink }]}>{answer}</Text></Card> : null}
    <Text style={s.body}>AI can be wrong. The app’s rules apply.</Text>
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Limits and details"
        accessibilityState={{ expanded: detailsOpen }}
        aria-expanded={detailsOpen}
        onPress={() => setDetailsOpen(open => !open)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.green }}>Limits and details</Text>
        <Text style={{ color: colors.green }}>{detailsOpen ? '−' : '+'}</Text>
      </Pressable>
      {detailsOpen && <Text style={s.body}>{propertyContext ? 'Up to 20 requests per guest each UTC day, with 5 seconds between requests. Rules questions and move suggestions share this limit. No live table data is attached to rules questions.' : 'Up to 20 questions per guest each UTC day, with 5 seconds between questions. No live table data is attached.'}</Text>}
    </View>
    <Button secondary title="Back to rules" onPress={onBack} />
  </View>;
}
