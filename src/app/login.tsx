import { Image } from "expo-image";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Field, Notice, Segmented } from "@/components/ui";
import { ApiError, friendlyError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { appVersion, availableServers, localServerAllowed, type ServerId } from "@/lib/config";
import { logWarn } from "@/lib/log";
import { font, space, useTheme } from "@/lib/theme";

type Mode = "senha" | "codigo";

export default function Login() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { loginWithPassword, loginWithToken, notice, clearNotice, server } = useAuth();
  const [serverId, setServerId] = useState<ServerId>(server.id);
  const [mode, setMode] = useState<Mode>("senha");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordLoginMissing, setPasswordLoginMissing] = useState(false);

  async function submit() {
    setError(null);
    clearNotice();
    setBusy(true);
    try {
      if (mode === "senha") {
        if (!email.trim() || !password) { setError("Informe e-mail e senha."); return; }
        await loginWithPassword({ serverId, email, password, code: needsCode ? code : undefined });
      } else {
        await loginWithToken(serverId, token);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "mfa_required") {
        setNeedsCode(true);
        setError(e.extra.codeRejected ? "Código inválido, já usado ou expirado. Use o próximo código do autenticador ou um código de recuperação." : "Sua conta usa verificação em duas etapas. Informe o código.");
      } else if (e instanceof ApiError && mode === "senha" && (e.code === "not_found" || e.status === 404 || e.code === "invalid_token")) {
        // Servidor ainda sem o login do aplicativo (a API anterior pede token antes de tudo e responde 401 invalid_token;
        // o login novo responde invalid_credentials para senha errada): oferece o código do aparelho.
        setPasswordLoginMissing(true);
        setMode("codigo");
        setError(null);
      } else if (e instanceof ApiError && e.code === "token_format") {
        setError(e.serverMessage ?? "Código do aparelho inválido.");
      } else if (e instanceof ApiError && e.code === "invalid_token") {
        setError("Código do aparelho não aceito: confira se foi copiado inteiro, se não venceu e se não foi revogado.");
      } else if (e instanceof ApiError && e.code === "forbidden") {
        setError("Seu perfil não tem acesso comercial ao CRM.");
      } else {
        setError(friendlyError(e));
      }
      logWarn("login", e instanceof ApiError ? `${e.status} ${e.code}` : "erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Image source={require("@/assets/images/icon.png")} style={styles.logo} contentFit="contain" accessibilityLabel="MAG" />
          <Text accessibilityRole="header" style={[styles.title, { color: t.ink }]}>MAG CRM</Text>
          <Text style={[styles.subtitle, { color: t.muted }]}>Acesso da equipe comercial</Text>
        </View>

        {notice ? <Notice text={notice} tone="neutral" /> : null}

        {localServerAllowed ? (
          <View style={{ gap: space.xs }}>
            <Text style={[styles.label, { color: t.muted }]}>Servidor</Text>
            <Segmented value={serverId} onChange={(value) => { setServerId(value); setPasswordLoginMissing(false); }}
              options={availableServers().map((item) => ({ value: item.id, label: item.label }))} />
            <Text style={[styles.hint, { color: t.muted }]}>{availableServers().find((item) => item.id === serverId)?.hint}</Text>
          </View>
        ) : null}

        <Segmented value={mode} onChange={(value) => { setMode(value); setError(null); }}
          options={[{ value: "senha", label: "E-mail e senha" }, { value: "codigo", label: "Código do aparelho" }]} />

        {mode === "senha" ? (
          <View style={{ gap: space.md }}>
            <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
            <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType={needsCode ? "next" : "go"} onSubmitEditing={needsCode ? undefined : submit} />
            {needsCode ? (
              <Field label="Código da verificação em duas etapas" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" returnKeyType="go" onSubmitEditing={submit}
                hint="Do aplicativo autenticador, ou um código de recuperação." />
            ) : null}
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            {passwordLoginMissing ? <Notice text="Este servidor ainda não aceita entrar com e-mail e senha pelo aplicativo. Use um código do aparelho." /> : null}
            <Field label="Código do aparelho" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} spellCheck={false}
              placeholder="mag_app_…" style={{ fontFamily: Platform.OS === "android" ? "monospace" : undefined }}
              hint="Gere no CRM pelo computador ou pelo navegador do celular: Atendimento → Aplicativo → Novo aparelho. Ele vale por 1, 7 ou 30 dias e pode ser revogado." />
          </View>
        )}

        {error ? <Notice text={error} tone="bad" /> : null}
        <Button label={mode === "senha" ? "Entrar" : "Conectar este aparelho"} onPress={submit} busy={busy} icon="login" />
        <Text style={[styles.hint, { color: t.muted, textAlign: "center" }]}>Uso interno da MAG Móveis Corporativos · versão {appVersion}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", gap: space.lg, paddingHorizontal: space.xl },
  brand: { alignItems: "center", gap: space.xs, marginBottom: space.sm },
  logo: { width: 96, height: 96 },
  title: { fontSize: font.h1, fontWeight: "800" },
  subtitle: { fontSize: font.body },
  label: { fontSize: font.small, fontWeight: "600" },
  hint: { fontSize: 12, lineHeight: 17 },
});
