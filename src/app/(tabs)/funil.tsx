import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { AccountButton } from "@/components/account-button";
import { Avatar, Chip, ChipRow, EmptyState, ErrorState, Fab, Loading, Pill, Selector, TopBar } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { dueLabel, friendlyName, initials, money } from "@/lib/format";
import { useScope } from "@/lib/queries";
import { font, radius, space, useTheme } from "@/lib/theme";
import type { Contact, ContactsPage, OpportunitiesPage, Opportunity } from "@/lib/types";

/** Meu funil: negócios por etapa do funil escolhido; cada card abre a ficha do negócio (mover, retorno, propostas). */
export default function Funil() {
  const t = useTheme();
  const call = useApi();
  const scope = useScope();
  const { me, has } = useAuth();
  const pipelines = me?.pipelines ?? [];
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines.find((p) => p.id === me?.defaultPipelineId) ?? pipelines[0];
  const stages = useMemo(() => [...(pipeline?.stages ?? [])].sort((a, b) => a.position - b.position), [pipeline]);
  const list = useQuery({
    queryKey: ["funil", ...scope, pipeline?.id],
    queryFn: () => call<OpportunitiesPage>(`opportunities?limit=100${pipeline ? `&pipelineId=${pipeline.id}` : ""}`),
    enabled: Boolean(pipeline),
  });
  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>();
    for (const o of list.data?.opportunities ?? []) map.set(o.stageId ?? "", [...(map.get(o.stageId ?? "") ?? []), o]);
    return map;
  }, [list.data]);
  const [stageId, setStageId] = useState<string | null>(null);
  useEffect(() => {
    if (stageId && stages.some((s) => s.id === stageId)) return;
    setStageId(stages.find((s) => (byStage.get(s.id)?.length ?? 0) > 0)?.id ?? stages[0]?.id ?? null);
  }, [stages, byStage, stageId]);
  const items = byStage.get(stageId ?? "") ?? [];
  // A lista de negócios não traz o nome do cliente: cruza com os contatos da mesma carteira (uma chamada só).
  const contacts = useQuery({ queryKey: ["nomes-contatos", ...scope], queryFn: () => call<ContactsPage>("contacts?limit=100"), staleTime: 60_000 });
  const names = useMemo(() => new Map((contacts.data?.contacts ?? []).map((c) => [c.id, c])), [contacts.data]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar title="Meu funil" subtitle={pipeline ? `${pipeline.name}${list.data ? ` · ${list.data.opportunities.length}${list.data.hasMore ? "+" : ""} negócios` : ""}` : undefined} right={<AccountButton />} />
      {pipelines.length > 1 ? (
        <Selector title="Funil" icon="view_kanban" value={pipeline?.id ?? ""} onChange={(id) => { setPipelineId(id); setStageId(null); }}
          options={pipelines.map((p) => ({ value: p.id, label: p.name, hint: `${p.stages.length} etapas` }))} />
      ) : null}
      <ChipRow>
        {stages.map((s) => <Chip key={s.id} label={s.label} dot={s.color || undefined} count={byStage.get(s.id)?.length ?? 0} selected={s.id === stageId} onPress={() => setStageId(s.id)} />)}
      </ChipRow>
      {!pipeline ? <EmptyState icon="view_kanban" title="Nenhum funil disponível" text="Peça ao administrador acesso a um funil." />
        : list.isLoading ? <Loading /> : list.isError ? <ErrorState message={friendlyError(list.error)} onRetry={() => list.refetch()} /> : (
        <FlatList
          data={items}
          keyExtractor={(o) => o.id}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => { void list.refetch(); }} colors={[t.accent]} />}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1, paddingBottom: 96 }}
          renderItem={({ item }) => <DealCard deal={item} contact={names.get(item.contactId)} meId={me?.user.id} openDetail={has("opportunities.detail")} />}
          ListEmptyComponent={<EmptyState icon="view_kanban" title="Nenhum negócio nesta etapa" />}
        />
      )}
      {has("opportunities.write") ? <Fab icon="add" label="Novo negócio" onPress={() => router.push("/negocio/novo")} /> : null}
    </View>
  );
}

function DealCard({ deal, contact, meId, openDetail }: { deal: Opportunity; contact?: Contact; meId?: string; openDetail: boolean }) {
  const t = useTheme();
  const title = contact?.name || deal.title;
  const detail = [contact ? deal.title : "", contact?.company ?? ""].filter(Boolean).join(" · ");
  return (
    <Pressable onPress={() => (openDetail ? router.push({ pathname: "/negocio/[id]", params: { id: deal.id } }) : router.push({ pathname: "/cliente/[id]", params: { id: deal.contactId } }))} accessibilityRole="button"
      accessibilityLabel={`${title}${detail ? `, ${detail}` : ""}`}
      style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }]} android_ripple={{ color: t.line }}>
      <View style={styles.cardTop}>
        <Avatar label={initials(title)} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "700" }} numberOfLines={1}>{title}</Text>
          {detail ? <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={1}>{detail}</Text> : null}
        </View>
        {deal.estimatedValueCents ? <Text style={{ color: t.ink, fontWeight: "700", fontSize: font.small }}>{money(deal.estimatedValueCents)}</Text> : null}
      </View>
      {deal.interest && deal.interest !== deal.title ? <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={2}>{deal.interest}</Text> : null}
      {meId && deal.ownerId !== meId && deal.ownerName ? <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={1}>Carteira: {friendlyName(deal.ownerName)}</Text> : null}
      <View style={styles.tags}>
        {deal.awaitingReply ? <Pill label="Cliente aguardando" tone="accent" /> : null}
        {deal.nextAction.due ? <Pill label={dueLabel(deal.nextAction.due)} tone={new Date(deal.nextAction.due) < new Date() ? "bad" : "neutral"} /> : <Pill label="Sem próxima ação" tone="warn" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  cardTop: { flexDirection: "row", gap: space.md, alignItems: "center" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
