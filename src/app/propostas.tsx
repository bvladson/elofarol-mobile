import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Chip, ChipRow, EmptyState, ErrorState, Icon, Loading, Pill } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { listStamp, money } from "@/lib/format";
import { useScope } from "@/lib/queries";
import { font, radius, space, useTheme } from "@/lib/theme";
import type { ProposalItem } from "@/lib/types";

const FILTROS = ["Todas", "Rascunho", "Enviada", "Aceita", "Recusada"] as const;

/** Propostas da carteira (as mesmas do CRM web), da mais recente; cada uma abre a ficha do negócio. */
export default function Propostas() {
  const t = useTheme();
  const call = useApi();
  const scope = useScope();
  const { has } = useAuth();
  const [filter, setFilter] = useState<(typeof FILTROS)[number]>("Todas");
  const list = useQuery({ queryKey: ["propostas", ...scope], queryFn: () => call<{ proposals: ProposalItem[]; total: number }>("proposals?limit=200"), enabled: has("proposals.read") });
  const counts = useMemo(() => {
    const map: Record<string, number> = { Todas: list.data?.proposals.length ?? 0 };
    for (const p of list.data?.proposals ?? []) map[p.status] = (map[p.status] ?? 0) + 1;
    return map;
  }, [list.data]);
  const items = (list.data?.proposals ?? []).filter((p) => filter === "Todas" || p.status === filter);

  if (!has("proposals.read")) return <ErrorState message="As propostas no aplicativo ficam disponíveis quando o CRM receber a atualização autorizada." />;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: "Propostas" }} />
      <ChipRow>{FILTROS.map((f) => <Chip key={f} label={f} count={counts[f] ?? 0} selected={f === filter} onPress={() => setFilter(f)} />)}</ChipRow>
      {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={friendlyError(list.error)} onRetry={() => list.refetch()} /> : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => { void list.refetch(); }} colors={[t.accent]} />}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
          renderItem={({ item }) => (
            <Pressable disabled={!item.opportunityId || !has("opportunities.detail")} onPress={() => item.opportunityId && router.push({ pathname: "/negocio/[id]", params: { id: item.opportunityId } })}
              accessibilityRole="button" accessibilityLabel={`Proposta ${item.number}, ${item.customerName}, ${item.status}`}
              style={[styles.row, { backgroundColor: t.surface, borderColor: t.line }]} android_ripple={{ color: t.line }}>
              <Icon name="request_quote" size={26} color={t.accent} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "700" }} numberOfLines={1}>{item.customerName}</Text>
                <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={1}>{item.number}{item.version ? ` · v${item.version}` : ""} · {listStamp(item.date)}</Text>
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                  <Pill label={item.status} tone={item.status === "Aceita" ? "ok" : item.status === "Recusada" || item.status === "Cancelada" ? "bad" : item.status === "Enviada" ? "accent" : "neutral"} />
                  {item.valueCents ? <Text style={{ color: t.ink, fontWeight: "700", fontSize: font.small }}>{money(item.valueCents)}</Text> : null}
                </View>
              </View>
              {item.opportunityId ? <Icon name="chevron_right" size={22} color={t.muted} /> : null}
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon="request_quote" title="Nenhuma proposta aqui" text="As propostas geradas no CRM aparecem aqui." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
});
