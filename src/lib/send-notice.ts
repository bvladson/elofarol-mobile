import type { ComponentProps } from "react";
import type { Icon, NoticeTone } from "@/components/ui";
import { ApiError, friendlyError } from "./api";

export type SendNotice = { tone: NoticeTone; title: string; icon: ComponentProps<typeof Icon>["name"]; text: string };

/**
 * Cada resultado de envio tem cor, ícone e título próprios, para a vendedora não confundir:
 * - NADA FOI ENVIADO (cinza; linha fora do ar, número não confirmado): repetir é seguro;
 * - SEM RESPOSTA (âmbar; rede ou tempo): não se sabe se saiu, mas repetir o MESMO texto não duplica (mesma chave);
 * - ENVIO NÃO CONFIRMADO (vermelho; send_uncertain): pode ter chegado; o CRM nunca reenvia e recusa repetir o texto;
 * - JÁ FEITO OU SEM CONFIRMAÇÃO (vermelho; send_in_progress): a repetição foi recusada e nada saiu de novo.
 * Nenhum desses casos reenvia sozinho: o app só envia quando a pessoa toca em enviar.
 */
export function noticeForSendError(error: unknown): SendNotice {
  const code = error instanceof ApiError ? error.code : "";
  if (code === "send_uncertain") return { tone: "bad", icon: "report", title: "Envio não confirmado pelo WhatsApp",
    text: "A mensagem pode ter chegado ao cliente. Confira no celular antes de qualquer coisa. O CRM não reenvia sozinho, e repetir este mesmo texto será recusado." };
  if (code === "send_in_progress") return { tone: "bad", icon: "block", title: "Este envio já foi feito ou ficou sem confirmação",
    text: "Nada foi enviado de novo. Confira a conversa no celular; se a mensagem não chegou, escreva o texto de outro jeito para enviar como uma mensagem nova." };
  if (code === "network" || code === "timeout") return { tone: "warn", icon: "wifi_off", title: "Sem resposta do servidor",
    text: "Não dá para saber se a mensagem saiu. Quando a conexão voltar, toque em enviar de novo: com o mesmo texto, ela não sai duas vezes." };
  if (code === "not_sent" || code === "line_unavailable") {
    const raw = (error as ApiError).serverMessage?.trim() || "";
    const reason = !raw ? (code === "line_unavailable" ? "A linha de WhatsApp não está pronta para enviar agora." : "O servidor não conseguiu concluir agora.")
      : /^nada foi enviado/i.test(raw) ? "O servidor não conseguiu concluir agora."
      : raw.replace(/\s*Nada foi enviado[.;]?\s*(tente novamente\.?)?\s*$/i, "").replace(/\bWAHA\b/g, "WhatsApp").trim();
    return { tone: "neutral", icon: "info", title: "Nada foi enviado", text: `${reason} O texto continua no campo; pode tentar de novo com segurança.` };
  }
  return { tone: "bad", icon: "error", title: "Não foi possível enviar", text: friendlyError(error) };
}
