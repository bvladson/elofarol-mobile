import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Button, EmptyState, ErrorState, Loading, Notice, Pill } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { friendlyName, listStamp } from "@/lib/format";
import { newKey, useScope } from "@/lib/queries";
import { font, radius, space, useTheme } from "@/lib/theme";
import type { Opportunity, SiteLead } from "@/lib/types";

/** Pedidos que chegaram pelo site, atribuídos à sua carteira, ainda fora do CRM: importar cria cliente e negócio (uma vez só). */
export default function PedidosSite() {
  const t = useTheme();
  const call = useApi();
  const scope = useScope();
  const queryClient = useQueryClient();
  const { has, me } = useAuth();
  const list = useQuery({ queryKey: ["pedidos-site", ...scope], queryFn: () => call<{ leads: SiteLead[] }>("leads"), enabled: has("leads.import") });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keys] = useState(() => new Map<string, string>());

  async function importLead(lead: SiteLead) {
    setBusy(lead.sourceId); setError(null);
    // Uma chave por pedido enquanto a tela estiver aberta: tocar de novo depois de falha não importa duas vezes
    // (e o CRM já devolve o mesmo negócio se o pedido foi importado).
    const key = keys.get(lead.sourceId) ?? newKey();
    keys.set(lead.sourceId, key);
    try {
      const { opportunity } = await call<{ opportunity: Opportunity }>(`leads/${lead.sourceKind}/${lead.sourceId}/import`, { method: "POST", body: {}, idempotencyKey: key });
      void queryClient.invalidateQueries({ queryKey: ["pedidos-site"] });
      void queryClient.invalidateQueries({ queryKey: ["funil"] });
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
      router.push({ pathname: "/negocio/[id]", params: { id: opportunity.id } });
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  }

  if (!has("leads.import")) return <ErrorState message="Os pedidos do site no aplicativo ficam disponíveis quando o CRM receber a atualização autorizada." />;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: "Pedidos do site" }} />
      {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={friendlyError(list.error)} onRetry={() => list.refetch()} /> : (
        <FlatList
          data={list.data?.leads ?? []}
          keyExtractor={(lead) => `${lead.sourceKind}-${lead.sourceId}`}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => { void list.refetch(); }} colors={[t.accent]} />}
          contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
          ListHeaderComponent={error ? <Notice tone="bad" text={error} /> : undefined}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text style={{ flex: 1, color: t.ink, fontSize: font.body, fontWeight: "700" }} numberOfLines={1}>{item.name || item.company || "Contato do site"}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{listStamp(item.createdAt)}</Text>
              </View>
              <Text style={{ color: t.muted, fontSize: font.small }}>{[item.company, item.sourceKind === "quote" ? `Orçamento ${item.protocol}` : `Contato ${item.protocol}`].filter(Boolean).join(" · ")}</Text>
              {item.interest ? <Text style={{ color: t.ink, fontSize: font.small }} numberOfLines={4}>{item.interest}</Text> : null}
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                <Pill label={item.origin} />
                {item.ownerId && item.ownerId !== me?.user.id && item.ownerName ? <Pill label={`Carteira: ${friendlyName(item.ownerName)}`} /> : null}
                {!item.ownerId ? <Pill label="Sem responsável (triagem)" tone="warn" /> : null}
              </View>
              <Button label="Importar para o CRM" icon="download" busy={busy === item.sourceId} disabled={Boolean(busy)} onPress={() => void importLead(item)} />
            </View>
          )}
          ListEmptyComponent={<EmptyState icon="inbox" title="Nenhum pedido novo do site" text="Pedidos de orçamento atribuídos a você aparecem aqui até serem importados." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, gap: space.sm },
});
