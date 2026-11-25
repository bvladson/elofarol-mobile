import { NativeTabs } from "expo-router/native-tabs";
import { useInboxSummary } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

/** Navegação inferior nativa (Material no Android): as quatro áreas da rotina comercial. */
export default function TabsLayout() {
  const t = useTheme();
  const summary = useInboxSummary();
  const toAnswer = summary.data?.viewCounts?.responder ?? 0;
  return (
    <NativeTabs
      backgroundColor={t.surface}
      indicatorColor={t.accentSoft}
      iconColor={{ default: t.muted, selected: t.accent }}
      labelStyle={{ default: { color: t.muted }, selected: { color: t.accent } }}
      badgeBackgroundColor={t.accent}
      badgeTextColor={t.onAccent}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Meu dia</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sun.max" md="today" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="atendimento">
        <NativeTabs.Trigger.Label>Atendimento</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right" md="chat" />
        {toAnswer > 0 ? <NativeTabs.Trigger.Badge>{toAnswer > 99 ? "99+" : String(toAnswer)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="funil">
        <NativeTabs.Trigger.Label>Meu funil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.doc.horizontal" md="view_kanban" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clientes">
        <NativeTabs.Trigger.Label>Clientes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2" md="group" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
