import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }));
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Navigation />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Navigation() {
  const { status } = useAuth();
  const t = useTheme();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (status !== "carregando") void SplashScreen.hideAsync();
    // Ao sair (ou ter o acesso revogado), nada da carteira anterior fica na memória do app.
    if (status === "fora") queryClient.clear();
  }, [status, queryClient]);
  if (status === "carregando") return null;
  const base = t.dark ? DarkTheme : DefaultTheme;
  const navigationTheme = { ...base, colors: { ...base.colors, primary: t.accent, background: t.bg, card: t.bg, text: t.ink, border: t.line, notification: t.accent } };
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerTintColor: t.ink, headerStyle: { backgroundColor: t.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Protected guard={status === "dentro"}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="conversa/[id]" options={{ title: "Conversa" }} />
          <Stack.Screen name="cliente/[id]" options={{ title: "Cliente" }} />
          <Stack.Screen name="cliente/formulario" options={{ title: "Cliente" }} />
          <Stack.Screen name="negocio/[id]" options={{ title: "Negócio" }} />
          <Stack.Screen name="negocio/novo" options={{ title: "Novo negócio" }} />
          <Stack.Screen name="catalogo" options={{ title: "Catálogo" }} />
          <Stack.Screen name="propostas" options={{ title: "Propostas" }} />
          <Stack.Screen name="pedidos-site" options={{ title: "Pedidos do site" }} />
          <Stack.Screen name="conta" options={{ title: "Minha conta" }} />
        </Stack.Protected>
        <Stack.Protected guard={status !== "dentro"}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
