import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageAttachment } from "@/components/attachments";
import { Composer, type PendingFile } from "@/components/composer";
import { BottomSheet } from "@/components/sheet";
import { Button, ErrorState, Icon, Loading, Notice, Pill, s } from "@/components/ui";
import { ApiError, friendlyError } from "@/lib/api";
import { useApi, useAuth, useUpload } from "@/lib/auth";
import { dayHeading, money, parseDate, phoneLabel, time } from "@/lib/format";
import { logWarn } from "@/lib/log";
import { clearSend, keyForSend } from "@/lib/pending-send";
import { noticeForSendError, type SendNotice } from "@/lib/send-notice";
import { useQuickReplies, useScope, useWhatsappStatus } from "@/lib/queries";
import { font, radius, space, useTheme } from "@/lib/theme";
import type { Attachment, Binding, ContactDetail, Message, MessagesPage, ProposalItem, SendResponse, StagedAttachment } from "@/lib/types";

type Item = { kind: "msg"; message: Message } | { kind: "dia"; key: string; label: string } | { kind: "enviando"; text: string };

export default function Conversa() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const call = useApi();
  const send = useUpload();
  const scope = useScope();
  const queryClient = useQueryClient();
  const { has, me } = useAuth();
  // quoteId/version: vindo da ficha do negócio ("Enviar na conversa"), a proposta já chega anexada para revisar e enviar.
  const { id, name, quoteId, version } = useLocalSearchParams<{ id: string; name?: string; quoteId?: string; version?: string }>();
  const detail = useQuery({ queryKey: ["contato", ...scope, id], queryFn: () => call<ContactDetail>(`contacts/${id}`) });
  const whatsapp = useWhatsappStatus();
  const replies = useQuickReplies();
  const binding = useQuery({ queryKey: ["vinculo", ...scope, id], queryFn: () => call<Binding>(`contacts/${id}/binding`), enabled: has("conversations.bind") });
  const proposals = useQuery({ queryKey: ["propostas", ...scope], queryFn: () => call<{ proposals: ProposalItem[] }>("proposals?limit=200"), enabled: has("proposals.share") });
  const messages = useInfiniteQuery({
    queryKey: ["mensagens", ...scope, id],
    queryFn: ({ pageParam }) => call<MessagesPage>(`contacts/${id}/messages?limit=40${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "" as string,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    refetchInterval: 20_000,
  });
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState<SendNotice | null>(null);
  const [dealsOpen, setDealsOpen] = useState(false);
  const markedRead = useRef(false);

  // Abrir a conversa marca como lida (como no web), uma vez por abertura.
  useEffect(() => {
    if (markedRead.current || !has("conversations.read") || !detail.data || !detail.data.conversation.unread) return;
    markedRead.current = true;
    call(`contacts/${id}/read`, { method: "POST", body: {} })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["conversas"] });
        void queryClient.invalidateQueries({ queryKey: ["resumo-atendimento"] });
      })
      .catch(() => logWarn("conversa", "marcar como lida falhou"));
  }, [detail.data, has, call, id, queryClient]);

  const items = useMemo<Item[]>(() => {
    // A API devolve cada página da mais antiga para a mais nova; a lista invertida precisa da mais nova primeiro.
    const newestFirst = (messages.data?.pages ?? []).flatMap((page) => [...page.messages].reverse());
    const out: Item[] = sending ? [{ kind: "enviando", text: sending }] : [];
    newestFirst.forEach((message, index) => {
      out.push({ kind: "msg", message });
      const next = newestFirst[index + 1];
      const day = dayHeading(message.at);
      if (!next || dayHeading(next.at) !== day) out.push({ kind: "dia", key: `dia-${message.id}`, label: day });
    });
    return out;
  }, [messages.data, sending]);

  const contact = detail.data?.contact;
  const isOwn = Boolean(contact && me && contact.ownerId === me.user.id);
  const blocked = !has("messages.send")
    ? "Responder pelo aplicativo fica disponível quando o CRM receber a atualização autorizada."
    : !contact ? null
    : !isOwn ? "Supervisão: só o responsável por esta carteira responde pela linha dele."
    : whatsapp.data && !whatsapp.data.canReply ? whatsapp.data.message || "Sua linha de WhatsApp não está pronta para enviar."
    : null;
  const openDeals = (detail.data?.opportunities ?? []).filter((o) => o.stage !== "fechado" && o.stage !== "perdido");
  const boundId = binding.data?.opportunityId ?? null;
  const boundDeal = (detail.data?.opportunities ?? []).find((o) => o.id === boundId) ?? (openDeals.length === 1 ? openDeals[0] : undefined);
  const clientProposals = (proposals.data?.proposals ?? []).filter((p) => p.contactId === id && p.version && p.status !== "Cancelada");

  async function attachProposal(proposal: Pick<ProposalItem, "quoteId" | "version" | "number">) {
    setNotice(null);
    setSending("Preparando o PDF da proposta…");
    try {
      const { attachment } = await call<{ attachment: StagedAttachment }>(`quotes/${proposal.quoteId}/proposals/${proposal.version}/attach`, { method: "POST", body: { contactId: id }, timeoutMs: 60_000 });
      setPending({ kind: "document", name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, staged: attachment,
        label: proposal.number ? `Proposta ${proposal.number} v${proposal.version}` : `Proposta v${proposal.version}` });
      setDraft((current) => current.trim() ? current : "Segue a proposta. Qualquer dúvida, estou à disposição.");
    } catch (error) {
      setNotice({ tone: "bad", icon: "error", title: "A proposta não foi preparada", text: friendlyError(error) });
    } finally {
      setSending(null);
    }
  }
  // Chegou da ficha do negócio com uma proposta: prepara o anexo uma vez (nada é enviado sem tocar em enviar).
  const autoAttached = useRef(false);
  useEffect(() => {
    if (autoAttached.current || !quoteId || !version || !has("proposals.share") || !contact || !isOwn || blocked) return;
    autoAttached.current = true;
    const known = (proposals.data?.proposals ?? []).find((p) => p.quoteId === quoteId);
    void attachProposal({ quoteId, version: Number(version), number: known?.number ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, version, contact, isOwn, blocked]);

  async function sendNow() {
    const text = pending?.kind === "audio" ? "" : draft.trim();
    if ((!text && !pending) || sending || blocked) return;
    setNotice(null);
    let file = pending;
    setSending(file ? (file.kind === "image" ? "Enviando foto…" : file.kind === "audio" ? "Enviando áudio…" : "Enviando arquivo…") : text);
    try {
      // 1) O arquivo vai primeiro para o servidor (uma vez só: a repetição reaproveita o mesmo anexo preparado).
      if (file && !file.staged) {
        if (!file.local) throw new ApiError(400, "invalid_media");
        const { attachment } = await send<{ attachment: StagedAttachment }>(`contacts/${id}/attachments`, file.local);
        file = { ...file, staged: attachment };
        setPending(file);
      }
      // 2) A mensagem usa a chave guardada: repetir o MESMO envio nunca sai duas vezes.
      const key = await keyForSend(id, text, file?.staged?.id);
      // O servidor pode levar até ~45 s com anexo (estado da linha + número + envio): esperar mais evita "sem resposta" falso.
      await call<SendResponse>(`contacts/${id}/messages`, { method: "POST", timeoutMs: file ? 90_000 : 60_000,
        body: { ...(text ? { text } : {}), ...(file?.staged ? { attachmentIds: [file.staged.id] } : {}), clientMessageId: key } });
      await clearSend(id, key);
      setDraft("");
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ["mensagens", ...scope, id] });
      void queryClient.invalidateQueries({ queryKey: ["conversas"] });
      if (file?.label) void queryClient.invalidateQueries({ queryKey: ["propostas"] });
    } catch (error) {
      // Texto e anexo ficam como estão (e a chave fica guardada): repetir usa a mesma chave e não duplica.
      if (error instanceof ApiError && error.code === "business_rule" && /já pertence a uma mensagem/.test(error.serverMessage ?? "")) {
        setPending(null);
        setNotice({ tone: "bad", icon: "block", title: "Este anexo já foi usado", text: "Confira a conversa: se ele não chegou, anexe o arquivo de novo para enviar como uma mensagem nova." });
      } else if (file && !file.staged) {
        setNotice({ tone: error instanceof ApiError && (error.code === "network" || error.code === "timeout") ? "warn" : "bad", icon: "upload_file",
          title: "O arquivo não foi enviado", text: `${friendlyError(error)} Nada saiu para o cliente.` });
      } else {
        setNotice(noticeForSendError(error));
      }
      if (error instanceof ApiError && error.code === "send_in_progress") void messages.refetch();
    } finally {
      setSending(null);
    }
  }

  async function bind(opportunityId: string) {
    try {
      await call(`contacts/${id}/opportunity`, { method: "POST", body: { opportunityId } });
      await binding.refetch();
    } catch (error) {
      setNotice({ tone: "bad", icon: "error", title: "Vínculo não feito", text: friendlyError(error) });
    }
  }

  const title = contact?.name || name || "Conversa";
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={insets.top + 56}>
      <Stack.Screen options={{
        title,
        headerTitle: () => (
          <Pressable onPress={() => contact && router.push({ pathname: "/cliente/[id]", params: { id: contact.id } })} accessibilityRole="button" accessibilityLabel={`${title}. Abrir o cliente`}>
            <Text style={{ color: t.ink, fontSize: font.title, fontWeight: "700" }} numberOfLines={1}>{title}</Text>
            {contact ? <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={1}>{[contact.company, phoneLabel(contact.phone)].filter(Boolean).join(" · ")}</Text> : null}
          </Pressable>
        ),
        headerRight: () => has("opportunities.detail") && contact ? (
          <Pressable onPress={() => setDealsOpen(true)} accessibilityRole="button" accessibilityLabel="Negócios deste cliente" hitSlop={8} style={{ padding: space.sm }}>
            <Icon name="work" size={24} color={t.accent} />
          </Pressable>
        ) : null,
      }} />
      {boundDeal && has("opportunities.detail") ? (
        <Pressable onPress={() => router.push({ pathname: "/negocio/[id]", params: { id: boundDeal.id } })} accessibilityRole="button"
          accessibilityLabel={`Negócio da conversa: ${boundDeal.title}. Abrir`} style={[styles.dealBar, { backgroundColor: t.surface, borderBottomColor: t.line }]}>
          <Icon name="work" size={18} color={t.muted} />
          <Text style={{ flex: 1, color: t.ink, fontSize: font.small, fontWeight: "600" }} numberOfLines={1}>{boundDeal.title}</Text>
          {boundDeal.estimatedValueCents ? <Text style={{ color: t.muted, fontSize: font.small }}>{money(boundDeal.estimatedValueCents)}</Text> : null}
          <Icon name="chevron_right" size={20} color={t.muted} />
        </Pressable>
      ) : null}
      {messages.isLoading ? <Loading /> : messages.isError && !messages.data ? <ErrorState message={friendlyError(messages.error)} onRetry={() => messages.refetch()} /> : (
        <>
          {/* Sem rede depois de carregar: as mensagens continuam na tela, só aparece o aviso. */}
          {messages.isError ? <View style={{ paddingHorizontal: space.md, paddingTop: space.sm }}><Notice tone="warn" icon="wifi_off" text="Sem conexão com o servidor agora. Mostrando as mensagens já carregadas." /></View> : null}
          <FlatList
            inverted
            data={items}
            keyExtractor={(item) => (item.kind === "msg" ? item.message.id : item.kind === "dia" ? item.key : "enviando")}
            renderItem={({ item }) => item.kind === "dia" ? <DayMark label={item.label} />
              : item.kind === "enviando" ? <Bubble out text={item.text} meta="enviando…" icon="schedule" />
              : <MessageBubble message={item.message} />}
            onEndReached={() => { if (messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage(); }}
            onEndReachedThreshold={0.3}
            contentContainerStyle={{ padding: space.md, gap: space.xs }}
            ListFooterComponent={messages.isFetchingNextPage ? <Loading label="Mensagens anteriores…" /> : undefined}
            ListEmptyComponent={<Text style={{ color: t.muted, textAlign: "center", padding: space.xl }}>Nenhuma mensagem ainda.</Text>}
          />
        </>
      )}
      {notice ? <View style={{ paddingHorizontal: space.md, paddingBottom: space.xs }}><Notice tone={notice.tone} title={notice.title} icon={notice.icon} text={notice.text} /></View> : null}
      {blocked ? (
        <View style={[styles.blocked, { borderTopColor: t.line, backgroundColor: t.surface, paddingBottom: insets.bottom + space.md }]}>
          <Icon name="lock" size={18} color={t.muted} />
          <Text style={{ flex: 1, color: t.muted, fontSize: font.small }}>{blocked}</Text>
        </View>
      ) : (
        <Composer draft={draft} onDraft={setDraft} pending={pending} onPending={(value) => { setPending(value); setNotice(null); }} onSend={() => void sendNow()}
          sending={Boolean(sending)} bottomInset={insets.bottom} canAttach={has("messages.attachments")} canAudio={has("messages.audio")}
          quickReplies={has("messages.quickReplies") ? replies.data?.replies ?? [] : []} proposals={clientProposals}
          onPickProposal={(p) => void attachProposal(p)} onNotice={(title, text) => setNotice({ tone: "neutral", icon: "info", title, text })} />
      )}
      <BottomSheet visible={dealsOpen} onClose={() => setDealsOpen(false)} title="Negócios deste cliente"
        subtitle={binding.data?.canBind && openDeals.length > 1 ? "Escolha qual negócio recebe esta conversa." : undefined}
        footer={has("opportunities.write") && contact && isOwn ? <Button label="Novo negócio para este cliente" icon="add" kind="secondary"
          onPress={() => { setDealsOpen(false); router.push({ pathname: "/negocio/novo", params: { contactId: contact.id } }); }} /> : undefined}>
        {(detail.data?.opportunities ?? []).map((o) => {
          const bound = o.id === boundId;
          const open = o.stage !== "fechado" && o.stage !== "perdido";
          return (
            <View key={o.id} style={[s.sheetRow, { alignItems: "flex-start" }]}>
              <Pressable style={{ flex: 1, gap: 4 }} onPress={() => { setDealsOpen(false); router.push({ pathname: "/negocio/[id]", params: { id: o.id } }); }} accessibilityRole="button">
                <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "700" }}>{o.title}</Text>
                <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                  {bound ? <Pill label="Recebe esta conversa" tone="accent" /> : null}
                  {!open ? <Pill label={o.stage === "fechado" ? "Fechado" : "Não fechou"} tone={o.stage === "fechado" ? "ok" : "bad"} /> : null}
                  {o.estimatedValueCents ? <Pill label={money(o.estimatedValueCents)} /> : null}
                </View>
              </Pressable>
              {open && !bound && binding.data?.canBind && isOwn ? (
                <Pressable onPress={() => void bind(o.id)} accessibilityRole="button" accessibilityLabel={`Vincular a conversa a ${o.title}`}
                  style={[styles.bindButton, { borderColor: t.accent }]}>
                  <Text style={{ color: t.accent, fontWeight: "700", fontSize: font.small }}>Vincular</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {!detail.data?.opportunities.length ? <Text style={{ color: t.muted, padding: space.lg }}>Nenhum negócio para este cliente ainda.</Text> : null}
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

const statusIcon = (status: string) => {
  switch (status) {
    case "read": return { icon: "done_all" as const, tone: "read" as const, label: "lida" };
    case "delivered": return { icon: "done_all" as const, tone: "muted" as const, label: "entregue" };
    case "sent": case "server": return { icon: "check" as const, tone: "muted" as const, label: "enviada" };
    case "uncertain": return { icon: "warning" as const, tone: "warn" as const, label: "envio não confirmado" };
    case "failed": case "error": return { icon: "error" as const, tone: "bad" as const, label: "falhou" };
    default: return { icon: "schedule" as const, tone: "muted" as const, label: "pendente" };
  }
};

/** Textos que o servidor grava no lugar do conteúdo quando a mensagem é só o anexo. */
const PLACEHOLDER = /^\[(Imagem|Áudio|Documento)\]$/;
function MessageBubble({ message }: { message: Message }) {
  const at = parseDate(message.at);
  const out = message.from === "vendedora";
  const st = statusIcon(message.status);
  const text = message.attachments?.length && PLACEHOLDER.test(message.text.trim()) ? "" : message.text;
  return <Bubble out={out} text={text} meta={`${at ? time(at) : ""}${out && st.tone !== "muted" && st.tone !== "read" ? ` · ${st.label}` : ""}`}
    icon={out ? st.icon : undefined} iconTone={st.tone} attachments={message.attachments} statusLabel={out ? st.label : undefined} />;
}

function Bubble({ out, text, meta, icon, iconTone = "muted", attachments, statusLabel }: {
  out: boolean; text: string; meta: string; icon?: "done_all" | "check" | "warning" | "error" | "schedule"; iconTone?: "read" | "muted" | "warn" | "bad";
  attachments?: Attachment[]; statusLabel?: string;
}) {
  const t = useTheme();
  const iconColor = { read: t.read, muted: t.muted, warn: t.warn, bad: t.bad }[iconTone];
  const files = attachments?.map((a) => a.name).join(", ");
  return (
    <View style={[styles.bubble, out ? styles.out : styles.in, { backgroundColor: out ? t.bubbleOut : t.bubbleIn, borderColor: t.line }]}
      accessible={!attachments?.length} accessibilityLabel={`${out ? "Você" : "Cliente"}: ${text}${files ? ` (anexo: ${files})` : ""}. ${meta}${statusLabel ? `, ${statusLabel}` : ""}`}>
      {attachments?.map((file) => <MessageAttachment key={file.id} file={file} />)}
      {text ? <Text style={{ color: t.ink, fontSize: font.body, lineHeight: 21 }} selectable>{text}</Text> : null}
      <View style={styles.meta}>
        <Text style={{ color: t.muted, fontSize: 11 }}>{meta}</Text>
        {icon ? <Icon name={icon} size={15} color={iconColor} /> : null}
      </View>
    </View>
  );
}

function DayMark({ label }: { label: string }) {
  const t = useTheme();
  return <View style={styles.day}><Text style={[styles.dayText, { backgroundColor: t.surfaceAlt, color: t.muted }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "84%", borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 6, marginVertical: 2 },
  out: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  in: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  day: { alignItems: "center", marginVertical: space.sm },
  dayText: { fontSize: 12, fontWeight: "600", paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, overflow: "hidden" },
  blocked: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  dealBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 44 },
  bindButton: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, alignSelf: "center" },
});
