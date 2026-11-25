import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, Notice, SectionTitle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { appName, appVersion } from "@/lib/config";
import { clearLog, logEntries } from "@/lib/log";
import { useWhatsappStatus } from "@/lib/queries";
import { font, space, useTheme } from "@/lib/theme";

const ROLE: Record<string, string> = { admin: "Administrador", comercial: "Comercial" };

/** Minha conta: quem está conectado, em qual servidor, o que o servidor oferece, diagnóstico e sair. */
export default function Conta() {
  const t = useTheme();
  const { me, server, logout, has } = useAuth();
  const whatsapp = useWhatsappStatus();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const entries = logEntries();

  const confirmLogout = () => Alert.alert("Sair deste aparelho?", has("auth.logout")
    ? "O acesso deste aparelho será revogado no servidor. Para voltar, entre de novo."
    : "Este servidor ainda não revoga pelo aplicativo: depois de sair, revogue o aparelho no CRM web (Aplicativo).", [
    { text: "Cancelar", style: "cancel" },
    { text: "Sair", style: "destructive", onPress: async () => { setBusy(true); await logout(); queryClient.clear(); } },
  ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: space.xl }}>
      <SectionTitle>Conta</SectionTitle>
      <View style={styles.pad}>
        <Card>
          <Line label="E-mail" value={me?.user.email ?? "—"} />
          <Line label="Perfil" value={(me?.user.roles ?? []).map((r) => ROLE[r] ?? r).join(", ") || "—"} />
          <Line label="Servidor" value={`${server.label} · ${server.hint}`} />
          <Line label="Aparelho" value={me ? `nº ${me.deviceId.slice(0, 8)}` : "—"} />
          {whatsapp.data ? <Line label="WhatsApp" value={whatsapp.data.ownLine ? `Sua linha ${whatsapp.data.phoneHint ?? ""} · ${whatsapp.data.connected ? "conectada" : "desconectada"}` : whatsapp.data.message ?? "Sem linha própria"} /> : null}
        </Card>
      </View>

      <SectionTitle>Servidor</SectionTitle>
      <View style={styles.pad}>
        {me?.features?.length
          ? <Notice tone="ok" text={`API do aplicativo ativa: ${me.features.length} recursos (login, caixas, leitura e envio).`} />
          : <Notice tone="neutral" text="Este servidor ainda está na API anterior ao aplicativo: consultas funcionam; entrar com senha, caixas, marcar como lida e responder ficam disponíveis depois da atualização autorizada do CRM." />}
      </View>

      <SectionTitle>Diagnóstico</SectionTitle>
      <View style={styles.pad}>
        <Card>
          <Text style={{ color: t.muted, fontSize: font.small }}>
            Registro sem senhas, tokens, e-mails, telefones nem textos de clientes. Fica só neste aparelho.
          </Text>
          {entries.length ? entries.slice(0, 15).map((entry, index) => (
            <Text key={`${entry.at}-${index}`} style={{ color: entry.level === "erro" ? t.bad : t.ink, fontSize: 12 }} selectable>
              {entry.at.slice(11, 19)} · {entry.context} · {entry.detail}
            </Text>
          )) : <Text style={{ color: t.ink, fontSize: font.small }}>Nenhum erro registrado.</Text>}
          {entries.length ? <Button label="Limpar registro" kind="secondary" onPress={() => { clearLog(); setTick((n) => n + 1); }} /> : null}
        </Card>
      </View>

      <View style={[styles.pad, { paddingTop: space.xl, gap: space.md }]}>
        <Button label="Sair deste aparelho" kind="danger" icon="logout" onPress={confirmLogout} busy={busy} />
        <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>{appName} {appVersion} · uso interno da MAG</Text>
      </View>
    </ScrollView>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.ink, fontSize: font.body }} selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ pad: { paddingHorizontal: space.lg } });
