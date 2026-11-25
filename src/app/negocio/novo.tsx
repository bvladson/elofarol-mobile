import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import { MoneyField, SelectField } from "@/components/forms";
import { Avatar, Button, ErrorState, Field, Icon, Notice, Segmented, s } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { initials, phoneLabel } from "@/lib/format";
import { useKeyFor, useScope } from "@/lib/queries";
import { font, radius, space, useTheme } from "@/lib/theme";
import { ORIGINS, type Contact, type ContactDetail, type ContactsPage, type Opportunity } from "@/lib/types";

/** Novo negócio: para um cliente da carteira ou para um cliente novo, já no funil padrão (primeira etapa), como no web. */
export default function NovoNegocio() {
  const t = useTheme();
  const call = useApi();
  const scope = useScope();
  const queryClient = useQueryClient();
  const { has } = useAuth();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const [mode, setMode] = useState<"existente" | "novo">("existente");
  const [contact, setContact] = useState<Contact | null>(null);
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [interest, setInterest] = useState("");
  const [origin, setOrigin] = useState<string>("WhatsApp");
  const [value, setValue] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keyFor = useKeyFor();

  const preset = useQuery({ queryKey: ["contato", ...scope, params.contactId], queryFn: () => call<ContactDetail>(`contacts/${params.contactId}`), enabled: Boolean(params.contactId) });
  useEffect(() => { if (preset.data) setContact(preset.data.contact); }, [preset.data]);
  useEffect(() => { const timer = setTimeout(() => setSearch(typed.trim()), 350); return () => clearTimeout(timer); }, [typed]);
  const results = useQuery({ queryKey: ["clientes-busca", ...scope, search], queryFn: () => call<ContactsPage>(`contacts?limit=8&search=${encodeURIComponent(search)}`),
    enabled: mode === "existente" && !contact && search.length >= 2 });

  if (!has("opportunities.write")) return <ErrorState message="Criar negócio pelo aplicativo fica disponível quando o CRM receber a atualização autorizada." />;

  const ready = title.trim() && (mode === "existente" ? Boolean(contact) : Boolean(name.trim()));
  async function save() {
    setBusy(true); setError(null);
    try {
      const body = {
        ...(mode === "existente" && contact ? { contactId: contact.id } : { newContact: { name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), ...(company.trim() ? { company: company.trim() } : {}) } }),
        title: title.trim(), origin, ...(interest.trim() ? { interest: interest.trim() } : {}), ...(value ? { estimatedValueCents: value } : {}),
      };
      // Tocar de novo depois de falha de rede (mesmo conteúdo) reaproveita a chave: não cria dois negócios.
      const { opportunity } = await call<{ opportunity: Opportunity }>("opportunities", { method: "POST", body, idempotencyKey: keyFor(body) });
      void queryClient.invalidateQueries({ queryKey: ["funil"] });
      void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
      void queryClient.invalidateQueries({ queryKey: ["contato"] });
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
      router.replace({ pathname: "/negocio/[id]", params: { id: opportunity.id } });
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: "Novo negócio" }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
        {!params.contactId ? <Segmented value={mode} onChange={(v) => { setMode(v); setError(null); }} options={[{ value: "existente", label: "Cliente da carteira" }, { value: "novo", label: "Cliente novo" }]} /> : null}
        {mode === "existente" ? (
          contact ? (
            <View style={[s.card, { backgroundColor: t.surface, borderColor: t.line, flexDirection: "row", alignItems: "center", gap: space.md }]}>
              <Avatar label={initials(contact.name)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: t.ink, fontWeight: "700", fontSize: font.body }} numberOfLines={1}>{contact.name}</Text>
                <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={1}>{[contact.company, contact.phone ? phoneLabel(contact.phone) : ""].filter(Boolean).join(" · ") || "Sem telefone"}</Text>
              </View>
              {!params.contactId ? <Pressable onPress={() => setContact(null)} accessibilityRole="button" accessibilityLabel="Trocar o cliente" hitSlop={10}><Icon name="close" size={22} color={t.muted} /></Pressable> : null}
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              <Field label="Cliente" value={typed} onChangeText={setTyped} placeholder="Busque por nome, empresa ou telefone" autoFocus />
              {results.data?.contacts.map((c) => (
                <Pressable key={c.id} onPress={() => setContact(c)} accessibilityRole="button" android_ripple={{ color: t.line }}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
                  <Avatar label={initials(c.name)} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: t.ink, fontWeight: "600" }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={1}>{[c.company, c.phone ? phoneLabel(c.phone) : ""].filter(Boolean).join(" · ")}</Text>
                  </View>
                </Pressable>
              ))}
              {search.length >= 2 && results.data && !results.data.contacts.length ? <Text style={{ color: t.muted }}>Nenhum cliente encontrado. Use "Cliente novo".</Text> : null}
            </View>
          )
        ) : (
          <View style={{ gap: space.md }}>
            <Field label="Nome do cliente" value={name} onChangeText={setName} maxLength={200} autoFocus />
            <Field label="WhatsApp (com DDD)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(85) 99999-0000" maxLength={40}
              hint="Se o telefone já estiver na sua carteira, o negócio entra nesse cliente." />
            <Field label="Empresa (opcional)" value={company} onChangeText={setCompany} maxLength={200} />
          </View>
        )}
        <View style={{ gap: space.md }}>
          <Field label="Título do negócio" value={title} onChangeText={setTitle} placeholder="Ex.: Estações de trabalho — 12 lugares" maxLength={240} />
          <Field label="Interesse do cliente (opcional)" value={interest} onChangeText={setInterest} multiline maxLength={3000} style={{ minHeight: 80, textAlignVertical: "top", paddingTop: 12 }} />
          <SelectField label="Origem" value={origin} onChange={setOrigin} options={ORIGINS.map((o) => ({ value: o, label: o }))} />
          <MoneyField label="Valor estimado (opcional)" cents={value} onChange={setValue} />
        </View>
        {error ? <Notice tone="bad" text={error} /> : null}
        <Button label="Criar negócio" icon="check" busy={busy} disabled={!ready} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
