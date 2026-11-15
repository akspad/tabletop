import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const key = "tabletop.fresh.session.v1";
export type Seat = { code: string; playerId: string };
export type Session = { secret: string; name: string; seat: Seat | null };
let loading: Promise<Session> | null = null;
export function loadSession(): Promise<Session> {
  if (loading) return loading;
  loading = (async () => {
    const saved = await AsyncStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (
        typeof parsed.secret === "string" &&
        /^[a-f0-9]{64}$/.test(parsed.secret)
      )
        return {
          secret: parsed.secret,
          name: typeof parsed.name === "string" ? parsed.name : "",
          seat: parsed.seat ?? null,
        };
    }
    const bytes = await Crypto.getRandomBytesAsync(32);
    const session: Session = {
      secret: Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
      name: "",
      seat: null,
    };
    await saveSession(session);
    return session;
  })();
  return loading;
}
export async function saveSession(session: Session) {
  await AsyncStorage.setItem(key, JSON.stringify(session));
}
