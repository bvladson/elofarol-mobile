import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { Button, ErrorState, Field, Loading, Notice } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { phoneLabel } from "@/lib/format";
import { useKeyFor, useScope } from "@/lib/queries";
import { space, useTheme } from "@/lib/theme";
import type { Contact, ContactDetail } from "@/lib/types";

/** Cliente novo (na própria carteira) ou edição dos dados de contato, com o controle de versão do CRM. */
export default function FormularioCliente() {
  const t = useTheme();
  const call = useApi();
  const scope = useScope();
  const queryClient = useQueryClient();
  const keyFor = useKeyFor();
  const { has } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);
  const current = useQuery({ queryKey: ["contato", ...scope, id], queryFn: () => call<ContactDetail>(`contacts/${id}`), enabled: editing });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = current.data?.contact;
    if (!c) return;
    setName(c.name); setPhone(c.phone ? phoneLabel(c.phone) : ""); setEmail(c.email); setCompany(c.company ?? ""); setCity(c.city);
  }, [current.data]);

  if (!has("contacts.write")) return <ErrorState message="Cadastrar e editar clientes pelo aplicativo fica disponível quando o CRM receber a atualização autorizada." />;
  if (editing && current.isLoading) return <Loading />;
  if (editing && (current.isError || !current.data)) return <ErrorState message={friendlyError(current.error)} onRetry={() => current.refetch()} />;

  async function save() {
    setBusy(true); setError(null); setNotice(null);
    const fields = { name: name.trim(), phone: phone.trim(), email: email.trim(), company: company.trim(), city: city.trim() };
    try {
      if (editing && current.data) {
        const body = { revision: current.data.contact.revision, ...fields };
        await call<{ contact: Contact }>(`contacts/${id}`, { method: "PATCH", body, idempotencyKey: keyFor(body) });
        void queryClient.invalidateQueries({ queryKey: ["contato"] });
        void queryClient.invalidateQueries({ queryKey: ["clientes"] });
        void queryClient.invalidateQueries({ queryKey: ["conversas"] });
        router.back();
      } else {
        const body = Object.fromEntries(Object.entries(fields).filter(([, value]) => value)) as typeof fields;
        const result = await call<{ contact: Contact; existing: boolean }>("contacts", { method: "POST", body, idempotencyKey: keyFor(body) });
        void queryClient.invalidateQueries({ queryKey: ["clientes"] });
        void queryClient.invalidateQueries({ queryKey: ["conversas"] });
        if (result.existing) {
          // O CRM não duplica: telefone ou e-mail já estavam na carteira.
          setNotice(`Este telefone ou e-mail já está na sua carteira, no cliente "${result.contact.name}". Abrindo o cadastro existente.`);
          setTimeout(() => router.replace({ pathname: "/cliente/[id]", params: { id: result.contact.id } }), 1600);
        } else router.replace({ pathname: "/cliente/[id]", params: { id: result.contact.id } });
      }
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: editing ? "Editar cliente" : "Novo cliente" }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
        <Field label="Nome" value={name} onChangeText={setName} maxLength={200} autoFocus={!editing} autoCapitalize="words" />
        <Field label="WhatsApp (com DDD)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(85) 99999-0000" maxLength={40}
          hint="É por este número que o CRM conversa pelo WhatsApp da sua linha." />
        <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={255} />
        <Field label="Empresa" value={company} onChangeText={setCompany} maxLength={200} />
        <Field label="Cidade" value={city} onChangeText={setCity} maxLength={120} />
        {notice ? <Notice tone="neutral" icon="info" text={notice} /> : null}
        {error ? <Notice tone="bad" text={error} /> : null}
        <View style={{ paddingTop: space.sm }}>
          <Button label={editing ? "Salvar alterações" : "Cadastrar cliente"} icon="check" busy={busy} disabled={!name.trim() || Boolean(notice)} onPress={() => void save()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
