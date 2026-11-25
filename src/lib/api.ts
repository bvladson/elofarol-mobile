import { File as ExpoFile } from "expo-file-system";
import { apiPathForLog, logError, logWarn } from "./log";

/** Erro da API com o código estável do servidor (nunca o corpo inteiro). */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly serverMessage?: string, readonly extra: Record<string, unknown> = {}) {
    super(serverMessage || code);
    this.name = "ApiError";
  }
}
export interface RequestOptions {
  baseUrl: string;
  token?: string | null;
  method?: "GET" | "POST" | "PATCH" | "PUT";
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
}
let onUnauthorized: (() => void) | null = null;
/** O provedor de sessão registra o que fazer quando o servidor recusa o acesso (token revogado ou vencido). */
export function setUnauthorizedHandler(handler: (() => void) | null) { onUnauthorized = handler; }

export async function api<T>(path: string, options: RequestOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  let response: Response;
  try {
    response = await fetch(`${options.baseUrl}/api/crm/v1/${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = controller.signal.aborted;
    logWarn(`api ${options.method ?? "GET"} ${apiPathForLog(path)}`, aborted ? "tempo esgotado" : "sem conexão");
    throw new ApiError(0, aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
  let payload: Record<string, unknown> = {};
  try { payload = (await response.json()) as Record<string, unknown>; } catch { payload = {}; }
  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : `http_${response.status}`;
    const message = typeof payload.message === "string" ? payload.message : undefined;
    // Só o código e o status: a mensagem do servidor pode citar dados do cliente.
    (response.status >= 500 ? logError : logWarn)(`api ${options.method ?? "GET"} ${apiPathForLog(path)}`, `${response.status} ${code}`);
    if (response.status === 401 && code === "invalid_token" && options.token) onUnauthorized?.();
    const { error: _e, message: _m, ...extra } = payload;
    throw new ApiError(response.status, code, message, extra);
  }
  return payload as T;
}

/** Endereço completo de um caminho da API v1 (anexos, PDFs): o token vai SEMPRE no cabeçalho, nunca na URL. */
export const apiUrl = (baseUrl: string, path: string) => {
  // Aceita "attachments/:id" ou o downloadUrl do servidor ("/api/crm/v1/attachments/:id").
  const prefix = "/api/crm/v1/";
  const clean = path.startsWith(prefix) ? path.slice(prefix.length) : path.startsWith("/") ? path.slice(1) : path;
  return `${baseUrl}${prefix}${clean}`;
};
export const authHeaders = (token: string | null | undefined): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

/** Arquivo local (câmera, galeria, documento, gravação) para enviar ao servidor. */
export interface LocalFile { uri: string; name: string; type: string; size?: number | null }
/**
 * Envio de arquivo (multipart, campo "file"). Mesmo tratamento de erro do api(): só o código e o status vão para o
 * registro. Tempo maior: 7 MB pela rede do celular podem levar mais de um minuto.
 */
export async function upload<T>(path: string, file: LocalFile, options: { baseUrl: string; token?: string | null; timeoutMs?: number }): Promise<T> {
  // O fetch global do Expo 58 (expo/fetch) NÃO aceita o formato antigo do React Native ({ uri, name, type }) no
  // FormData: ele aceita texto, Blob ou um objeto com bytes(). O arquivo local é lido aqui (até 7 MB) e vai com o NOME
  // original (é o nome que o cliente vê no WhatsApp) e o TIPO escolhido no app (o servidor confere com o conteúdo).
  let content: Uint8Array;
  try {
    content = new Uint8Array(await new ExpoFile(file.uri).arrayBuffer());
  } catch (error) {
    logWarn(`api POST ${apiPathForLog(path)}`, `arquivo local ilegível (${error instanceof Error ? error.name : "erro"})`);
    throw new ApiError(0, "local_file");
  }
  const part = { name: file.name, type: file.type || "application/octet-stream", size: content.byteLength, bytes: async () => content };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
  const form = new FormData();
  form.append("file", part as unknown as Blob);
  let response: Response;
  try {
    response = await fetch(apiUrl(options.baseUrl, path), { method: "POST", headers: { Accept: "application/json", ...authHeaders(options.token) }, body: form, signal: controller.signal });
  } catch (error) {
    const aborted = controller.signal.aborted;
    // O tipo do erro vai para o registro (sem conteúdo): distingue falha de rede de falha ao montar o envio.
    logWarn(`api POST ${apiPathForLog(path)}`, aborted ? "tempo esgotado (arquivo)" : `sem conexão (arquivo; ${error instanceof Error ? error.name : "erro"})`);
    throw new ApiError(0, aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
  let payload: Record<string, unknown> = {};
  try { payload = (await response.json()) as Record<string, unknown>; } catch { payload = {}; }
  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : `http_${response.status}`;
    (response.status >= 500 ? logError : logWarn)(`api POST ${apiPathForLog(path)}`, `${response.status} ${code}`);
    if (response.status === 401 && code === "invalid_token" && options.token) onUnauthorized?.();
    throw new ApiError(response.status, code, typeof payload.message === "string" ? payload.message : undefined);
  }
  return payload as T;
}

/** Mensagem curta em português para o usuário, a partir do código da API. */
export function friendlyError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Algo deu errado. Tente de novo.";
  switch (error.code) {
    case "network": return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    case "timeout": return "O servidor demorou para responder. Tente de novo.";
    case "invalid_token": return "Seu acesso expirou ou foi revogado. Entre de novo.";
    case "invalid_credentials": return "E-mail ou senha incorretos.";
    case "rate_limited": return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    case "forbidden": return "Seu perfil não tem acesso a este item.";
    case "not_found": return "Não encontrado.";
    case "conflict": return "O registro mudou. Atualize e tente de novo.";
    case "unavailable": return "O servidor não conseguiu concluir agora. Tente de novo em instantes.";
    case "body_too_large": return "Arquivo grande demais. O limite é 7 MB por arquivo.";
    case "invalid_request": return "O servidor recusou o pedido. Atualize a tela e tente de novo.";
    case "invalid_media": return "Arquivo inválido. Use foto, áudio, PDF ou documento de escritório.";
    case "local_file": return "Não foi possível ler o arquivo no aparelho. Escolha o arquivo de novo.";
    default: return error.serverMessage || "Não foi possível concluir. Tente de novo.";
  }
}
