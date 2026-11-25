import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { AccountButton } from "@/components/account-button";
import { EmptyState, ErrorState, Icon, Loading, Notice, TopBar } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { dayDiff, dueLabel, longToday, parseDate } from "@/lib/format";
import { useInboxSummary, useScope } from "@/lib/queries";
import { font, radius, space, touch, useTheme } from "@/lib/theme";
import type { InboxView, OpportunitiesPage, Opportunity, ProposalItem, SiteLead, Task, TasksPage } from "@/lib/types";

/** Meu dia: o que responder no Atendimento e as tarefas/retornos, das atrasadas às próximas. */
export default function MeuDia() {
  const t = useTheme();
  const call = useApi();
  const scope = useScope();
  const queryClient = useQueryClient();
  const { me, has } = useAuth();
  const summary = useInboxSummary();
  const tasks = useQuery({ queryKey: ["tarefas", ...scope], queryFn: () => call<TasksPage>("tasks?status=pending&limit=100") });
  const opportunities = useQuery({ queryKey: ["oportunidades", ...scope], queryFn: () => call<OpportunitiesPage>("opportunities?limit=100") });
  const proposals = useQuery({ queryKey: ["propostas", ...scope], queryFn: () => call<{ proposals: ProposalItem[] }>("proposals?limit=200"), enabled: has("proposals.read") });
  const leads = useQuery({ queryKey: ["pedidos-site", ...scope], queryFn: () => call<{ leads: SiteLead[] }>("leads"), enabled: has("leads.import") });
  const complete = useMutation({
    mutationFn: (task: Task) => call(`tasks/${task.id}/complete`, { method: "POST", body: {}, idempotencyKey: `concluir-${task.id}` }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tarefas"] });
      void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
    },
  });

  const byId = useMemo(() => new Map((opportunities.data?.opportunities ?? []).map((o) => [o.id, o])), [opportunities.data]);
  const sections = useMemo(() => {
    const groups: { title: string; data: Task[] }[] = [
      { title: "Atrasadas", data: [] }, { title: "Hoje", data: [] }, { title: "Próximos 7 dias", data: [] }, { title: "Depois", data: [] },
    ];
    for (const task of tasks.data?.tasks ?? []) {
      const due = parseDate(task.due);
      const diff = due ? dayDiff(due) : 0;
      groups[diff < 0 ? 0 : diff === 0 ? 1 : diff <= 7 ? 2 : 3]!.data.push(task);
    }
    return groups.filter((group) => group.data.length);
  }, [tasks.data]);

  const counts = summary.data?.viewCounts;
  const openInbox = (view: InboxView) => router.push({ pathname: "/atendimento", params: has("conversations.views") ? { view } : {} });
  const refreshing = tasks.isRefetching || opportunities.isRefetching || summary.isRefetching;
  const refresh = () => { void tasks.refetch(); void opportunities.refetch(); void summary.refetch(); if (has("proposals.read")) void proposals.refetch(); if (has("leads.import")) void leads.refetch(); };
  const sentProposals = (proposals.data?.proposals ?? []).filter((p) => p.status === "Enviada").length;
  const firstName = (me?.user.email ?? "").split("@")[0]!.split(/[._-]/)[0] ?? "";

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar title="Meu dia" subtitle={longToday()} right={<AccountButton />} />
      {tasks.isLoading ? <Loading /> : tasks.isError ? <ErrorState message={friendlyError(tasks.error)} onRetry={refresh} /> : (
        <SectionList
          sections={sections}
          keyExtractor={(task) => task.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[t.accent]} />}
          contentContainerStyle={{ paddingBottom: space.xl }}
          ListHeaderComponent={
            <View style={{ padding: space.lg, gap: space.md }}>
              {firstName ? <Text style={{ color: t.muted, fontSize: font.body }}>Olá, {firstName.charAt(0).toUpperCase() + firstName.slice(1)}.</Text> : null}
              <View style={styles.tiles}>
                <Tile label="Responder" value={counts?.responder} tone="accent" onPress={() => openInbox("responder")} />
                <Tile label="Aguardando cliente" value={counts?.aguardando} onPress={() => openInbox("aguardando")} />
                <Tile label="Retornos até hoje" value={counts?.retornos} onPress={() => openInbox("retornos")} />
              </View>
              {has("proposals.read") || has("leads.import") ? (
                <View style={styles.tiles}>
                  {has("proposals.read") ? <Tile label="Propostas aguardando o cliente" value={proposals.data ? sentProposals : undefined} onPress={() => router.push("/propostas")} /> : null}
                  {has("leads.import") ? <Tile label="Pedidos novos do site" value={leads.data?.leads.length} tone={leads.data?.leads.length ? "accent" : undefined} onPress={() => router.push("/pedidos-site")} /> : null}
                </View>
              ) : null}
              {!has("messages.send") ? <Notice tone="neutral" text="Este servidor ainda não tem a API completa do aplicativo: consultas funcionam; responder pelo app fica disponível depois da atualização autorizada do CRM." /> : null}
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text style={[styles.section, { color: section.title === "Atrasadas" ? t.bad : t.muted }]}>{section.title} · {section.data.length}</Text>
          )}
          renderItem={({ item }) => (
            <TaskRow task={item} opportunity={byId.get(item.opportunityId)} busy={complete.isPending && complete.variables?.id === item.id}
              onComplete={() => complete.mutate(item)} detail={has("opportunities.detail")} />
          )}
          ListEmptyComponent={<EmptyState icon="task_alt" title="Nenhuma tarefa pendente" text="Os retornos agendados no CRM aparecem aqui." />}
          ListFooterComponent={complete.isError ? <View style={{ padding: space.lg }}><Notice tone="bad" text={friendlyError(complete.error)} /></View> : undefined}
        />
      )}
    </View>
  );
}

function Tile({ label, value, tone, onPress }: { label: string; value?: number; tone?: "accent"; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? "carregando"}`}
      style={[styles.tile, { backgroundColor: tone ? t.accentSoft : t.surface, borderColor: tone ? t.accent : t.line }]}>
      <Text style={{ color: tone ? t.accent : t.ink, fontSize: font.h2, fontWeight: "800" }}>{value ?? "–"}</Text>
      <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function TaskRow({ task, opportunity, busy, onComplete, detail }: { task: Task; opportunity?: Opportunity; busy: boolean; onComplete: () => void; detail: boolean }) {
  const t = useTheme();
  const late = (() => { const d = parseDate(task.due); return d ? dayDiff(d) < 0 : false; })();
  return (
    <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.line }]}>
      <Pressable onPress={onComplete} disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: false, busy }}
        accessibilityLabel={`Concluir: ${task.label}`} style={styles.check} hitSlop={6}>
        <Icon name={busy ? "hourglass_empty" : "radio_button_unchecked"} size={26} color={t.accent} />
      </Pressable>
      <Pressable style={{ flex: 1, gap: 2 }} disabled={!opportunity}
        onPress={() => opportunity && (detail ? router.push({ pathname: "/negocio/[id]", params: { id: opportunity.id } }) : router.push({ pathname: "/cliente/[id]", params: { id: opportunity.contactId } }))}>
        <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "600" }} numberOfLines={2}>{task.label}</Text>
        {opportunity ? <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={1}>{opportunity.title}</Text> : null}
        <Text style={{ color: late ? t.bad : t.muted, fontSize: 12, fontWeight: late ? "700" : "400" }}>{dueLabel(task.due)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", gap: space.sm },
  tile: { flex: 1, minHeight: 84, borderWidth: 1, borderRadius: radius.md, padding: space.md, justifyContent: "space-between" },
  section: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginBottom: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, minHeight: touch },
  check: { width: touch, height: touch, alignItems: "center", justifyContent: "center" },
});
