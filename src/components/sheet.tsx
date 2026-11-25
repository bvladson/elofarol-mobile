import type { ComponentProps, ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, s } from "@/components/ui";
import { font, space, useTheme } from "@/lib/theme";

type IconName = ComponentProps<typeof Icon>["name"];

/** Folha que sobe de baixo (padrão Material): fecha tocando fora, no botão voltar do Android ou pelo próprio conteúdo. */
export function BottomSheet({ visible, onClose, title, subtitle, children, footer }: {
  visible: boolean; onClose: () => void; title?: string; subtitle?: string; children: ReactNode; footer?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={s.sheetWrap}>
        <Pressable style={s.sheetBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={[s.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + space.md, maxHeight: "88%" }]}>
          <View style={[s.sheetHandle, { backgroundColor: t.line }]} />
          {title ? (
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm, gap: 2 }}>
              <Text style={[s.title, { color: t.ink }]} accessibilityRole="header">{title}</Text>
              {subtitle ? <Text style={{ color: t.muted, fontSize: font.small }}>{subtitle}</Text> : null}
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.sm }}>{children}</ScrollView>
          {footer ? <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface SheetAction { icon: IconName; label: string; hint?: string; onPress: () => void; disabled?: boolean; tone?: "danger" }
/** Lista de ações numa folha (ex.: anexar foto, documento, proposta). */
export function ActionSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title: string; actions: SheetAction[] }) {
  const t = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {actions.map((action) => (
        <Pressable key={action.label} disabled={action.disabled} onPress={() => { onClose(); action.onPress(); }} android_ripple={{ color: t.line }}
          accessibilityRole="button" accessibilityState={{ disabled: !!action.disabled }} accessibilityHint={action.hint}
          style={[s.sheetRow, { opacity: action.disabled ? 0.45 : 1 }]}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: action.tone === "danger" ? t.badSoft : t.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name={action.icon} size={22} color={action.tone === "danger" ? t.bad : t.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: action.tone === "danger" ? t.bad : t.ink, fontSize: font.body, fontWeight: "600" }}>{action.label}</Text>
            {action.hint ? <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={2}>{action.hint}</Text> : null}
          </View>
        </Pressable>
      ))}
    </BottomSheet>
  );
}
