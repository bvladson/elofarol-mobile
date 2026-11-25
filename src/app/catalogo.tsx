import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ToggleRow } from "@/components/forms";
import { Button, Chip, ChipRow, EmptyState, ErrorState, Icon, Loading, Notice, Pill } from "@/components/ui";
import { ApiError, friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { useScope } from "@/lib/queries";
import { font, radius, space, touch, useTheme } from "@/lib/theme";
import type { CatalogItem, CatalogResponse, Draft } from "@/lib/types";

const PLACEHOLDER = "/images/product-placeholder.svg";
const SELO: Record<string, { label: string; tone: "ok" | "accent" | "neutral" }> = {
  PRONTA_ENTREGA: { label: "Pronta entrega", tone: "ok" }, DISPONIVEL: { label: "Disponível", tone: "accent" }, SOB_CONSULTA: { label: "Sob consulta", tone: "neutral" },
};

/**
 * Catálogo (só leitura, sem preço: o mesmo da Consulta rápida, sincronizado à noite) e o rascunho de produtos do negócio.
 * Preço, desconto e condições ficam no editor do orçamento no CRM web.
 */
export default function Catalogo() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const call = useApi();
  const scope = useScope();
  const queryClient = useQueryClient();
  const { server, has } = useAuth();
  const { opportunityId } = useLocalSearchParams<{ opportunityId?: string }>();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [all, setAll] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => setSearch(typed.trim()), 300); return () => clearTimeout(timer); }, [typed]);

  const list = useQuery({
    queryKey: ["catalogo", ...scope, search, filter, all],
    queryFn: () => call<CatalogResponse>(`catalog?limit=60${search ? `&q=${encodeURIComponent(search)}` : ""}${filter !== "todos" ? `&filtro=${filter}` : ""}${all ? "&todos=1" : ""}`),
    enabled: has("catalog.read"), placeholderData: (previous) => previous,
  });
  const draft = useQuery({ queryKey: ["rascunho", ...scope, opportunityId], queryFn: () => call<{ draft: Draft }>(`opportunities/${opportunityId}/draft`), enabled: Boolean(opportunityId) && has("drafts.write") });
  useEffect(() => {
    if (!draft.data || dirty) return;
    setQuantities(Object.fromEntries(draft.data.draft.itens.map((i) => [i.produtoId, i.quantidade])));
    setNames(Object.fromEntries(draft.data.draft.itens.map((i) => [i.produtoId, i.nome])));
  }, [draft.data, dirty]);
  const chosen = useMemo(() => Object.entries(quantities).filter(([, q]) => q > 0), [quantities]);

  const change = (item: CatalogItem, delta: number) => {
    setDirty(true); setError(null);
    setNames((current) => ({ ...current, [item.id]: item.nome }));
    setQuantities((current) => {
      const next = Math.max(0, Math.round(((current[item.id] ?? 0) + delta) * 1000) / 1000);
      const copy = { ...current };
      if (next) copy[item.id] = next; else delete copy[item.id];
      return copy;
    });
  };
  async function save() {
    if (!opportunityId || !draft.data) return;
    setBusy(true); setError(null);
    try {
      await call(`opportunities/${opportunityId}/draft`, { method: "PUT", body: { revision: draft.data.draft.revision, itens: chosen.map(([produtoId, quantidade]) => ({ produtoId, quantidade })) } });
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["rascunho", ...scope, opportunityId] });
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") { setDirty(false); void draft.refetch(); setError("O rascunho mudou em outra tela. Carreguei a versão atual: confira e salve de novo."); }
      else setError(friendlyError(e));
    } finally { setBusy(false); }
  }

  if (!has("catalog.read")) return <ErrorState message="O catálogo no aplicativo fica disponível quando o CRM receber a atualização autorizada." />;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: opportunityId ? "Produtos do orçamento" : "Catálogo" }} />
      <View style={[styles.searchBox, { backgroundColor: t.surface, borderColor: t.line }]}>
        <Icon name="search" size={20} color={t.muted} />
        <TextInput value={typed} onChangeText={setTyped} placeholder="Nome, código (SKU) ou marca" placeholderTextColor={t.muted} autoFocus={!opportunityId}
          style={{ flex: 1, color: t.ink, fontSize: font.body, minHeight: touch }} accessibilityLabel="Buscar produtos" returnKeyType="search" />
        {typed ? <Pressable onPress={() => setTyped("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Limpar busca"><Icon name="close" size={20} color={t.muted} /></Pressable> : null}
      </View>
      <ChipRow>
        {(list.data?.filtros ?? [{ id: "todos", label: "Todos" }]).map((f) => <Chip key={f.id} label={f.label} selected={f.id === filter} onPress={() => setFilter(f.id)} />)}
      </ChipRow>
      <View style={{ paddingHorizontal: space.lg }}>
        <ToggleRow label="Incluir produtos fora do site" hint="Cadastro completo do Omie, sem estoque calculado" value={all} onChange={setAll} />
      </View>
      {list.isLoading ? <Loading /> : list.isError && !list.data ? <ErrorState message={friendlyError(list.error)} onRetry={() => list.refetch()} /> : (
        <FlatList
          data={list.data?.itens ?? []}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: opportunityId ? 120 : space.xl, flexGrow: 1 }}
          ListHeaderComponent={list.data ? <Text style={{ color: t.muted, fontSize: 12, paddingBottom: space.xs }}>{list.data.total} produto{list.data.total === 1 ? "" : "s"}{list.data.total > list.data.itens.length ? ` (mostrando ${list.data.itens.length}; refine a busca)` : ""}</Text> : undefined}
          renderItem={({ item }) => (
            <ProductRow item={item} baseUrl={server.baseUrl} quantity={quantities[item.id] ?? 0} editable={Boolean(opportunityId) && has("drafts.write") && !item.inativo && !item.bloqueado}
              onChange={(delta) => change(item, delta)} />
          )}
          ListEmptyComponent={<EmptyState icon="inventory_2" title="Nenhum produto encontrado" text="Tente outra palavra ou o código do produto." />}
        />
      )}
      {opportunityId ? (
        <View style={[styles.footer, { backgroundColor: t.surface, borderTopColor: t.line, paddingBottom: insets.bottom + space.md }]}>
          {error ? <Notice tone="bad" text={error} /> : null}
          <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={2}>
            {chosen.length ? `${chosen.length} produto${chosen.length > 1 ? "s" : ""}: ${chosen.slice(0, 3).map(([pid, q]) => `${names[pid] ?? "produto"} (${String(q).replace(".", ",")})`).join(", ")}${chosen.length > 3 ? "…" : ""}` : "Nenhum produto no rascunho ainda."}
          </Text>
          <Button label={dirty ? "Salvar produtos no negócio" : "Voltar ao negócio"} icon={dirty ? "check" : "arrow_back"} busy={busy}
            disabled={!draft.data} onPress={() => (dirty ? void save() : router.back())} />
        </View>
      ) : null}
    </View>
  );
}

function ProductRow({ item, baseUrl, quantity, editable, onChange }: { item: CatalogItem; baseUrl: string; quantity: number; editable: boolean; onChange: (delta: number) => void }) {
  const t = useTheme();
  const [failed, setFailed] = useState(false);
  const selo = item.estoque ? SELO[item.estoque] : null;
  const photo = item.imagem && item.imagem !== PLACEHOLDER && !failed ? `${baseUrl}${item.imagem}` : null;
  return (
    <View style={[styles.product, { backgroundColor: t.surface, borderColor: quantity ? t.accent : t.line }]}>
      {photo ? <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
        : <View style={[styles.photo, { backgroundColor: t.surfaceAlt, alignItems: "center", justifyContent: "center" }]}><Icon name="chair" size={28} color={t.muted} /></View>}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "600" }} numberOfLines={2}>{item.nome}</Text>
        <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={1}>{[item.sku, item.marca, item.unidade].filter(Boolean).join(" · ")}</Text>
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          {selo ? <Pill label={selo.label} tone={selo.tone} /> : <Pill label={item.inativo ? "Inativo no Omie" : item.bloqueado ? "Bloqueado" : "Fora do site"} tone={item.inativo || item.bloqueado ? "bad" : "neutral"} />}
          {item.disponivel != null ? <Pill label={`${String(item.disponivel).replace(".", ",")} disponível`} /> : null}
        </View>
      </View>
      {editable ? (
        quantity ? (
          <View style={styles.stepper}>
            <Pressable onPress={() => onChange(-1)} accessibilityRole="button" accessibilityLabel={`Diminuir ${item.nome}`} style={[styles.step, { borderColor: t.line }]}><Icon name="remove" size={20} color={t.ink} /></Pressable>
            <Text style={{ color: t.ink, fontWeight: "800", minWidth: 28, textAlign: "center" }} accessibilityLabel={`${quantity} unidades`}>{String(quantity).replace(".", ",")}</Text>
            <Pressable onPress={() => onChange(1)} accessibilityRole="button" accessibilityLabel={`Aumentar ${item.nome}`} style={[styles.step, { borderColor: t.line }]}><Icon name="add" size={20} color={t.ink} /></Pressable>
          </View>
        ) : (
          <Pressable onPress={() => onChange(1)} accessibilityRole="button" accessibilityLabel={`Adicionar ${item.nome}`} style={[styles.add, { backgroundColor: t.accentSoft }]}>
            <Icon name="add" size={22} color={t.accent} />
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginTop: space.md, paddingHorizontal: space.md, borderWidth: 1, borderRadius: radius.md },
  product: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderWidth: 1, borderRadius: radius.md },
  photo: { width: 64, height: 64, borderRadius: radius.sm },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  step: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  add: { width: touch, height: touch, borderRadius: touch / 2, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
