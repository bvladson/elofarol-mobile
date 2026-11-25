import { SymbolView } from "expo-symbols";
import { useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, radius, space, touch, useTheme } from "@/lib/theme";

type AndroidSymbolName = NonNullable<Extract<ComponentProps<typeof SymbolView>["name"], { android?: unknown }>["android"]>;

/** Ícone Material (Android) pelo expo-symbols. */
export function Icon({ name, size = 22, color }: { name: AndroidSymbolName; size?: number; color?: string }) {
  const t = useTheme();
  return <SymbolView name={{ android: name }} size={size} tintColor={color ?? t.ink} />;
}

/** Barra de título das abas (as telas empilhadas usam o cabeçalho nativo). */
export function TopBar({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.topBar, { paddingTop: insets.top + space.md, backgroundColor: t.bg, borderBottomColor: t.line }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={[s.h1, { color: t.ink }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[s.small, { color: t.muted }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.surface, borderColor: t.line }, style]}>{children}</View>;
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "ok" | "warn" | "bad" | "accent" }) {
  const t = useTheme();
  const map = { neutral: [t.surfaceAlt, t.muted], ok: [t.okSoft, t.ok], warn: [t.warnSoft, t.warn], bad: [t.badSoft, t.bad], accent: [t.accentSoft, t.accent] } as const;
  const [bg, fg] = map[tone];
  return <View style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillText, { color: fg }]} numberOfLines={1}>{label}</Text></View>;
}

export function CountBadge({ value }: { value: number }) {
  const t = useTheme();
  if (!value) return null;
  return (
    <View style={[s.badge, { backgroundColor: t.accent }]} accessibilityLabel={`${value} não lidas`}>
      <Text style={[s.badgeText, { color: t.onAccent }]}>{value > 99 ? "99+" : value}</Text>
    </View>
  );
}

export function Avatar({ label, size = 44 }: { label: string; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: t.accent, fontWeight: "700", fontSize: size * 0.36 }}>{label}</Text>
    </View>
  );
}

export function Button({ label, onPress, kind = "primary", disabled, busy, icon, accessibilityHint }: {
  label: string; onPress: () => void; kind?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; busy?: boolean;
  icon?: AndroidSymbolName; accessibilityHint?: string;
}) {
  const t = useTheme();
  const palette = {
    primary: { bg: t.accent, fg: t.onAccent, border: t.accent },
    secondary: { bg: t.surface, fg: t.ink, border: t.line },
    danger: { bg: t.surface, fg: t.bad, border: t.line },
    ghost: { bg: "transparent", fg: t.accent, border: "transparent" },
  }[kind];
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: t.line }}
      style={({ pressed }) => [s.button, { backgroundColor: palette.bg, borderColor: palette.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 }]}>
      {busy ? <ActivityIndicator color={palette.fg} /> : icon ? <Icon name={icon} size={20} color={palette.fg} /> : null}
      <Text style={[s.buttonText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, color }: { icon: AndroidSymbolName; label: string; onPress: () => void; color?: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} android_ripple={{ color: t.line, borderless: true }}
      style={s.iconButton}>
      <Icon name={icon} color={color ?? t.ink} />
    </Pressable>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[s.label, { color: t.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        accessibilityLabel={label}
        {...props}
        style={[s.input, { color: t.ink, backgroundColor: t.surface, borderColor: error ? t.bad : t.line }, props.style]}
      />
      {error ? <Text style={[s.small, { color: t.bad }]}>{error}</Text> : hint ? <Text style={[s.small, { color: t.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const t = useTheme();
  return (
    <View style={[s.segmented, { backgroundColor: t.surfaceAlt }]} accessibilityRole="tablist">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable key={option.value} onPress={() => onChange(option.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[s.segment, on && { backgroundColor: t.surface, borderColor: t.line }]}>
            <Text style={{ color: on ? t.ink : t.muted, fontWeight: "600", fontSize: font.small }} numberOfLines={1}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Filtro em pílula: o selecionado é preenchido com a cor da MAG; a contagem vai num selo à parte (zero fica apagado);
 * `dot` mostra a cor da etapa do funil.
 */
export function Chip({ label, selected, onPress, count, dot }: { label: string; selected?: boolean; onPress: () => void; count?: number; dot?: string }) {
  const t = useTheme();
  const fg = selected ? t.onAccent : t.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      accessibilityLabel={count != null ? `${label}, ${count}` : label} hitSlop={4}
      style={[s.chip, { backgroundColor: selected ? t.accent : t.surface, borderColor: selected ? t.accent : t.line }]}>
      {dot ? <View style={[s.chipDot, { backgroundColor: dot, borderColor: selected ? t.onAccent : "transparent" }]} /> : null}
      <Text style={{ color: fg, fontWeight: selected ? "700" : "600", fontSize: font.small }} numberOfLines={1}>{label}</Text>
      {count != null ? (
        <View style={[s.chipCount, { backgroundColor: selected ? t.onAccent : count ? t.surfaceAlt : "transparent" }]}>
          <Text style={{ color: selected ? t.accent : count ? t.ink : t.muted, fontSize: 12, fontWeight: "700" }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Fileira horizontal de filtros. `flexGrow/flexShrink: 0` impede que o ScrollView horizontal encolha para dar espaço
 * à lista de baixo (era isso que cortava os filtros pela metade).
 */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      style={s.chipRow} contentContainerStyle={s.chipRowContent}>
      {children}
    </ScrollView>
  );
}

export interface SelectorOption { value: string; label: string; hint?: string | null }
/**
 * Seletor compacto (ex.: caixa de entrada, funil): mostra a escolha atual e abre uma lista de baixo para cima.
 */
export function Selector({ title, icon, value, options, onChange }: {
  title: string; icon: AndroidSymbolName; value: string; options: SelectorOption[]; onChange: (value: string) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${title}: ${current?.label ?? ""}. Toque para trocar`}
        android_ripple={{ color: t.line }} style={[s.selector, { backgroundColor: t.surface, borderColor: t.line }]}>
        <Icon name={icon} size={20} color={t.accent} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>{title}</Text>
          <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "700" }} numberOfLines={1}>
            {current?.label}{current?.hint ? <Text style={{ color: t.muted, fontWeight: "400" }}>{`  ${current.hint}`}</Text> : null}
          </Text>
        </View>
        <Icon name="expand_more" size={24} color={t.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={s.sheetWrap}>
          <Pressable style={s.sheetBackdrop} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Fechar" />
          <View style={[s.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + space.lg }]}>
            <View style={[s.sheetHandle, { backgroundColor: t.line }]} />
            <Text style={[s.title, { color: t.ink, paddingHorizontal: space.lg, paddingBottom: space.sm }]} accessibilityRole="header">{title}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {options.map((o) => {
                const on = o.value === current?.value;
                return (
                  <Pressable key={o.value} onPress={() => { onChange(o.value); setOpen(false); }} android_ripple={{ color: t.line }}
                    accessibilityRole="radio" accessibilityState={{ checked: on }} style={[s.sheetRow, on && { backgroundColor: t.accentSoft }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: t.ink, fontSize: font.body, fontWeight: on ? "700" : "500" }} numberOfLines={1}>{o.label}</Text>
                      {o.hint ? <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={1}>{o.hint}</Text> : null}
                    </View>
                    {on ? <Icon name="check" size={22} color={t.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={[s.section, { color: t.muted }]}>{children}</Text>;
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  const t = useTheme();
  return <View style={s.center}><ActivityIndicator color={t.accent} /><Text style={[s.small, { color: t.muted }]}>{label}</Text></View>;
}
export function EmptyState({ icon = "inbox", title, text }: { icon?: AndroidSymbolName; title: string; text?: string }) {
  const t = useTheme();
  return (
    <View style={s.center}>
      <Icon name={icon} size={36} color={t.muted} />
      <Text style={[s.title, { color: t.ink, textAlign: "center" }]}>{title}</Text>
      {text ? <Text style={[s.body, { color: t.muted, textAlign: "center" }]}>{text}</Text> : null}
    </View>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View style={s.center}>
      <Icon name="cloud_off" size={36} color={t.bad} />
      <Text style={[s.body, { color: t.ink, textAlign: "center" }]}>{message}</Text>
      {onRetry ? <Button label="Tentar de novo" kind="secondary" icon="refresh" onPress={onRetry} /> : null}
    </View>
  );
}
export type NoticeTone = "warn" | "bad" | "ok" | "neutral";
/** Aviso com cor, ícone e título próprios: estados diferentes não podem parecer iguais (ex.: "nada foi enviado" × "envio incerto"). */
export function Notice({ text, tone = "warn", title, icon }: { text: string; tone?: NoticeTone; title?: string; icon?: AndroidSymbolName }) {
  const t = useTheme();
  const map = { warn: [t.warnSoft, t.warn], bad: [t.badSoft, t.bad], ok: [t.okSoft, t.ok], neutral: [t.surfaceAlt, t.muted] } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[s.notice, { backgroundColor: bg, borderLeftColor: fg, flexDirection: "row", gap: space.sm }]}
      accessible accessibilityRole="alert" accessibilityLabel={title ? `${title}. ${text}` : text}>
      {icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text style={[s.label, { color: fg }]}>{title}</Text> : null}
        <Text style={[s.small, { color: t.ink }]}>{text}</Text>
      </View>
    </View>
  );
}

export const s = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  h1: { fontSize: font.h2, fontWeight: "700" },
  title: { fontSize: font.title, fontWeight: "700" },
  body: { fontSize: font.body, lineHeight: 21 },
  small: { fontSize: font.small, lineHeight: 18 },
  label: { fontSize: font.small, fontWeight: "600" },
  section: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "700" },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  button: { minHeight: touch, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  buttonText: { fontSize: font.body, fontWeight: "700" },
  iconButton: { width: touch, height: touch, alignItems: "center", justifyContent: "center", borderRadius: touch / 2 },
  input: { minHeight: touch, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: font.body },
  segmented: { flexDirection: "row", borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: "transparent", alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 38, borderRadius: radius.pill, borderWidth: 1, paddingLeft: 14, paddingRight: 10, paddingVertical: 6 },
  chipCount: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  chipDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  chipRow: { flexGrow: 0, flexShrink: 0 },
  chipRowContent: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, alignItems: "center" },
  selector: { flexDirection: "row", alignItems: "center", gap: space.md, marginHorizontal: space.lg, marginTop: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 56, borderWidth: 1, borderRadius: radius.md },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space.sm },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: space.md },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl },
  notice: { borderLeftWidth: 3, borderRadius: radius.sm, padding: space.md },
});

/** Botão flutuante com rótulo (Material 3), no canto de baixo da tela: a ação principal da lista (novo negócio, novo cliente). */
export function Fab({ icon, label, onPress }: { icon: AndroidSymbolName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} android_ripple={{ color: t.accentSoft }}
      style={({ pressed }) => [fab.button, { backgroundColor: t.accent, opacity: pressed ? 0.9 : 1 }]}>
      <Icon name={icon} size={22} color={t.onAccent} />
      <Text style={{ color: t.onAccent, fontWeight: "700", fontSize: font.body }}>{label}</Text>
    </Pressable>
  );
}
const fab = StyleSheet.create({
  button: { position: "absolute", right: space.lg, bottom: space.lg, minHeight: 56, borderRadius: radius.lg, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", gap: space.sm, elevation: 4 },
});
