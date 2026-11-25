import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api, setUnauthorizedHandler, upload, type LocalFile } from "./api";
import { availableServers, SERVERS, type Server, type ServerId } from "./config";
import { logInfo, logWarn } from "./log";
import type { Feature, LoginResponse, Me } from "./types";

/**
 * Sessão do aplicativo. O token de aparelho (mag_app_…) fica só no SecureStore (cifrado pelo Android Keystore) e é
 * revogável no servidor: ao sair, ao trocar a senha, ao desativar a conta ou mudar o perfil. Se o servidor recusar
 * o token, o app sai sozinho e avisa.
 */
const TOKEN_KEY = "mag.token";
const SERVER_KEY = "mag.servidor";
export const TOKEN_PATTERN = /^mag_app_[A-Za-z0-9_-]{43}$/;

type Status = "carregando" | "fora" | "dentro";
interface AuthState {
  status: Status;
  server: Server;
  token: string | null;
  me: Me | null;
  notice: string | null;
  has: (feature: Feature) => boolean;
  loginWithPassword: (input: { serverId: ServerId; email: string; password: string; code?: string }) => Promise<void>;
  loginWithToken: (serverId: ServerId, token: string) => Promise<void>;
  logout: () => Promise<{ revokedOnServer: boolean }>;
  refreshMe: () => Promise<void>;
  clearNotice: () => void;
}
const AuthContext = createContext<AuthState | null>(null);

const deviceName = () => {
  const parts = [Device.manufacturer, Device.modelName].filter(Boolean).join(" ").trim();
  return `${parts || "Android"} · app MAG CRM`.slice(0, 80);
};
const serverById = (id: string | null): Server => availableServers().find((server) => server.id === id) ?? SERVERS.producao;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("carregando");
  const [server, setServer] = useState<Server>(SERVERS.producao);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const forget = useCallback(async (message: string | null) => {
    tokenRef.current = null;
    setToken(null);
    setMe(null);
    setStatus("fora");
    setNotice(message);
    try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch { /* nada a apagar */ }
  }, []);

  const adopt = useCallback(async (target: Server, newToken: string) => {
    const profile = await api<Me>("me", { baseUrl: target.baseUrl, token: newToken });
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    await SecureStore.setItemAsync(SERVER_KEY, target.id);
    tokenRef.current = newToken;
    setServer(target);
    setToken(newToken);
    setMe(profile);
    setNotice(null);
    setStatus("dentro");
    logInfo("sessão", `entrou (${target.id})`);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { void forget("Seu acesso expirou ou foi revogado. Entre de novo."); });
    return () => setUnauthorizedHandler(null);
  }, [forget]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [savedToken, savedServer] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(SERVER_KEY)]);
        const target = serverById(savedServer);
        if (!alive) return;
        setServer(target);
        if (!savedToken || !TOKEN_PATTERN.test(savedToken)) { setStatus("fora"); return; }
        try {
          await adopt(target, savedToken);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) await forget("Seu acesso expirou ou foi revogado. Entre de novo.");
          else {
            // Sem rede ao abrir: mantém o token e mostra o app; as telas avisam e tentam de novo.
            tokenRef.current = savedToken;
            setToken(savedToken);
            setStatus("dentro");
            logWarn("sessão", "perfil não carregado ao abrir");
          }
        }
      } catch {
        if (alive) setStatus("fora");
      }
    })();
    return () => { alive = false; };
  }, [adopt, forget]);

  const loginWithPassword = useCallback<AuthState["loginWithPassword"]>(async ({ serverId, email, password, code }) => {
    const target = serverById(serverId);
    const result = await api<LoginResponse>("auth/login", {
      baseUrl: target.baseUrl, method: "POST",
      body: { email: email.trim(), password, deviceName: deviceName(), days: 30, ...(code ? { code: code.trim() } : {}) },
    });
    await adopt(target, result.token);
  }, [adopt]);

  const loginWithToken = useCallback<AuthState["loginWithToken"]>(async (serverId, value) => {
    const clean = value.trim();
    if (!TOKEN_PATTERN.test(clean)) throw new ApiError(400, "token_format", "O código do aparelho começa com mag_app_ e tem 51 caracteres.");
    await adopt(serverById(serverId), clean);
  }, [adopt]);

  const logout = useCallback<AuthState["logout"]>(async () => {
    let revokedOnServer = false;
    const current = tokenRef.current;
    if (current && me?.features?.includes("auth.logout")) {
      try {
        await api("auth/logout", { baseUrl: server.baseUrl, token: current, method: "POST", body: {} });
        revokedOnServer = true;
      } catch {
        logWarn("sessão", "revogação no servidor não confirmada");
      }
    }
    await forget(revokedOnServer ? null : "Você saiu deste aparelho. Para encerrar o acesso no servidor, revogue o aparelho no CRM web (Aplicativo).");
    return { revokedOnServer };
  }, [forget, me, server]);

  const refreshMe = useCallback(async () => {
    if (!tokenRef.current) return;
    setMe(await api<Me>("me", { baseUrl: server.baseUrl, token: tokenRef.current }));
  }, [server]);

  const value = useMemo<AuthState>(() => ({
    status, server, token, me, notice,
    has: (feature) => Boolean(me?.features?.includes(feature)),
    loginWithPassword, loginWithToken, logout, refreshMe,
    clearNotice: () => setNotice(null),
  }), [status, server, token, me, notice, loginWithPassword, loginWithToken, logout, refreshMe]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth fora do AuthProvider");
  return value;
}
/** Requisição autenticada com o servidor e o token da sessão atual. */
export function useApi() {
  const { server, token } = useAuth();
  return useCallback(<T,>(path: string, options: { method?: "GET" | "POST" | "PATCH" | "PUT"; body?: unknown; idempotencyKey?: string; timeoutMs?: number } = {}) =>
    api<T>(path, { baseUrl: server.baseUrl, token, ...options }), [server, token]);
}
/** Envio de arquivo autenticado (anexo da conversa). */
export function useUpload() {
  const { server, token } = useAuth();
  return useCallback(<T,>(path: string, file: LocalFile, timeoutMs?: number) => upload<T>(path, file, { baseUrl: server.baseUrl, token, timeoutMs }), [server, token]);
}
