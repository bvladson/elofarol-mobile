import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/sheet";
import { Icon, s } from "@/components/ui";
import { time } from "@/lib/format";
import { font, radius, space, touch, useTheme } from "@/lib/theme";

/** Valor em reais digitado como no caixa eletrônico: os dígitos entram pela direita ("123456" = R$ 1.234,56). */
export function MoneyField({ label, cents, onChange, hint }: { label: string; cents: number; onChange: (cents: number) => void; hint?: string }) {
  const t = useTheme();
  const text = cents ? (cents / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[s.label, { color: t.muted }]}>{label}</Text>
      <View style={[s.input, { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: t.surface, borderColor: t.line }]}>
        <Text style={{ color: t.muted, fontSize: font.body }}>R$</Text>
        <TextInput value={text} placeholder="0,00" placeholderTextColor={t.muted} keyboardType="number-pad" accessibilityLabel={label}
          onChangeText={(value) => { const digits = value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 11); onChange(digits ? Number(digits) : 0); }}
          style={{ flex: 1, color: t.ink, fontSize: font.body, minHeight: touch - 2 }} />
      </View>
      {hint ? <Text style={[s.small, { color: t.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const dateLabel = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
/** Data e hora pelos seletores nativos do Android (calendário e relógio). */
export function DateTimeField({ label, value, onChange }: { label: string; value: Date; onChange: (value: Date) => void }) {
  const t = useTheme();
  const pick = (mode: "date" | "time") => DateTimePickerAndroid.open({
    value, mode, is24Hour: true, minimumDate: mode === "date" ? new Date(new Date().setHours(0, 0, 0, 0)) : undefined,
    onChange: (event, picked) => {
      if (event.type !== "set" || !picked) return;
      const next = new Date(value);
      if (mode === "date") next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      onChange(next);
    },
  });
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[s.label, { color: t.muted }]}>{label}</Text>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Pressable onPress={() => pick("date")} accessibilityRole="button" accessibilityLabel={`${label}: data ${dateLabel(value)}. Toque para trocar`}
          android_ripple={{ color: t.line }} style={[s.input, { flex: 3, flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: t.surface, borderColor: t.line }]}>
          <Icon name="calendar_month" size={20} color={t.accent} />
          <Text style={{ color: t.ink, fontSize: font.body }}>{dateLabel(value)}</Text>
        </Pressable>
        <Pressable onPress={() => pick("time")} accessibilityRole="button" accessibilityLabel={`${label}: hora ${time(value)}. Toque para trocar`}
          android_ripple={{ color: t.line }} style={[s.input, { flex: 2, flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: t.surface, borderColor: t.line }]}>
          <Icon name="schedule" size={20} color={t.accent} />
          <Text style={{ color: t.ink, fontSize: font.body }}>{time(value)}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export interface Choice { value: string; label: string; hint?: string; dot?: string }
/** Campo de escolha que abre uma lista de baixo para cima (origem, motivo da perda, etapa). */
export function SelectField({ label, value, options, onChange, placeholder = "Escolha" }: {
  label: string; value: string | null; options: Choice[]; onChange: (value: string) => void; placeholder?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[s.label, { color: t.muted }]}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? placeholder}. Toque para escolher`}
        android_ripple={{ color: t.line }} style={[s.input, { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: t.surface, borderColor: t.line }]}>
        {current?.dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: current.dot }} /> : null}
        <Text style={{ flex: 1, color: current ? t.ink : t.muted, fontSize: font.body }} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <Icon name="expand_more" size={22} color={t.muted} />
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => { onChange(o.value); setOpen(false); }} android_ripple={{ color: t.line }}
              accessibilityRole="radio" accessibilityState={{ checked: on }} style={[s.sheetRow, on && { backgroundColor: t.accentSoft }]}>
              {o.dot ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: o.dot }} /> : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: t.ink, fontSize: font.body, fontWeight: on ? "700" : "500" }}>{o.label}</Text>
                {o.hint ? <Text style={{ color: t.muted, fontSize: font.small }}>{o.hint}</Text> : null}
              </View>
              {on ? <Icon name="check" size={22} color={t.accent} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

/** Interruptor simples com rótulo (ex.: "Cliente aguardando resposta"). */
export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: touch }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "600" }}>{label}</Text>
        {hint ? <Text style={{ color: t.muted, fontSize: font.small }}>{hint}</Text> : null}
      </View>
      <View style={{ width: 48, height: 28, borderRadius: radius.pill, padding: 3, backgroundColor: value ? t.accent : t.line, alignItems: value ? "flex-end" : "flex-start" }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: value ? t.onAccent : t.surface }} />
      </View>
    </Pressable>
  );
}
