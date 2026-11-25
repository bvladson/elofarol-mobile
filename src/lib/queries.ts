import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { useApi, useAuth } from "./auth";
import * as Crypto from "expo-crypto";
import type { ContactsPage, InboxesResponse, QuickReply, WhatsappStatus } from "./types";

/** Chave das consultas sempre com servidor + pessoa: trocar de conta nunca mostra dados da anterior. */
export function useScope() {
  const { server, me } = useAuth();
  return [server.id, me?.user.id ?? "?"] as const;
}

/** Contagens do Atendimento (responder, aguardando, retornos, proposta) — também alimenta o selo da aba. */
export function useInboxSummary() {
  const call = useApi();
  const scope = useScope();
  return useQuery({
    queryKey: ["resumo-atendimento", ...scope],
    queryFn: () => call<ContactsPage>("contacts?limit=1"),
    refetchInterval: 60_000,
  });
}

export function useWhatsappStatus() {
  const call = useApi();
  const { has } = useAuth();
  const scope = useScope();
  return useQuery({
    queryKey: ["whatsapp", ...scope],
    queryFn: () => call<WhatsappStatus>("whatsapp"),
    enabled: has("whatsapp.status"),
    staleTime: 60_000,
  });
}

export function useInboxes() {
  const call = useApi();
  const { has } = useAuth();
  const scope = useScope();
  return useQuery({
    queryKey: ["caixas", ...scope],
    queryFn: () => call<InboxesResponse>("inboxes"),
    enabled: has("conversations.inboxes"),
    staleTime: 5 * 60_000,
  });
}

/** Respostas rápidas: as mesmas do Atendimento web (o servidor manda a lista; mudar lá muda aqui). */
export function useQuickReplies() {
  const call = useApi();
  const { has } = useAuth();
  const scope = useScope();
  return useQuery({
    queryKey: ["respostas", ...scope],
    queryFn: () => call<{ replies: QuickReply[] }>("quick-replies"),
    enabled: has("messages.quickReplies"),
    staleTime: 30 * 60_000,
  });
}

/** Chave única por toque (Idempotency-Key): repetir a MESMA ação depois de falha de rede não grava duas vezes. */
export const newKey = () => Crypto.randomUUID();

/**
 * Chave por CONTEÚDO: repetir o mesmo pedido (ex.: depois de "sem conexão") reaproveita a chave e o servidor devolve a
 * resposta já gravada, sem duplicar; mudar qualquer campo gera chave nova (o servidor recusa chave igual com outro conteúdo).
 */
export function useKeyFor() {
  const last = useRef<{ payload: string; key: string } | null>(null);
  return useCallback((payload: unknown) => {
    const json = JSON.stringify(payload);
    if (last.current?.payload !== json) last.current = { payload: json, key: newKey() };
    return last.current.key;
  }, []);
}
