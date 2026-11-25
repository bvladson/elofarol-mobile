import { useAudioPlayer, useAudioPlayerStatus, type AudioSource } from "expo-audio";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui";
import { apiUrl, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { downloadToCache, fileSizeLabel, openLocalFile, shareLocalFile } from "@/lib/files";
import { logWarn } from "@/lib/log";
import { font, radius, space, useTheme } from "@/lib/theme";
import type { Attachment } from "@/lib/types";

/** Anexo dentro do balão da conversa: foto (abre em tela cheia), áudio (toca aqui mesmo) ou documento (abre no aparelho). */
export function MessageAttachment({ file }: { file: Attachment }) {
  const kind = file.kind ?? (file.mimeType?.startsWith("image/") ? "image" : file.mimeType?.startsWith("audio/") ? "audio" : "document");
  if (!file.downloadUrl) return <DocumentRow file={file} />;
  if (kind === "image") return <ImageThumb file={file} />;
  if (kind === "audio") return <AudioRow file={file} />;
  return <DocumentRow file={file} />;
}

function useSource(downloadUrl: string) {
  const { server, token } = useAuth();
  return { uri: apiUrl(server.baseUrl, downloadUrl), headers: authHeaders(token) };
}

function ImageThumb({ file }: { file: Attachment }) {
  const t = useTheme();
  const source = useSource(file.downloadUrl!);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return <DocumentRow file={file} />;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel={`Foto ${file.name}. Toque para ampliar`}>
        {/* Só na memória: foto de cliente não fica gravada no aparelho. */}
        <Image source={source} cachePolicy="memory" contentFit="cover" onError={() => setFailed(true)} transition={120}
          style={[styles.thumb, { backgroundColor: t.surfaceAlt }]} />
      </Pressable>
      <ImageViewer visible={open} onClose={() => setOpen(false)} file={file} />
    </>
  );
}

export function ImageViewer({ visible, onClose, file }: { visible: boolean; onClose: () => void; file: Attachment }) {
  const insets = useSafeAreaInsets();
  const { server, token } = useAuth();
  const source = useSource(file.downloadUrl!);
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try { await shareLocalFile(await downloadToCache(server.baseUrl, token, file.downloadUrl!, file.name), file.mimeType || "image/jpeg", "Compartilhar foto"); }
    catch { logWarn("anexo", "compartilhar foto falhou"); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <Image source={source} cachePolicy="memory" contentFit="contain" style={{ flex: 1 }} accessibilityLabel={`Foto ${file.name}`} />
        <View style={[styles.viewerBar, { paddingTop: insets.top + space.sm }]}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={10} style={styles.viewerButton}>
            <Icon name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={{ flex: 1, color: "#fff", fontSize: font.body }} numberOfLines={1}>{file.name}</Text>
          <Pressable onPress={share} disabled={busy} accessibilityRole="button" accessibilityLabel="Compartilhar foto" hitSlop={10} style={styles.viewerButton}>
            {busy ? <ActivityIndicator color="#fff" /> : <Icon name="share" size={24} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const seconds = (value: number) => {
  const total = Math.max(0, Math.round(value || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
/** Áudio: o arquivo só é pedido ao servidor quando a pessoa toca em ouvir. */
function AudioRow({ file }: { file: Attachment }) {
  const t = useTheme();
  const remote = useSource(file.downloadUrl!);
  const [source, setSource] = useState<AudioSource>(null);
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const [wantPlay, setWantPlay] = useState(false);
  useEffect(() => {
    if (wantPlay && status.isLoaded) { player.play(); setWantPlay(false); }
  }, [wantPlay, status.isLoaded, player]);
  useEffect(() => { if (status.didJustFinish) { player.pause(); void player.seekTo(0); } }, [status.didJustFinish, player]);
  const toggle = () => {
    if (!source) { setSource(remote); setWantPlay(true); return; }
    if (status.playing) player.pause(); else player.play();
  };
  const progress = status.duration ? Math.min(1, status.currentTime / status.duration) : 0;
  const loading = Boolean(source) && !status.isLoaded;
  return (
    <View style={[styles.audio, { backgroundColor: t.surfaceAlt }]}>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={status.playing ? "Pausar áudio" : "Ouvir áudio"} hitSlop={8}
        style={[styles.play, { backgroundColor: t.accent }]}>
        {loading ? <ActivityIndicator color={t.onAccent} /> : <Icon name={status.playing ? "pause" : "play_arrow"} size={24} color={t.onAccent} />}
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[styles.track, { backgroundColor: t.line }]}><View style={[styles.trackFill, { width: `${progress * 100}%`, backgroundColor: t.accent }]} /></View>
        <Text style={{ color: t.muted, fontSize: 12 }}>
          {source && status.duration ? `${seconds(status.currentTime)} / ${seconds(status.duration)}` : `Áudio${file.size ? ` · ${fileSizeLabel(file.size)}` : ""}`}
        </Text>
      </View>
    </View>
  );
}

function DocumentRow({ file }: { file: Attachment }) {
  const t = useTheme();
  const { server, token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pdf = file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name);
  const open = async (share = false) => {
    if (!file.downloadUrl || busy) return;
    setBusy(true); setError(false);
    try {
      const local = await downloadToCache(server.baseUrl, token, file.downloadUrl, file.name);
      if (share) await shareLocalFile(local, file.mimeType || "application/octet-stream");
      else await openLocalFile(local, file.mimeType || "application/octet-stream");
    } catch {
      setError(true);
      logWarn("anexo", "abrir documento falhou");
    } finally { setBusy(false); }
  };
  return (
    <Pressable onPress={() => open(false)} onLongPress={() => open(true)} disabled={!file.downloadUrl} accessibilityRole="button"
      accessibilityLabel={`${pdf ? "PDF" : "Documento"} ${file.name}. Toque para abrir; segure para compartilhar`}
      style={[styles.file, { backgroundColor: t.surfaceAlt }]}>
      <Icon name={pdf ? "picture_as_pdf" : "description"} size={26} color={pdf ? t.bad : t.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.ink, fontSize: font.small, fontWeight: "600" }} numberOfLines={2}>{file.name}</Text>
        <Text style={{ color: error ? t.bad : t.muted, fontSize: 12 }}>{error ? "Não abriu. Toque para tentar de novo." : [fileSizeLabel(file.size), file.downloadUrl ? "toque para abrir" : ""].filter(Boolean).join(" · ")}</Text>
      </View>
      {busy ? <ActivityIndicator color={t.accent} /> : file.downloadUrl ? <Icon name="open_in_new" size={20} color={t.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 220, height: 220, maxWidth: "100%", borderRadius: radius.sm },
  viewerBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm, backgroundColor: "rgba(0,0,0,0.45)" },
  viewerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  audio: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.sm, padding: space.sm, minWidth: 220 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  trackFill: { height: 4, borderRadius: 2 },
  file: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.sm, minWidth: 220 },
});
