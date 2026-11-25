import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/**
 * Chave de envio (clientMessageId) que SOBREVIVE ao app fechar. O servidor do CRM não reenvia uma mensagem com a
 * mesma chave; aqui a chave fica guardada junto com a IMPRESSÃO (SHA-256) do contato + texto, nunca o texto.
 * Se a pessoa reenviar o mesmo texto depois de uma falha — mesmo com o app reaberto —, a mesma chave é usada e a
 * mensagem não sai duas vezes. Texto diferente gera chave nova. A chave é apagada quando o servidor confirma.
 */
const PREFIX = "mag.envio.";
const MAX_AGE = 24 * 3600 * 1000;
interface Pending { key: string; fingerprint: string; at: number }

const storageKey = (contactId: string) => `${PREFIX}${contactId.replace(/[^A-Za-z0-9._-]/g, "")}`;
async function fingerprintOf(contactId: string, text: string, attachmentId?: string) {
  // Com anexo, a impressão inclui o anexo já preparado no servidor: repetir o MESMO envio usa a mesma chave.
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${contactId}\n${text.trim()}${attachmentId ? `\n${attachmentId}` : ""}`);
}
/** A chave para este texto (e anexo): a mesma da tentativa anterior se forem iguais; senão, uma nova. */
export async function keyForSend(contactId: string, text: string, attachmentId?: string): Promise<string> {
  const fingerprint = await fingerprintOf(contactId, text, attachmentId);
  try {
    const raw = await SecureStore.getItemAsync(storageKey(contactId));
    if (raw) {
      const pending = JSON.parse(raw) as Pending;
      if (pending.fingerprint === fingerprint && Date.now() - pending.at < MAX_AGE) return pending.key;
    }
  } catch {
    // Sem armazenamento, vale a proteção do servidor dentro desta tela.
  }
  const key = Crypto.randomUUID();
  try {
    await SecureStore.setItemAsync(storageKey(contactId), JSON.stringify({ key, fingerprint, at: Date.now() } satisfies Pending));
  } catch {
    // Idem.
  }
  return key;
}
export async function clearSend(contactId: string, key: string) {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(contactId));
    if (raw && (JSON.parse(raw) as Pending).key === key) await SecureStore.deleteItemAsync(storageKey(contactId));
  } catch {
    // Sem efeito: a chave expira em 24 h.
  }
}
