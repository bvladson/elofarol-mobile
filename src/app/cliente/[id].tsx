import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar, Button, Card, EmptyState, ErrorState, Icon, Loading, Pill, SectionTitle } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { dueLabel, friendlyName, initials, listStamp, money, phoneLabel } from "@/lib/format";
import { useScope } from "@/lib/queries";
import { font, space, useTheme } from "@/lib/theme";
import type { ContactDetail, CustomerOrder, Opportunity } from "@/lib/types";

/** Cliente: dados de contato, negócios (abrem a ficha), pedidos registrados e acesso à conversa. */
export default function Cliente() {
  const t = useTheme();
  const call = useApi();
  const scope = useScope();
  const { me, has } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useQuery({ queryKey: ["contato", ...scope, id], queryFn: () => call<ContactDetail>(`contacts/${id}`) });
  const orders = useQuery({ queryKey: ["pedidos-cliente", ...scope, id], queryFn: () => call<{ orders: CustomerOrder[] }>(`contacts/${id}/orders`), enabled: has("orders.read") });
  const stageOf = (o: Opportunity) => me?.pipelines.find((p) => p.id === o.pipelineId)?.stages.find((st) => st.id === o.stageId);

  if (detail.isLoading) return <Loading />;
  if (detail.isError || !detail.data) return <ErrorState message={friendlyError(detail.error)} onRetry={() => detail.refetch()} />;
  const { contact, opportunities, opportunitiesTruncated } = detail.data;
  const isOwn = contact.ownerId === me?.user.id;
  const canEdit = has("contacts.write") && (isOwn || Boolean(me?.user.roles.includes("admin")));
  const lines = [contact.company, contact.phone ? phoneLabel(contact.phone) : "", contact.email, contact.city].filter(Boolean);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: space.xl * 2 }}
      refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={() => { void detail.refetch(); void orders.refetch(); }} colors={[t.accent]} />}>
      <Stack.Screen options={{
        title: contact.name,
        headerRight: () => canEdit ? (
          <Pressable onPress={() => router.push({ pathname: "/cliente/formulario", params: { id: contact.id } })} accessibilityRole="button" accessibilityLabel="Editar cliente" hitSlop={8} style={{ padding: space.sm }}>
            <Icon name="edit" size={22} color={t.accent} />
          </Pressable>
        ) : null,
      }} />
      <View style={styles.head}>
        <Avatar label={initials(contact.name)} size={64} />
        <Text accessibilityRole="header" style={{ color: t.ink, fontSize: font.h2, fontWeight: "800", textAlign: "center" }}>{contact.name}</Text>
        {lines.map((line) => <Text key={line} style={{ color: t.muted, fontSize: font.body }} selectable>{line}</Text>)}
        <Text style={{ color: t.muted, fontSize: 12 }}>Carteira: {friendlyName(contact.ownerName)}</Text>
        <View style={{ alignSelf: "stretch", paddingTop: space.sm, gap: space.sm }}>
          <Button label="Abrir conversa" icon="chat" onPress={() => router.push({ pathname: "/conversa/[id]", params: { id: contact.id, name: contact.name } })} />
          {has("opportunities.write") && isOwn ? <Button label="Novo negócio" icon="add" kind="secondary" onPress={() => router.push({ pathname: "/negocio/novo", params: { contactId: contact.id } })} /> : null}
        </View>
      </View>
      <SectionTitle>{`Negócios · ${opportunities.length}${opportunitiesTruncated ? "+" : ""}`}</SectionTitle>
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        {opportunities.length ? opportunities.map((o) => {
          const stage = stageOf(o);
          return (
            <Pressable key={o.id} disabled={!has("opportunities.detail")} onPress={() => router.push({ pathname: "/negocio/[id]", params: { id: o.id } })}
              accessibilityRole="button" accessibilityLabel={`Negócio ${o.title}${stage ? `, etapa ${stage.label}` : ""}`}>
              <Card>
                <View style={styles.row}>
                  <Text style={{ flex: 1, color: t.ink, fontSize: font.body, fontWeight: "700" }}>{o.title}</Text>
                  {o.estimatedValueCents ? <Text style={{ color: t.ink, fontWeight: "700" }}>{money(o.estimatedValueCents)}</Text> : null}
                  {has("opportunities.detail") ? <Icon name="chevron_right" size={20} color={t.muted} /> : null}
                </View>
                <View style={styles.tags}>
                  <Pill label={stage?.label ?? o.stage} tone={o.stage === "fechado" ? "ok" : o.stage === "perdido" ? "bad" : "neutral"} />
                  {o.quoteIds.length ? <Pill label={`${o.quoteIds.length} proposta${o.quoteIds.length > 1 ? "s" : ""}`} tone="accent" /> : null}
                  {o.nextAction.due ? <Pill label={`${o.nextAction.label}: ${dueLabel(o.nextAction.due)}`} /> : null}
                </View>
                {o.interest && o.interest !== o.title ? <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={2}>{o.interest}</Text> : null}
              </Card>
            </Pressable>
          );
        }) : <EmptyState icon="work" title="Nenhum negócio na sua carteira" />}
      </View>
      {has("orders.read") && orders.data?.orders.length ? (
        <>
          <SectionTitle>{`Orçamentos e pedidos · ${orders.data.orders.length}`}</SectionTitle>
          <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
            {orders.data.orders.map((order) => <OrderRow key={order.quoteId} order={order} />)}
            <Text style={{ color: t.muted, fontSize: 12 }}>Situação registrada no CRM. O status no Omie é atualizado pelo CRM web (só consulta).</Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const SITUACAO: Record<string, string> = { rascunho: "Rascunho", salvo: "Salvo", enviado: "Enviado ao cliente", aceito: "Aceito", enviado_omie: "Pedido no Omie", cancelado: "Cancelado" };
function OrderRow({ order }: { order: CustomerOrder }) {
  const t = useTheme();
  const p = order.pedido;
  const status = p ? (p.cancelado ? "Pedido cancelado" : p.faturado ? "Faturado" : p.estado === "criado" ? `Pedido ${p.numero ?? ""}${p.etapa ? ` · ${p.etapa}` : ""}` : p.estado === "erro" ? "Pedido com erro" : p.estado === "incerto" ? "Pedido sem confirmação" : "Enviando pedido") : SITUACAO[order.situacaoNegociacao] ?? order.situacaoNegociacao;
  return (
    <Card>
      <View style={styles.row}>
        <Icon name="receipt_long" size={22} color={t.muted} />
        <Text style={{ flex: 1, color: t.ink, fontWeight: "700" }}>{order.numeroNegociacao}</Text>
        <Pill label={status} tone={p?.faturado ? "ok" : p?.cancelado || p?.estado === "erro" ? "bad" : p ? "accent" : "neutral"} />
      </View>
      {p?.consultadoEm ? <Text style={{ color: t.muted, fontSize: 12 }}>Consultado no Omie {listStamp(p.consultadoEm)}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: space.xs, padding: space.xl },
  row: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
