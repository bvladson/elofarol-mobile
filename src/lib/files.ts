import { Directory, File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { apiUrl, authHeaders } from "./api";
import { logWarn } from "./log";

/**
 * Arquivos do CRM no aparelho (anexos recebidos, PDF de proposta): baixados para o CACHE do app (o Android apaga
 * quando precisa de espaço; nada vai para a galeria ou Downloads), com o token só no cabeçalho.
 */
const folder = () => {
  const dir = new Directory(Paths.cache, "mag-crm-arquivos");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};
// Só letras, números, espaço, ponto, hífen e sublinhado no nome do arquivo local (o nome original fica no servidor).
const safeName = (name: string) => name.normalize("NFD").replace(/[^A-Za-z0-9 ._-]/g, "_").slice(0, 120) || "arquivo";

/** Baixa um caminho da API (ex.: attachments/:id, quotes/:id/proposals/1/pdf) para um arquivo local e devolve o endereço. */
export async function downloadToCache(baseUrl: string, token: string | null, path: string, name: string): Promise<string> {
  const target = new File(folder(), `${Date.now()}-${safeName(name)}`);
  const file = await File.downloadFileAsync(apiUrl(baseUrl, path), target, { headers: authHeaders(token) });
  return file.uri;
}

/** Abre no aplicativo do aparelho que lê o tipo (visualizador de PDF, galeria, planilha). Sem nenhum, oferece compartilhar. */
export async function openLocalFile(uri: string, mimeType: string) {
  try {
    const contentUri = await getContentUriAsync(uri);
    // 1 = FLAG_GRANT_READ_URI_PERMISSION: o leitor recebe acesso só a este arquivo.
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", { data: contentUri, type: mimeType, flags: 1 });
  } catch {
    logWarn("arquivo", "nenhum aplicativo abriu o arquivo; oferecendo compartilhar");
    await shareLocalFile(uri, mimeType);
  }
}

export async function shareLocalFile(uri: string, mimeType: string, dialogTitle = "Compartilhar") {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Compartilhar não está disponível neste aparelho.");
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
}

export const fileSizeLabel = (bytes: number | null | undefined) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
};
