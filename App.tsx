import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { loadSession, saveSession, type Session } from "./src/session";
import Shell from "./src/Shell";
import { Button, Card, colors, s, serif } from "./src/ui";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
const client =
  url && /^https:\/\//.test(url) ? new ConvexReactClient(url) : null;
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    loadSession()
      .then(setSession)
      .catch(() =>
        setError(
          "Your private session could not be saved. Please allow local storage, then reopen Tabletop.",
        ),
      );
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={styles.root}>
        {!client ? (
          <SetupScreen />
        ) : error ? (
          <SafeAreaView style={styles.center}>
            <Text style={s.body}>{error}</Text>
          </SafeAreaView>
        ) : !session ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.green} />
            <Text style={[s.body, { marginTop: 16 }]}>Saving your seat…</Text>
          </View>
        ) : (
          <ConvexProvider client={client}>
            <ConnectionBoundary
              onHome={async () => {
                const next = { ...session, seat: null };
                await saveSession(next);
                setSession(next);
              }}
            >
              <Shell session={session} onSession={setSession} />
            </ConnectionBoundary>
          </ConvexProvider>
        )}
      </View>
    </SafeAreaProvider>
  );
}
function SetupScreen() {
  return (
    <SafeAreaView style={styles.center}>
      <View style={{ maxWidth: 440, width: "100%", gap: 25 }}>
        <Text style={styles.brand}>
          tabletop<Text style={{ color: "#b87d51" }}>.</Text>
        </Text>
        <View style={styles.art}>
          <View style={styles.tile}>
            <Text style={styles.tileText}>t</Text>
          </View>
          <View
            style={[
              styles.tile,
              {
                backgroundColor: colors.peach,
                transform: [{ rotate: "13deg" }],
                marginLeft: -12,
                marginTop: 28,
              },
            ]}
          >
            <Text style={styles.tileText}>t</Text>
          </View>
        </View>
        <View>
          <Text style={s.label}>GOOD COMPANY. GREAT GAMES.</Text>
          <Text style={s.title}>A place at the table.</Text>
          <Text style={[s.body, { marginTop: 15 }]}>
            A cozy game night, on every phone. Your table needs a live
            connection before the first game can begin.
          </Text>
        </View>
        <Card>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "700",
              color: colors.ink,
              marginBottom: 9,
            }}
          >
            One setup step remains
          </Text>
          <Text style={s.body}>
            Set EXPO_PUBLIC_CONVEX_URL to your deployed Convex URL, then restart
            Expo. No sample rooms or simulated games are shown.
          </Text>
        </Card>
        <Text style={[s.body, { fontSize: 12 }]}>
          Your private guest session stays on this device.
        </Text>
      </View>
    </SafeAreaView>
  );
}
class ConnectionBoundary extends React.Component<
  React.PropsWithChildren<{ onHome: () => Promise<void> }>,
  { error: boolean; attempt: number }
> {
  state = { error: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <SafeAreaView style={styles.center}>
          <Card style={{ gap: 18, maxWidth: 440 }}>
            <Text style={[s.title, { fontSize: 30 }]}>
              We couldn’t reach your table.
            </Text>
            <Text style={s.body}>
              The room may have expired, or its connection needs attention. Your
              saved seat is still on this device.
            </Text>
            <Button
              title="Try again"
              onPress={() =>
                this.setState((state) => ({
                  error: false,
                  attempt: state.attempt + 1,
                }))
              }
            />
            <Button
              secondary
              title="Start fresh from home"
              onPress={() => {
                void this.props
                  .onHome()
                  .then(() =>
                    this.setState((state) => ({
                      error: false,
                      attempt: state.attempt + 1,
                    })),
                  );
              }}
            />
          </Card>
        </SafeAreaView>
      );
    return (
      <React.Fragment key={this.state.attempt}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  brand: {
    fontFamily: serif,
    fontSize: 34,
    fontWeight: "700",
    color: colors.green,
  },
  art: {
    height: 150,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  tile: {
    width: 95,
    height: 108,
    borderRadius: 22,
    backgroundColor: colors.lime,
    borderWidth: 1,
    borderColor: "#c2d397",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-12deg" }],
  },
  tileText: { fontFamily: serif, fontSize: 70, color: colors.green },
});
