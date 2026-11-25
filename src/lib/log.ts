/**
 * Registro de erros SANITIZADO. Nunca guarda nem imprime: token, senha, código de verificação, e-mail, telefone,
 * texto de mensagem de cliente ou corpo de resposta da API. Guarda só o contexto (tela/ação), o código do erro, o
 * status HTTP e o caminho da API com os identificadores trocados por ":id". Fica na memória do aparelho (últimos 50) e
 * vai para o logcat só já limpo.
 */
export interface LogEntry { at: string; level: "erro" | "aviso" | "info"; context: string; detail: string }
const entries: LogEntry[] = [];
const MAX = 50;

const PATTERNS: [RegExp, string][] = [
  [/mag_app_[A-Za-z0-9_-]+/g, "[token]"],
  [/Bearer\s+\S+/gi, "Bearer [token]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ":id"],
  [/\+?\d[\d\s().-]{7,}\d/g, "[número]"],
];
export function sanitize(value: unknown): string {
  let text = typeof value === "string" ? value : value instanceof Error ? `${value.name}: ${value.message}` : safeJson(value);
  for (const [pattern, replacement] of PATTERNS) text = text.replace(pattern, replacement);
  return text.slice(0, 300);
}
function safeJson(value: unknown) {
  try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
}
/** Caminho da API sem identificadores nem parâmetros (que podem conter a busca digitada). */
export function apiPathForLog(path: string) {
  return path.split("?")[0]!.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
}
function push(level: LogEntry["level"], context: string, detail: unknown) {
  const entry = { at: new Date().toISOString(), level, context: sanitize(context), detail: sanitize(detail) };
  entries.unshift(entry);
  if (entries.length > MAX) entries.length = MAX;
  const line = `[MAG CRM] ${entry.level} · ${entry.context} · ${entry.detail}`;
  if (level === "erro") console.warn(line); else if (__DEV__) console.log(line);
}
export const logError = (context: string, detail: unknown) => push("erro", context, detail);
export const logWarn = (context: string, detail: unknown) => push("aviso", context, detail);
export const logInfo = (context: string, detail: unknown) => push("info", context, detail);
export const logEntries = (): readonly LogEntry[] => entries;
export const clearLog = () => { entries.length = 0; };
