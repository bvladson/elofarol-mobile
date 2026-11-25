import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { AccountButton } from "@/components/account-button";
import { Avatar, EmptyState, ErrorState, Fab, Icon, Loading, TopBar } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { initials, phoneLabel } from "@/lib/format";
import { useScope } from "@/lib/queries";
import { font, radius, space, touch, useTheme } from "@/lib/theme";
import type { ContactsPage } from "@/lib/types";

/** Clientes da carteira, com busca por nome, empresa, telefone ou e-mail. */
export default function Clientes() {
  const t = useTheme();
  const call = useApi();
  const scope = useScope();
  const { has } = useAuth();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => setSearch(typed.trim()), 350); return () => clearTimeout(timer); }, [typed]);
  const list = useInfiniteQuery({
    queryKey: ["clientes", ...scope, search],
    queryFn: ({ pageParam }) => call<ContactsPage>(`contacts?limit=30${search ? `&search=${encodeURIComponent(search)}` : ""}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "" as string,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
  });
  const contacts = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.contacts), [list.data]);
  const total = list.data?.pages[0]?.total;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar title="Clientes" subtitle={total != null ? `${total} na ${search ? "busca" : "carteira"}` : undefined} right={<AccountButton />} />
      <View style={[styles.searchBox, { backgroundColor: t.surface, borderColor: t.line }]}>
        <Icon name="search" size={20} color={t.muted} />
        <TextInput value={typed} onChangeText={setTyped} placeholder="Nome, empresa, telefone ou e-mail" placeholderTextColor={t.muted}
          style={{ flex: 1, color: t.ink, fontSize: font.body, minHeight: touch }} accessibilityLabel="Buscar clientes" returnKeyType="search" />
      </View>
      {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={friendlyError(list.error)} onRetry={() => list.refetch()} /> : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => c.id}
          onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); }}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => { void list.refetch(); }} colors={[t.accent]} />}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginLeft: 76 }} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push({ pathname: "/cliente/[id]", params: { id: item.id } })} android_ripple={{ color: t.line }}
              accessibilityRole="button" style={styles.row}>
              <Avatar label={initials(item.name)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "600" }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={1}>{[item.company, item.phone ? phoneLabel(item.phone) : "", item.city].filter(Boolean).join(" · ") || "Sem dados de contato"}</Text>
              </View>
              <Icon name="chevron_right" size={22} color={t.muted} />
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon="group" title={search ? "Nenhum cliente encontrado" : "Nenhum cliente na carteira"} />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading label="Carregando mais…" /> : undefined}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 96 }}
        />
      )}
      {has("contacts.write") ? <Fab icon="person_add" label="Novo cliente" onPress={() => router.push("/cliente/formulario")} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginVertical: space.md, paddingHorizontal: space.md, borderWidth: 1, borderRadius: radius.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 68 },
});
