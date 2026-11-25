import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ActionSheet, BottomSheet, type SheetAction } from "@/components/sheet";
import { Icon, s } from "@/components/ui";
import type { LocalFile } from "@/lib/api";
import { fileSizeLabel } from "@/lib/files";
import { logWarn } from "@/lib/log";
import { font, radius, space, touch, useTheme } from "@/lib/theme";
import type { ProposalItem, QuickReply, StagedAttachment } from "@/lib/types";

/** Anexo escolhido para a próxima mensagem: primeiro só no aparelho; depois de enviado ao servidor, `staged` guarda o id. */
export interface PendingFile {
  kind: "image" | "audio" | "document";
  name: string;
  mimeType: string;
  size?: number | null;
  local?: LocalFile;
  staged?: StagedAttachment;
  previewUri?: string;
  durationMs?: number;
  label?: string;
}
export const MAX_FILE = 7 * 1024 * 1024;
const MAX_AUDIO_MS = 5 * 60 * 1000;
const DOCUMENT_TYPES = [
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "image/*", "audio/*",
];
const clock = (ms: number) => { const sec = Math.floor(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
const kindOf = (mime: string): PendingFile["kind"] => (mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : "document");

export interface ComposerProps {
  draft: string;
  onDraft: (value: string) => void;
  pending: PendingFile | null;
  onPending: (value: PendingFile | null) => void;
  onSend: () => void;
  sending: boolean;
  bottomInset: number;
  canAttach: boolean;
  canAudio: boolean;
  quickReplies: QuickReply[];
  proposals: ProposalItem[];
  onPickProposal: (proposal: ProposalItem) => void;
  onNotice: (title: string, text: string) => void;
}

/**
 * Campo de mensagem do Atendimento: texto, respostas rápidas (botão ou "/atalho"), anexo (câmera, galeria, documento,
 * proposta) e áudio gravado aqui. NADA sai sem a pessoa tocar em enviar: a gravação e o anexo ficam numa prévia antes.
 */
export function Composer(props: ComposerProps) {
  const t = useTheme();
  const { draft, onDraft, pending, onPending, onSend, sending, canAttach, canAudio, quickReplies, proposals, onNotice } = props;
  const [attachOpen, setAttachOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);

  const suggestions = useMemo(() => {
    const typed = draft.trim().toLowerCase();
    if (!typed.startsWith("/") || typed.includes(" ")) return [];
    return quickReplies.filter((r) => r.shortcut.toLowerCase().startsWith(typed)).slice(0, 4);
  }, [draft, quickReplies]);

  async function pickImage(camera: boolean) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { onNotice("Câmera sem permissão", "Permita o uso da câmera nas configurações do Android para fotografar pelo app."); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8, exif: false };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      const type = asset.mimeType || "image/jpeg";
      if ((asset.fileSize ?? 0) > MAX_FILE) { onNotice("Foto grande demais", "O limite é 7 MB por arquivo."); return; }
      const name = asset.fileName || `foto-${Date.now()}.${type === "image/png" ? "png" : "jpg"}`;
      onPending({ kind: "image", name, mimeType: type, size: asset.fileSize ?? null, local: { uri: asset.uri, name, type }, previewUri: asset.uri });
    } catch {
      logWarn("anexo", "escolher foto falhou");
      onNotice("Não foi possível abrir", "Tente de novo.");
    }
  }
  async function pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_TYPES, copyToCacheDirectory: true, multiple: false });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > MAX_FILE) { onNotice("Arquivo grande demais", "O limite é 7 MB por arquivo."); return; }
      const type = asset.mimeType || "application/octet-stream";
      onPending({ kind: kindOf(type), name: asset.name, mimeType: type, size: asset.size ?? null, local: { uri: asset.uri, name: asset.name, type },
        previewUri: type.startsWith("image/") ? asset.uri : undefined });
    } catch {
      logWarn("anexo", "escolher documento falhou");
      onNotice("Não foi possível abrir", "Tente de novo.");
    }
  }

  async function startRecording() {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { onNotice("Microfone sem permissão", "Permita o microfone nas configurações do Android para gravar áudio pelo app."); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch {
      logWarn("áudio", "gravação não começou");
      onNotice("Não foi possível gravar", "Feche outros aplicativos que usam o microfone e tente de novo.");
    }
  }
  async function stopRecording(keep: boolean, duration: number) {
    try { await recorder.stop(); } catch { logWarn("áudio", "parar gravação falhou"); }
    setRecording(false);
    try { await setAudioModeAsync({ allowsRecording: false }); } catch { /* volta ao normal sozinho */ }
    if (!keep) return;
    if (!recorder.uri || duration < 800) { onNotice("Áudio muito curto", "Grave pelo menos um segundo."); return; }
    const name = `audio-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}.m4a`;
    onPending({ kind: "audio", name, mimeType: "audio/mp4", local: { uri: recorder.uri, name, type: "audio/mp4" }, durationMs: duration });
  }

  const actions: SheetAction[] = [
    { icon: "photo_camera", label: "Câmera", hint: "Tirar uma foto agora", onPress: () => void pickImage(true) },
    { icon: "photo_library", label: "Galeria", hint: "Escolher uma foto do aparelho", onPress: () => void pickImage(false) },
    { icon: "description", label: "Documento ou PDF", hint: "PDF, Word, Excel, texto ou áudio (até 7 MB)", onPress: () => void pickDocument() },
    ...(proposals.length ? [{ icon: "request_quote" as const, label: "Proposta deste cliente", hint: "Envia o PDF da versão vigente", onPress: () => setProposalsOpen(true) }] : []),
  ];
  const canSend = !sending && (Boolean(pending) || Boolean(draft.trim()));
  const audioPending = pending?.kind === "audio";

  if (recording) return <RecordingBar recorder={recorder} bottomInset={props.bottomInset} onStop={(keep, duration) => void stopRecording(keep, duration)} />;

  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, backgroundColor: t.surface }}>
      {suggestions.length ? (
        <ScrollView horizontal keyboardShouldPersistTaps="always" contentContainerStyle={styles.suggestions} showsHorizontalScrollIndicator={false}>
          {suggestions.map((r) => (
            <Pressable key={r.id} onPress={() => onDraft(r.text)} accessibilityRole="button" accessibilityLabel={`Resposta rápida: ${r.title}`}
              style={[styles.suggestion, { borderColor: t.line, backgroundColor: t.bg }]}>
              <Text style={{ color: t.accent, fontWeight: "700", fontSize: font.small }}>{r.shortcut}</Text>
              <Text style={{ color: t.ink, fontSize: font.small }} numberOfLines={1}>{r.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {pending ? <PendingPreview pending={pending} onRemove={() => onPending(null)} busy={sending} /> : null}
      <View style={[styles.bar, { paddingBottom: props.bottomInset + space.sm }]}>
        {canAttach ? (
          <Pressable onPress={() => setAttachOpen(true)} disabled={sending} accessibilityRole="button" accessibilityLabel="Anexar foto, documento ou proposta" hitSlop={4} style={styles.side}>
            <Icon name="attach_file" size={24} color={t.muted} />
          </Pressable>
        ) : null}
        {quickReplies.length ? (
          <Pressable onPress={() => setRepliesOpen(true)} disabled={sending || audioPending} accessibilityRole="button" accessibilityLabel="Respostas rápidas" hitSlop={4} style={styles.side}>
            <Icon name="bolt" size={24} color={audioPending ? t.line : t.muted} />
          </Pressable>
        ) : null}
        <TextInput value={audioPending ? "" : draft} onChangeText={onDraft} editable={!audioPending}
          placeholder={audioPending ? "Áudio vai sem legenda" : pending ? "Legenda (opcional)" : "Mensagem"} placeholderTextColor={t.muted} multiline maxLength={4000}
          style={[styles.input, { color: t.ink, backgroundColor: t.bg, borderColor: t.line }]} accessibilityLabel={pending ? "Legenda do anexo" : "Escrever mensagem"} />
        {canSend || !canAudio ? (
          <Pressable onPress={onSend} disabled={!canSend} accessibilityRole="button" accessibilityLabel={pending ? "Enviar anexo" : "Enviar mensagem"}
            style={[styles.round, { backgroundColor: canSend ? t.accent : t.line }]}>
            <Icon name="send" size={22} color={t.onAccent} />
          </Pressable>
        ) : (
          <Pressable onPress={() => void startRecording()} disabled={sending} accessibilityRole="button" accessibilityLabel="Gravar áudio"
            style={[styles.round, { backgroundColor: t.accent }]}>
            <Icon name="mic" size={22} color={t.onAccent} />
          </Pressable>
        )}
      </View>
      <ActionSheet visible={attachOpen} onClose={() => setAttachOpen(false)} title="Anexar" actions={actions} />
      <BottomSheet visible={repliesOpen} onClose={() => setRepliesOpen(false)} title="Respostas rápidas" subtitle="Toque para colocar no campo; você revisa antes de enviar.">
        {quickReplies.map((r) => (
          <Pressable key={r.id} onPress={() => { onDraft(draft.trim() && !draft.trim().startsWith("/") ? `${draft.trim()} ${r.text}` : r.text); setRepliesOpen(false); }}
            android_ripple={{ color: t.line }} accessibilityRole="button" style={[s.sheetRow, { alignItems: "flex-start" }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "700" }}>{r.title} <Text style={{ color: t.accent, fontWeight: "600" }}>{r.shortcut}</Text></Text>
              <Text style={{ color: t.muted, fontSize: font.small }}>{r.text}</Text>
            </View>
          </Pressable>
        ))}
      </BottomSheet>
      <BottomSheet visible={proposalsOpen} onClose={() => setProposalsOpen(false)} title="Proposta para enviar" subtitle="Vai o PDF da versão vigente, pelo WhatsApp da sua linha.">
        {proposals.map((p) => (
          <Pressable key={p.id} onPress={() => { setProposalsOpen(false); props.onPickProposal(p); }} android_ripple={{ color: t.line }} accessibilityRole="button" style={s.sheetRow}>
            <Icon name="picture_as_pdf" size={26} color={t.bad} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "700" }} numberOfLines={1}>{p.number} · v{p.version}</Text>
              <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={1}>{p.status} · {(p.valueCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Text>
            </View>
          </Pressable>
        ))}
      </BottomSheet>
    </View>
  );
}

/** Barra de gravação: só ela consulta o gravador (a cada 250 ms) e só enquanto grava; para sozinha em 5 minutos. */
function RecordingBar({ recorder, bottomInset, onStop }: {
  recorder: ReturnType<typeof useAudioRecorder>; bottomInset: number; onStop: (keep: boolean, duration: number) => void;
}) {
  const t = useTheme();
  const state = useAudioRecorderState(recorder, 250);
  const stopped = useRef(false);
  const stop = (keep: boolean) => { if (stopped.current) return; stopped.current = true; onStop(keep, state.durationMillis); };
  useEffect(() => {
    if (state.durationMillis >= MAX_AUDIO_MS) stop(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.durationMillis]);
  return (
    <View style={[styles.bar, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, backgroundColor: t.surface, paddingBottom: bottomInset + space.sm }]}>
      <Pressable onPress={() => stop(false)} accessibilityRole="button" accessibilityLabel="Cancelar gravação" style={[styles.round, { backgroundColor: t.surfaceAlt }]}>
        <Icon name="delete" size={22} color={t.bad} />
      </Pressable>
      <View style={styles.recording} accessibilityLiveRegion="polite" accessibilityLabel={`Gravando áudio, ${clock(state.durationMillis)}`}>
        <View style={[styles.dot, { backgroundColor: t.bad }]} />
        <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "700" }}>{clock(state.durationMillis)}</Text>
        <Text style={{ color: t.muted, fontSize: font.small }}>Gravando… (até 5 min)</Text>
      </View>
      <Pressable onPress={() => stop(true)} accessibilityRole="button" accessibilityLabel="Concluir gravação" style={[styles.round, { backgroundColor: t.accent }]}>
        <Icon name="check" size={24} color={t.onAccent} />
      </Pressable>
    </View>
  );
}

function PendingPreview({ pending, onRemove, busy }: { pending: PendingFile; onRemove: () => void; busy: boolean }) {
  const t = useTheme();
  const detail = pending.kind === "audio" && pending.durationMs ? `Áudio de ${clock(pending.durationMs)}` : [pending.label, fileSizeLabel(pending.size)].filter(Boolean).join(" · ");
  return (
    <View style={[styles.preview, { backgroundColor: t.bg, borderColor: t.line }]} accessible accessibilityLabel={`Anexo pronto para enviar: ${pending.name}`}>
      {pending.previewUri ? <Image source={{ uri: pending.previewUri }} style={styles.previewImage} contentFit="cover" />
        : <View style={[styles.previewIcon, { backgroundColor: t.surfaceAlt }]}><Icon name={pending.kind === "audio" ? "mic" : pending.mimeType === "application/pdf" ? "picture_as_pdf" : "description"} size={26} color={pending.mimeType === "application/pdf" ? t.bad : t.accent} /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.ink, fontSize: font.small, fontWeight: "700" }} numberOfLines={1}>{pending.name}</Text>
        <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={1}>{detail || "Pronto para enviar"}{pending.staged ? " · já no servidor" : ""}</Text>
      </View>
      <Pressable onPress={onRemove} disabled={busy} accessibilityRole="button" accessibilityLabel="Tirar o anexo" hitSlop={10} style={styles.side}>
        <Icon name="close" size={22} color={t.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "flex-end", gap: space.xs, paddingHorizontal: space.sm, paddingTop: space.sm },
  side: { width: 40, height: touch, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: touch, maxHeight: 140, borderWidth: 1, borderRadius: 24, paddingHorizontal: space.lg, paddingVertical: 12, fontSize: font.body },
  round: { width: touch, height: touch, borderRadius: touch / 2, alignItems: "center", justifyContent: "center" },
  recording: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: touch, paddingHorizontal: space.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  suggestions: { gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, maxWidth: 260 },
  preview: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.md, marginTop: space.sm, padding: space.sm, borderWidth: 1, borderRadius: radius.md },
  previewImage: { width: 48, height: 48, borderRadius: radius.sm },
  previewIcon: { width: 48, height: 48, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
});
