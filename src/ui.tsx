import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from "react-native";

export const colors = {
  paper: "#f8f3e8",
  ink: "#253d32",
  green: "#235d47",
  muted: "#6e796f",
  line: "#dedfd1",
  white: "#fffdf7",
  lime: "#d9e8ae",
  peach: "#f2c5aa",
  red: "#a34737",
};
export const serif = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});
export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[s.card, style]} />;
}
export function Label({ children }: React.PropsWithChildren) {
  return <Text style={s.label}>{children}</Text>;
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.green : colors.white} />
      ) : (
        <Text style={[s.buttonText, secondary && { color: colors.green }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#8a9185"
      {...props}
      style={[s.input, props.style]}
    />
  );
}
export function Avatar({
  name,
  color,
  size = 44,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{ fontSize: size * 0.38, color: colors.ink, fontWeight: "700" }}
      >
        {name.trim().slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}
export const s = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 24,
    padding: 22,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  button: {
    minHeight: 54,
    backgroundColor: colors.green,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonText: { fontSize: 15, fontWeight: "700", color: colors.white },
  input: {
    minHeight: 54,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  title: { fontFamily: serif, fontSize: 39, lineHeight: 44, color: colors.ink },
  body: { fontSize: 15, lineHeight: 23, color: colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
