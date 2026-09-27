import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import type { PublicUser } from "@move-together/shared";
import { api } from "./api";

const TOKEN_KEY = "move-together.session";

type Status = "loading" | "signedOut" | "needsName" | "ready";

type SessionValue = {
  status: Status;
  token: string | null;
  user: PublicUser | null;
  signIn: (token: string, user: PublicUser) => Promise<void>;
  setUser: (user: PublicUser) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUserState] = useState<PublicUser | null>(null);

  function apply(nextToken: string | null, nextUser: PublicUser | null) {
    setToken(nextToken);
    setUserState(nextUser);
    if (!nextToken || !nextUser) setStatus("signedOut");
    else if (nextUser.needsDisplayName) setStatus("needsName");
    else setStatus("ready");
  }

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(TOKEN_KEY)
      .then(async (stored) => {
        if (cancelled) return;
        if (!stored) {
          setStatus("signedOut");
          return;
        }
        try {
          const me = await api<{ user: PublicUser }>("/me", { token: stored });
          if (!cancelled) apply(stored, me.user);
        } catch {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          if (!cancelled) apply(null, null);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("signedOut");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      token,
      user,
      async signIn(nextToken, nextUser) {
        await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
        apply(nextToken, nextUser);
      },
      setUser(nextUser) {
        setUserState(nextUser);
        setStatus(nextUser.needsDisplayName ? "needsName" : "ready");
      },
      async signOut() {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        apply(null, null);
      },
    }),
    [status, token, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
