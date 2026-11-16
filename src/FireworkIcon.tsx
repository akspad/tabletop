import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './ui';

export default function FireworkIcon({ size = 38, color = colors.green }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" accessible={false} aria-hidden>
    <Path d="M20 4v9M20 27v9M4 20h9M27 20h9M8.7 8.7l6.4 6.4M24.9 24.9l6.4 6.4M8.7 31.3l6.4-6.4M24.9 15.1l6.4-6.4" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    <Circle cx={20} cy={20} r={2.5} fill={color} />
  </Svg>;
}
