import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { AccountButton } from "@/components/account-button";
import { Avatar, Chip, ChipRow, CountBadge, EmptyState, ErrorState, Icon, Loading, Selector, TopBar } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { friendlyName, initials, listStamp } from "@/lib/format";
import { useInboxes, useScope, useWhatsappStatus } from "@/lib/queries";
import { font, radius, space, touch, useTheme } from "@/lib/theme";
import type { Contact, ContactsPage, Conversation, Inbox, InboxView, WhatsappStatus } from "@/lib/types";

const VIEWS: { value: InboxView; label: string }[] = [
  { value: "todas", label: "Todas" }, { value: "responder", label: "Responder" }, { value: "aguardando", label: "Aguardando" },
  { value: "retornos", label: "Retornos" }, { value: "proposta", label: "Proposta" },
];

/** Atendimento: conversas da carteira (ou da caixa escolhida pelo administrador), mais recentes primeiro. */
export default function Atendimento() {
  const t = useTheme();
  const call = useApi();
  const scope = useScope();
  const { has, me } = useAuth();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<InboxView>("todas");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const inboxes = useInboxes();
  const whatsapp = useWhatsappStatus();
  const [boxId, setBoxId] = useState<string | null>(null);

  useEffect(() => { if (params.view && VIEWS.some((v) => v.value === params.view)) setView(params.view as InboxView); }, [params.view]);
  useEffect(() => { const timer = setTimeout(() => setSearch(typed.trim()), 350); return () => clearTimeout(timer); }, [typed]);

  // Como no web: quem atende pela própria linha começa na própria caixa; supervisor sem linha, em todas.
  const boxes = inboxes.data?.canChoose ? inboxes.data.inboxes : [];
  const fallbackBox = whatsapp.data?.ownLine ? "minha" : "todas";
  const box: Inbox | undefined = boxes.find((b) => b.id === boxId) ?? boxes.find((b) => b.id === fallbackBox);
  const ownerId = box?.ownerId ?? null;
  const showOwner = boxes.length > 0 && box?.id === "todas";

  const query = useMemo(() => {
    const parts = ["limit=30"];
    if (search) parts.push(`search=${encodeURIComponent(search)}`);
    if (has("conversations.views") && view !== "todas") parts.push(`view=${view}`);
    if (has("conversations.inboxes") && ownerId) parts.push(`ownerId=${ownerId}`);
    return parts.join("&");
  }, [search, view, ownerId, has]);

  const list = useInfiniteQuery({
    queryKey: ["conversas", ...scope, query],
    queryFn: ({ pageParam }) => call<ContactsPage>(`contacts?${query}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "" as string,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
  });
  const rows = useMemo(() => {
    const items: { contact: Contact; conversation?: Conversation }[] = [];
    for (const page of list.data?.pages ?? []) {
      const byContact = new Map(page.conversations.map((c) => [c.contactId, c]));
      for (const contact of page.contacts) items.push({ contact, conversation: byContact.get(contact.id) });
    }
    return items;
  }, [list.data]);
  const counts = list.data?.pages[0]?.viewCounts;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar title="Atendimento" subtitle={lineSubtitle(whatsapp.data, boxes.length > 0)} right={<AccountButton />} />
      <View style={[styles.searchBox, { backgroundColor: t.surface, borderColor: t.line }]}>
        <Icon name="search" size={20} color={t.muted} />
        <TextInput value={typed} onChangeText={setTyped} placeholder="Buscar por nome, empresa ou telefone" placeholderTextColor={t.muted}
          style={{ flex: 1, color: t.ink, fontSize: font.body, minHeight: touch }} accessibilityLabel="Buscar conversas" returnKeyType="search" />
        {typed ? <Pressable onPress={() => setTyped("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Limpar busca"><Icon name="close" size={20} color={t.muted} /></Pressable> : null}
      </View>
      {boxes.length ? (
        <Selector title="Caixa de entrada" icon="inbox" value={box?.id ?? fallbackBox} onChange={setBoxId}
          options={boxes.map((b) => ({ value: b.id, label: friendlyName(b.label), hint: b.hint }))} />
      ) : null}
      {has("conversations.views") ? (
        <ChipRow>
          {VIEWS.map((v) => <Chip key={v.value} label={v.label} selected={v.value === view} count={!search && counts ? counts[v.value] : undefined} onPress={() => setView(v.value)} />)}
        </ChipRow>
      ) : null}
      {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={friendlyError(list.error)} onRetry={() => list.refetch()} /> : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.contact.id}
          renderItem={({ item }) => <ConversationRow contact={item.contact} conversation={item.conversation} meId={me?.user.id} showOwner={showOwner} />}
          onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); }}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => { void list.refetch(); }} colors={[t.accent]} />}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginLeft: 76 }} />}
          ListEmptyComponent={<EmptyState icon="forum" title={search ? "Nada encontrado" : "Nenhuma conversa aqui"} text={search ? "Confira a grafia ou busque pelo telefone." : "As conversas da sua carteira aparecem aqui."} />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading label="Carregando mais…" /> : undefined}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: space.xl }}
        />
      )}
    </View>
  );
}

/** Subtítulo do topo: a linha de WhatsApp de quem usa, só quando a linha é dela (a caixa escolhida já aparece no seletor). */
function lineSubtitle(whatsapp: WhatsappStatus | undefined, hasSelector: boolean) {
  if (!whatsapp?.phoneHint || !whatsapp.ownLine) return hasSelector ? "Supervisão das caixas" : "Sua carteira";
  return `Sua linha ${whatsapp.phoneHint} · ${whatsapp.connected ? "conectada" : "desconectada"}`;
}

function ConversationRow({ contact, conversation, meId, showOwner }: { contact: Contact; conversation?: Conversation; meId?: string; showOwner: boolean }) {
  const t = useTheme();
  const last = conversation?.messages[0];
  const unread = conversation?.unread ?? 0;
  const preview = last ? `${last.from === "vendedora" ? "Você: " : ""}${last.text}` : contact.company || "Sem mensagens ainda";
  return (
    <Pressable onPress={() => router.push({ pathname: "/conversa/[id]", params: { id: contact.id, name: contact.name } })}
      android_ripple={{ color: t.line }} accessibilityRole="button"
      accessibilityLabel={`${contact.name}${unread ? `, ${unread} não lidas` : ""}`}
      style={[styles.row, { backgroundColor: t.bg }]}>
      <Avatar label={initials(contact.name)} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={styles.rowTop}>
          <Text style={{ flex: 1, color: t.ink, fontSize: font.body, fontWeight: unread ? "800" : "600" }} numberOfLines={1}>{contact.name}</Text>
          <Text style={{ color: unread ? t.accent : t.muted, fontSize: 12, fontWeight: unread ? "700" : "400" }}>{listStamp(last?.at ?? contact.updatedAt)}</Text>
        </View>
        <View style={styles.rowTop}>
          <Text style={{ flex: 1, color: unread ? t.ink : t.muted, fontSize: font.small }} numberOfLines={1}>{preview}</Text>
          <CountBadge value={unread} />
        </View>
        {showOwner && contact.ownerId !== meId ? <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={1}>Carteira: {friendlyName(contact.ownerName)}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginTop: space.md, paddingHorizontal: space.md, borderWidth: 1, borderRadius: radius.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 72 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
