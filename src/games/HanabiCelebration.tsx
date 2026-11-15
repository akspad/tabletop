import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { Color, GameView, PlayMove } from './hanabi';

type Props = { game: GameView; players: { id: string; name: string; color: string }[] };

const colors: Record<Color, string> = { red: '#b63d37', yellow: '#98720e', green: '#235d47', blue: '#315c9b', white: '#756c59' };
const surfaces: Record<Color, string> = { red: '#ffe0d9', yellow: '#fff0ba', green: '#deefd8', blue: '#deebff', white: '#fffdf5' };

export function useConfirmedPlay(game: GameView) {
  const sequence = game.moveSequence ?? game.lastMove?.sequence ?? 0;
  const seen = useRef(sequence);
  const progress = useRef(new Animated.Value(0)).current;
  const [move, setMove] = useState<PlayMove | null>(null);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; listener.remove(); };
  }, []);

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    setMove(null);
    const previous = seen.current;
    seen.current = sequence;
    if (sequence <= previous || !game.lastMove || game.lastMove.sequence !== sequence) return;
    let active = true;
    setMove(game.lastMove);
    const animation = Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true });
    animation.start(({ finished }) => { if (active && finished) setMove(null); });
    return () => { active = false; animation.stop(); };
  }, [sequence, progress]);

  return { move, progress, reducedMotion };
}

export default function HanabiCelebration({ game, players }: Props) {
  const { move, progress, reducedMotion } = useConfirmedPlay(game);
  if (!move) return null;
  const success = move.outcome === 'success';
  const accent = success ? colors[move.card.color] : '#b63d37';
  const actor = players.find(player => player.id === move.actorId)?.name ?? 'A teammate';
  const opacity = progress.interpolate({ inputRange: [0, 0.1, 0.78, 1], outputRange: [0, 1, 1, 0] });
  const scale = progress.interpolate({ inputRange: [0, 0.22, 0.5, 1], outputRange: [0.7, 1.08, 1, 0.96] });
  const lift = progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [90, -15, -45] });
  const shake = progress.interpolate({ inputRange: [0, 0.13, 0.23, 0.33, 0.43, 0.53, 0.63, 1], outputRange: [0, -12, 12, -9, 9, -5, 0, 0] });

  return <View pointerEvents="none" style={styles.overlay} accessibilityLiveRegion="polite">
    {!success && <Animated.View style={[styles.flash, { opacity: progress.interpolate({ inputRange: [0, 0.15, 0.65, 1], outputRange: [0, 0.1, 0.04, 0] }) }]} />}
    <Animated.View style={[styles.stage, { opacity }, !reducedMotion && { transform: [{ translateY: lift }, { translateX: success ? 0 : shake }, { scale }] }]}>
      {success && !reducedMotion && <View style={styles.burst}>
        <Animated.View style={[styles.ring, { borderColor: accent, opacity: progress.interpolate({ inputRange: [0, 0.2, 0.65, 1], outputRange: [0, 0.7, 0.15, 0] }), transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.65] }) }] }]} />
        {Array.from({ length: 8 }, (_, i) => <View key={i} style={[styles.rayAxis, { transform: [{ rotate: `${i * 45}deg` }] }]}>
          <Animated.View style={[styles.ray, { backgroundColor: i % 2 ? '#d4a84c' : accent, opacity: progress.interpolate({ inputRange: [0, 0.18, 0.6, 1], outputRange: [0, 1, 0.8, 0] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-35, -125] }) }, { scaleY: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 0.1] }) }] }]} />
        </View>)}
      </View>}
      <View style={[styles.revealedCard, { backgroundColor: surfaces[move.card.color], borderColor: colors[move.card.color] }]}>
        <Text style={[styles.color, { color: colors[move.card.color] }]}>{move.card.color}</Text>
        <Text style={[styles.number, { color: colors[move.card.color] }]}>{move.card.number}</Text>
        <Text style={[styles.cardCaption, { color: accent }]}>{success ? 'BUILT!' : 'MISFIRE'}</Text>
      </View>
      <View style={[styles.message, { borderColor: accent }]}>
        <Text style={[styles.result, { color: accent }]}>{success ? 'Let it sparkle!' : 'One fuse lost'}</Text>
        <Text style={styles.actor} numberOfLines={2}>{actor} played {move.card.color} {move.card.number}</Text>
      </View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, alignItems: 'center', justifyContent: 'center' },
  flash: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#d93c35' },
  stage: { alignItems: 'center', gap: 14, width: '85%', maxWidth: 340 },
  revealedCard: { width: 116, height: 152, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center', gap: 3, boxShadow: '0 8px 24px #00000026' },
  color: { fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2 },
  number: { fontSize: 62, lineHeight: 70, fontWeight: '900' },
  cardCaption: { fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  message: { backgroundColor: '#fffdf5', borderWidth: 2, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', gap: 4, boxShadow: '0 4px 16px #0000001a' },
  result: { fontSize: 22, fontWeight: '900' },
  actor: { fontSize: 14, color: '#514d42', textAlign: 'center', fontWeight: '600' },
  burst: { position: 'absolute', top: 76, left: '50%', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 180, height: 180, borderWidth: 3, borderRadius: 100 },
  rayAxis: { position: 'absolute', width: 4, height: 4, alignItems: 'center', justifyContent: 'center' },
  ray: { width: 5, height: 22, borderRadius: 4 },
});
