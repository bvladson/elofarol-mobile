import Constants from "expo-constants";

export type ServerId = "producao" | "local";
export interface Server { id: ServerId; label: string; hint: string; baseUrl: string }

/**
 * Produção: o CRM real, sempre por HTTPS. Homologação local: a API do CRM rodando no PC da TI com dados fictícios,
 * alcançada pelo cabo USB (adb reverse tcp:3100 tcp:3100). A homologação local só existe nas versões de desenvolvimento.
 */
export const SERVERS: Record<ServerId, Server> = {
  producao: { id: "producao", label: "MAG CRM", hint: "magmoveiscorporativos.com.br", baseUrl: "https://magmoveiscorporativos.com.br" },
  local: { id: "local", label: "Homologação local", hint: "PC da TI pelo cabo USB, dados fictícios", baseUrl: "http://127.0.0.1:3100" },
};
/** Variante do pacote: "hml" (br.com.magmoveiscorporativos.crm.hml) permite a homologação local; a definitiva, não. */
export const variante = (Constants.expoConfig?.extra as { variante?: string } | undefined)?.variante ?? "definitiva";
export const localServerAllowed = __DEV__ || variante === "hml";
export const availableServers = (): Server[] => (localServerAllowed ? [SERVERS.producao, SERVERS.local] : [SERVERS.producao]);

export const appVersion = Constants.expoConfig?.version ?? "0.0.0";
export const appName = Constants.expoConfig?.name ?? "MAG CRM";
