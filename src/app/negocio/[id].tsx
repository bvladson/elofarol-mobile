import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DateTimeField, MoneyField, SelectField, ToggleRow } from "@/components/forms";
import { ActionSheet, BottomSheet, type SheetAction } from "@/components/sheet";
import { Avatar, Button, Card, ErrorState, Field, Icon, Loading, Notice, Pill, SectionTitle, s } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { useApi, useAuth } from "@/lib/auth";
import { downloadToCache, openLocalFile, shareLocalFile } from "@/lib/files";
import { dueLabel, friendlyName, initials, listStamp, money } from "@/lib/format";
import { useKeyFor, useScope } from "@/lib/queries";
import { font, radius, space, touch, useTheme } from "@/lib/theme";
import { LOSS_REASONS, REQUIRED_FIELD_LABEL, type Draft, type Opportunity, type OpportunityDetail, type PipelineStage, type ProposalItem, type Task } from "@/lib/types";

const inTwoHours = () => { const d = new Date(Date.now() + 2 * 3600_000); d.setMinutes(0, 0, 0); return d; };

/** Ficha do negócio: o mesmo conteúdo da ficha do funil no CRM web, com as ações do dia a dia. */
export default function Negocio() {
  const t = useTheme();
  const call = useApi();
  const scope = useScope();
  const queryClient = useQueryClient();
  const { me, has, server, token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useQuery({ queryKey: ["negocio", ...scope, id], queryFn: () => call<OpportunityDetail>(`opportunities/${id}`), enabled: has("opportunities.detail") });
  const draft = useQuery({ queryKey: ["rascunho", ...scope, id], queryFn: () => call<{ draft: Draft }>(`opportunities/${id}/draft`), enabled: has("drafts.write") });
  const [sheet, setSheet] = useState<null | "mover" | "editar" | "notas" | "retorno" | "proposta">(null);
  const [target, setTarget] = useState<PipelineStage | null>(null);
  const [proposal, setProposal] = useState<ProposalItem | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad" | "neutral"; text: string } | null>(null);
  const [busyFile, setBusyFile] = useState(false);

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["negocio", ...scope, id] });
    void queryClient.invalidateQueries({ queryKey: ["funil"] });
    void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
    void queryClient.invalidateQueries({ queryKey: ["tarefas"] });
    void queryClient.invalidateQueries({ queryKey: ["contato"] });
    void queryClient.invalidateQueries({ queryKey: ["propostas"] });
  };
  const done = (text: string) => { setMessage({ tone: "ok", text }); setSheet(null); refreshAll(); };
  const fail = (error: unknown) => setMessage({ tone: "bad", text: friendlyError(error) });

  const complete = useMutation({
    mutationFn: (task: Task) => call(`tasks/${task.id}/complete`, { method: "POST", body: {}, idempotencyKey: `concluir-${task.id}` }),
    onSuccess: () => done("Tarefa concluída."), onError: fail,
  });
  const quote = useMutation({
    mutationFn: (revision: number) => call<{ quote: { quoteId: string; numero: string; adicionados: number } }>(`opportunities/${id}/draft/quote`, { method: "POST", body: { revision } }),
    onSuccess: (result) => { done(`Orçamento ${result.quote.numero} criado com os produtos. Preço, desconto e condições você completa no CRM web.`); void draft.refetch(); },
    onError: fail,
  });
  const markSent = useMutation({
    mutationFn: (p: ProposalItem) => call(`quotes/${p.quoteId}/proposals/${p.version}/sent`, { method: "POST", body: {} }),
    onSuccess: () => done("Proposta marcada como enviada ao cliente."), onError: fail,
  });

  if (!has("opportunities.detail")) return <ErrorState message="A ficha do negócio fica disponível quando o CRM receber a atualização autorizada do aplicativo." />;
  if (detail.isLoading) return <Loading />;
  if (detail.isError || !detail.data) return <ErrorState message={friendlyError(detail.error)} onRetry={() => detail.refetch()} />;
  const { opportunity: deal, contact, tasks, activities, proposals } = detail.data;
  const pipeline = me?.pipelines.find((p) => p.id === deal.pipelineId);
  const stages = [...(pipeline?.stages ?? [])].sort((a, b) => a.position - b.position);
  const stage = stages.find((st) => st.id === deal.stageId);
  const isOwn = deal.ownerId === me?.user.id;
  const canWrite = has("opportunities.write") && (isOwn || Boolean(me?.user.roles.includes("admin")));
  const closed = deal.stage === "fechado" || deal.stage === "perdido";
  const pending = tasks.filter((task) => task.status === "pending");
  const items = draft.data?.draft.itens ?? [];

  async function openPdf(p: ProposalItem, share: boolean) {
    setBusyFile(true); setMessage(null);
    try {
      const local = await downloadToCache(server.baseUrl, token, `quotes/${p.quoteId}/proposals/${p.version}/pdf${share ? "?modo=compartilhar" : ""}`, `${p.number}-v${p.version}.pdf`);
      if (share) await shareLocalFile(local, "application/pdf", "Compartilhar proposta"); else await openLocalFile(local, "application/pdf");
    } catch (error) {
      setMessage({ tone: "bad", text: error instanceof Error && /Compartilhar não está/.test(error.message) ? error.message : "Não foi possível baixar o PDF. Se a proposta tem desconto aguardando aprovação, compartilhar fica bloqueado até a aprovação." });
    } finally { setBusyFile(false); }
  }
  const proposalActions = (p: ProposalItem): SheetAction[] => [
    { icon: "visibility", label: "Ver o PDF", hint: "Abre no leitor de PDF do aparelho", onPress: () => void openPdf(p, false) },
    ...(has("proposals.share") && isOwn ? [
      { icon: "chat" as const, label: "Enviar na conversa do cliente", hint: "Abre a conversa com o PDF pronto; você revisa e envia", onPress: () => router.push({ pathname: "/conversa/[id]", params: { id: contact.id, name: contact.name, quoteId: p.quoteId, version: String(p.version) } }) },
      { icon: "share" as const, label: "Compartilhar o PDF", hint: "E-mail ou outro aplicativo (só a versão vigente)", onPress: () => void openPdf(p, true) },
      ...(p.status !== "Enviada" && p.status !== "Aceita" ? [{ icon: "mark_email_read" as const, label: "Marcar como enviada ao cliente", hint: "Como no CRM web: a versão deixa de poder ser excluída", onPress: () => markSent.mutate(p) }] : []),
    ] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: deal.title }} />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl * 2 }}
        refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={() => { void detail.refetch(); void draft.refetch(); }} colors={[t.accent]} />}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <Card>
            <Text accessibilityRole="header" style={{ color: t.ink, fontSize: font.h2, fontWeight: "800" }}>{deal.title}</Text>
            <View style={styles.tags}>
              {stage ? <StagePill stage={stage} /> : <Pill label={deal.stage} />}
              {deal.lossReason ? <Pill label={`Motivo: ${deal.lossReason}`} tone="bad" /> : null}
              {deal.awaitingReply && !closed ? <Pill label="Cliente aguardando" tone="accent" /> : null}
            </View>
            <Text style={{ color: t.ink, fontSize: font.h2, fontWeight: "700" }}>{deal.estimatedValueCents ? money(deal.estimatedValueCents) : "Sem valor estimado"}</Text>
            {deal.interest && deal.interest !== deal.title ? <Text style={{ color: t.muted, fontSize: font.body }}>{deal.interest}</Text> : null}
            <Pressable onPress={() => router.push({ pathname: "/cliente/[id]", params: { id: contact.id } })} accessibilityRole="button" accessibilityLabel={`Cliente ${contact.name}. Abrir`}
              style={[styles.client, { borderTopColor: t.line }]}>
              <Avatar label={initials(contact.name)} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: t.ink, fontWeight: "700", fontSize: font.body }} numberOfLines={1}>{contact.name}</Text>
                <Text style={{ color: t.muted, fontSize: font.small }} numberOfLines={1}>{[contact.company, pipeline?.name, !isOwn ? `Carteira: ${friendlyName(deal.ownerName)}` : ""].filter(Boolean).join(" · ")}</Text>
              </View>
              <Icon name="chevron_right" size={22} color={t.muted} />
            </Pressable>
          </Card>
          <View style={styles.actions}>
            <QuickAction icon="chat" label="Conversa" onPress={() => router.push({ pathname: "/conversa/[id]", params: { id: contact.id, name: contact.name } })} />
            {has("opportunities.stage") && canWrite ? <QuickAction icon="swap_horiz" label="Mover" onPress={() => setSheet("mover")} /> : null}
            {has("tasks.write") && canWrite ? <QuickAction icon="event" label="Retorno" onPress={() => setSheet("retorno")} /> : null}
            {canWrite ? <QuickAction icon="edit" label="Editar" onPress={() => setSheet("editar")} /> : null}
          </View>
          {message ? <Notice tone={message.tone === "ok" ? "ok" : message.tone === "bad" ? "bad" : "neutral"} icon={message.tone === "ok" ? "check_circle" : "info"} text={message.text} /> : null}
          {busyFile ? <Notice tone="neutral" icon="download" text="Baixando o PDF…" /> : null}
        </View>

        <SectionTitle>{`Tarefas e retornos · ${pending.length}`}</SectionTitle>
        <View style={styles.pad}>
          {pending.length ? pending.map((task) => (
            <View key={task.id} style={[styles.row, { backgroundColor: t.surface, borderColor: t.line }]}>
              <Pressable onPress={() => complete.mutate(task)} disabled={complete.isPending || !canWrite} accessibilityRole="checkbox" accessibilityState={{ checked: false }}
                accessibilityLabel={`Concluir: ${task.label}`} style={styles.check} hitSlop={6}>
                <Icon name={complete.isPending && complete.variables?.id === task.id ? "hourglass_empty" : "radio_button_unchecked"} size={26} color={t.accent} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "600" }}>{task.label}</Text>
                <Text style={{ color: new Date(task.due) < new Date() ? t.bad : t.muted, fontSize: 12 }}>{dueLabel(task.due)}</Text>
              </View>
            </View>
          )) : <Text style={{ color: t.muted, fontSize: font.small }}>Nenhum retorno agendado.{has("tasks.write") && canWrite ? " Toque em Retorno para agendar." : ""}</Text>}
        </View>

        <SectionTitle>Observações internas</SectionTitle>
        <View style={styles.pad}>
          <Pressable onPress={() => canWrite && setSheet("notas")} disabled={!canWrite} accessibilityRole="button" accessibilityLabel="Editar observações"
            style={[styles.notes, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Text style={{ color: deal.notes ? t.ink : t.muted, fontSize: font.body, flex: 1 }}>{deal.notes || "Sem observações. Toque para escrever (só a equipe vê)."}</Text>
            {canWrite ? <Icon name="edit" size={20} color={t.muted} /> : null}
          </Pressable>
        </View>

        {has("proposals.read") ? (
          <>
            <SectionTitle>{`Propostas · ${proposals.length}`}</SectionTitle>
            <View style={styles.pad}>
              {proposals.length ? proposals.map((p) => (
                <Pressable key={p.id} onPress={() => { if (p.version) { setProposal(p); setSheet("proposta"); } }} disabled={!p.version} accessibilityRole="button"
                  accessibilityLabel={`Proposta ${p.number}, ${p.status}${p.version ? `, versão ${p.version}` : ", sem PDF ainda"}`}
                  style={[styles.row, { backgroundColor: t.surface, borderColor: t.line }]}>
                  <Icon name="request_quote" size={26} color={t.accent} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "700" }} numberOfLines={1}>{p.number}{p.version ? ` · v${p.version}` : ""}</Text>
                    <Text style={{ color: t.muted, fontSize: font.small }}>{p.version ? `${money(p.valueCents)} · ${listStamp(p.date)}` : "Sem versão gerada (gere no CRM web)"}</Text>
                  </View>
                  <Pill label={p.status} tone={p.status === "Aceita" ? "ok" : p.status === "Recusada" || p.status === "Cancelada" ? "bad" : p.status === "Enviada" ? "accent" : "neutral"} />
                </Pressable>
              )) : <Text style={{ color: t.muted, fontSize: font.small }}>Nenhuma proposta neste negócio. Monte os produtos abaixo e gere o orçamento.</Text>}
            </View>
          </>
        ) : null}

        {has("drafts.write") ? (
          <>
            <SectionTitle>{`Produtos para o orçamento · ${items.length}`}</SectionTitle>
            <View style={[styles.pad, { gap: space.sm }]}>
              {items.map((item) => (
                <View key={item.produtoId} style={[styles.row, { backgroundColor: t.surface, borderColor: t.line }]}>
                  <Icon name="chair" size={22} color={t.muted} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: t.ink, fontSize: font.body, fontWeight: "600" }} numberOfLines={2}>{item.nome}</Text>
                    <Text style={{ color: t.muted, fontSize: 12 }}>{item.sku}</Text>
                  </View>
                  <Text style={{ color: t.ink, fontWeight: "700" }}>{String(item.quantidade).replace(".", ",")} {item.unidade}</Text>
                </View>
              ))}
              {canWrite && !closed ? (
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <View style={{ flex: 1 }}><Button label={items.length ? "Ajustar produtos" : "Adicionar produtos"} icon="add_shopping_cart" kind="secondary"
                    onPress={() => router.push({ pathname: "/catalogo", params: { opportunityId: deal.id } })} /></View>
                  {items.length ? <View style={{ flex: 1 }}><Button label="Gerar orçamento" icon="receipt_long" busy={quote.isPending}
                    onPress={() => quote.mutate(draft.data!.draft.revision)} /></View> : null}
                </View>
              ) : null}
              {closed ? <Text style={{ color: t.muted, fontSize: font.small }}>Negócio encerrado: reabra para montar produtos.</Text> : null}
            </View>
          </>
        ) : null}

        <SectionTitle>Histórico</SectionTitle>
        <View style={[styles.pad, { gap: 0 }]}>
          {activities.slice(0, 40).map((a, index) => (
            <View key={a.id} style={styles.timeline}>
              <View style={{ alignItems: "center", width: 16 }}>
                <View style={[styles.timelineDot, { backgroundColor: index === 0 ? t.accent : t.line }]} />
                {index < Math.min(activities.length, 40) - 1 ? <View style={[styles.timelineLine, { backgroundColor: t.line }]} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: space.md }}>
                <Text style={{ color: t.ink, fontSize: font.small }}>{a.label}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{listStamp(a.at)} · {friendlyName(a.actorName)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* A chave com a versão do negócio recria os formulários com os dados atuais depois de cada mudança. */}
      <MoveSheet key={`mover-${deal.revision}`} visible={sheet === "mover"} onClose={() => { setSheet(null); setTarget(null); }} deal={deal} stages={stages} target={target} onTarget={setTarget}
        onMoved={(label) => { setTarget(null); done(`Negócio movido para ${label}.`); }} />
      <EditSheet key={`editar-${deal.revision}`} visible={sheet === "editar"} onClose={() => setSheet(null)} deal={deal} onSaved={() => done("Negócio atualizado.")} />
      <NotesSheet key={`notas-${deal.revision}`} visible={sheet === "notas"} onClose={() => setSheet(null)} deal={deal} onSaved={() => done("Observações salvas.")} />
      <TaskSheet visible={sheet === "retorno"} onClose={() => setSheet(null)} deal={deal} onSaved={() => done("Retorno agendado.")} />
      {proposal ? <ActionSheet visible={sheet === "proposta"} onClose={() => setSheet(null)} title={`Proposta ${proposal.number} · v${proposal.version}`} actions={proposalActions(proposal)} /> : null}
    </View>
  );
}

function StagePill({ stage }: { stage: PipelineStage }) {
  const t = useTheme();
  return (
    <View style={[s.pill, { backgroundColor: t.surfaceAlt, flexDirection: "row", alignItems: "center", gap: 6 }]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: stage.color || t.muted }} />
      <Text style={[s.pillText, { color: t.ink }]}>{stage.label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: "chat" | "swap_horiz" | "event" | "edit"; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} android_ripple={{ color: t.line }}
      style={[styles.quick, { backgroundColor: t.surface, borderColor: t.line }]}>
      <Icon name={icon} size={22} color={t.accent} />
      <Text style={{ color: t.ink, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/** Mover etapa: os campos obrigatórios da etapa de destino (e o motivo da perda) são pedidos no mesmo passo, como no web. */
function MoveSheet({ visible, onClose, deal, stages, target, onTarget, onMoved }: {
  visible: boolean; onClose: () => void; deal: Opportunity; stages: PipelineStage[]; target: PipelineStage | null;
  onTarget: (stage: PipelineStage | null) => void; onMoved: (label: string) => void;
}) {
  const t = useTheme();
  const call = useApi();
  const [value, setValue] = useState(deal.estimatedValueCents);
  const [notes, setNotes] = useState(deal.notes);
  const [label, setLabel] = useState("");
  const [due, setDue] = useState(inTwoHours);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keyFor = useKeyFor();
  const needs = (field: string) => Boolean(target?.requiredFields.includes(field)) && (
    field === "value" ? !deal.estimatedValueCents : field === "nextAction" ? !deal.nextAction.due : field === "notes" ? !deal.notes.trim() : false);
  const lost = target?.kind === "lost";
  const formNeeded = Boolean(target) && (lost || ["value", "nextAction", "notes"].some(needs));

  async function move(stage: PipelineStage) {
    setBusy(true); setError(null);
    try {
      const fields: Record<string, unknown> = {};
      if (needs("value")) fields.estimatedValueCents = value;
      if (needs("notes")) fields.notes = notes;
      if (needs("nextAction")) fields.nextAction = { label: label.trim(), due: due.toISOString() };
      const body = { revision: deal.revision, pipelineId: deal.pipelineId ?? undefined, stageId: stage.id,
        ...(stage.kind === "lost" ? { lossReason: reason } : {}), ...(Object.keys(fields).length ? { fields } : {}) };
      await call(`opportunities/${deal.id}/stage`, { method: "POST", idempotencyKey: keyFor(body), body });
      onMoved(stage.label);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  const choose = (stage: PipelineStage) => {
    setError(null);
    onTarget(stage);
    const required = stage.kind === "lost" || stage.requiredFields.some((field) =>
      field === "value" ? !deal.estimatedValueCents : field === "nextAction" ? !deal.nextAction.due : field === "notes" ? !deal.notes.trim() : false);
    if (!required) void move(stage);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title={formNeeded && target ? `Mover para ${target.label}` : "Mover para a etapa"}
      subtitle={formNeeded ? "Esta etapa pede algumas informações antes." : undefined}
      footer={formNeeded && target ? <>
        {error ? <Notice tone="bad" text={error} /> : null}
        <Button label={`Mover para ${target.label}`} icon="check" busy={busy}
          disabled={(lost && !reason) || (needs("nextAction") && !label.trim()) || (needs("value") && !value) || (needs("notes") && !notes.trim())}
          onPress={() => void move(target)} />
        <Button label="Escolher outra etapa" kind="ghost" onPress={() => onTarget(null)} />
      </> : error ? <Notice tone="bad" text={error} /> : undefined}>
      {formNeeded && target ? (
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          {lost ? <SelectField label="Motivo da perda" value={reason} onChange={setReason} options={LOSS_REASONS.map((r) => ({ value: r, label: r }))} /> : null}
          {needs("value") ? <MoneyField label={REQUIRED_FIELD_LABEL.value!} cents={value} onChange={setValue} /> : null}
          {needs("nextAction") ? <>
            <Field label="Próxima ação" value={label} onChangeText={setLabel} placeholder="Ex.: Ligar para confirmar a proposta" maxLength={240} />
            <DateTimeField label="Quando" value={due} onChange={setDue} />
          </> : null}
          {needs("notes") ? <Field label={REQUIRED_FIELD_LABEL.notes!} value={notes} onChangeText={setNotes} multiline maxLength={5000} style={{ minHeight: 96, textAlignVertical: "top", paddingTop: 12 }} /> : null}
        </View>
      ) : stages.map((stage) => {
        const current = stage.id === deal.stageId;
        return (
          <Pressable key={stage.id} onPress={() => !current && !busy && choose(stage)} disabled={current || busy} android_ripple={{ color: t.line }}
            accessibilityRole="button" accessibilityState={{ selected: current, disabled: current }} style={[s.sheetRow, current && { backgroundColor: t.accentSoft }]}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: stage.color || t.muted }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: font.body, fontWeight: current ? "700" : "500" }}>{stage.label}</Text>
              <Text style={{ color: t.muted, fontSize: font.small }}>
                {current ? "Etapa atual" : stage.kind === "lost" ? "Pede o motivo da perda" : stage.requiredFields.length ? `Pede: ${stage.requiredFields.map((f) => REQUIRED_FIELD_LABEL[f] ?? f).join(", ")}` : `${stage.probability}% de chance`}
              </Text>
            </View>
            {current ? <Icon name="check" size={22} color={t.accent} /> : busy && target?.id === stage.id ? <Icon name="hourglass_empty" size={22} color={t.muted} /> : null}
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

function EditSheet({ visible, onClose, deal, onSaved }: { visible: boolean; onClose: () => void; deal: Opportunity; onSaved: () => void }) {
  const call = useApi();
  const [title, setTitle] = useState(deal.title);
  const [interest, setInterest] = useState(deal.interest);
  const [value, setValue] = useState(deal.estimatedValueCents);
  const [awaiting, setAwaiting] = useState(deal.awaitingReply);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keyFor = useKeyFor();
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = { revision: deal.revision, title: title.trim(), interest: interest.trim(), estimatedValueCents: value, awaitingReply: awaiting };
      await call(`opportunities/${deal.id}`, { method: "PATCH", idempotencyKey: keyFor(body), body });
      onSaved();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Editar negócio"
      footer={<>{error ? <Notice tone="bad" text={error} /> : null}<Button label="Salvar" icon="check" busy={busy} disabled={!title.trim()} onPress={() => void save()} /></>}>
      <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
        <Field label="Título" value={title} onChangeText={setTitle} maxLength={240} />
        <Field label="Interesse do cliente" value={interest} onChangeText={setInterest} multiline maxLength={3000} style={{ minHeight: 80, textAlignVertical: "top", paddingTop: 12 }} />
        <MoneyField label="Valor estimado" cents={value} onChange={setValue} hint="Quando há proposta, o funil usa o valor da proposta." />
        <ToggleRow label="Cliente aguardando resposta" hint="Aparece em Responder no Meu dia" value={awaiting} onChange={setAwaiting} />
      </View>
    </BottomSheet>
  );
}

function NotesSheet({ visible, onClose, deal, onSaved }: { visible: boolean; onClose: () => void; deal: Opportunity; onSaved: () => void }) {
  const t = useTheme();
  const call = useApi();
  const [notes, setNotes] = useState(deal.notes);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keyFor = useKeyFor();
  const save = async () => {
    setBusy(true); setError(null);
    try { const body = { revision: deal.revision, notes }; await call(`opportunities/${deal.id}`, { method: "PATCH", idempotencyKey: keyFor(body), body }); onSaved(); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Observações internas" subtitle="Só a equipe vê. Não vão para o cliente."
      footer={<>{error ? <Notice tone="bad" text={error} /> : null}<Button label="Salvar observações" icon="check" busy={busy} onPress={() => void save()} /></>}>
      <View style={{ paddingHorizontal: space.lg }}>
        <TextInput value={notes} onChangeText={setNotes} multiline maxLength={5000} autoFocus placeholder="Ex.: prefere entrega pela manhã; decisão com o sócio" placeholderTextColor={t.muted}
          accessibilityLabel="Observações internas" style={[s.input, { minHeight: 160, textAlignVertical: "top", paddingTop: 12, color: t.ink, backgroundColor: t.bg, borderColor: t.line }]} />
      </View>
    </BottomSheet>
  );
}

function TaskSheet({ visible, onClose, deal, onSaved }: { visible: boolean; onClose: () => void; deal: Opportunity; onSaved: () => void }) {
  const call = useApi();
  const [label, setLabel] = useState("");
  const [due, setDue] = useState(inTwoHours);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keyFor = useKeyFor();
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = { opportunityId: deal.id, label: label.trim(), due: due.toISOString() };
      await call("tasks", { method: "POST", idempotencyKey: keyFor(body), body });
      setLabel(""); onSaved();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  const SUGESTOES = ["Ligar para o cliente", "Enviar proposta", "Confirmar medidas", "Cobrar retorno da proposta"];
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Agendar retorno"
      footer={<>{error ? <Notice tone="bad" text={error} /> : null}<Button label="Agendar" icon="event_available" busy={busy} disabled={!label.trim()} onPress={() => void save()} /></>}>
      <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
        <Field label="O que fazer" value={label} onChangeText={setLabel} placeholder="Ex.: Ligar para confirmar a planta" maxLength={240} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {SUGESTOES.map((text) => <SuggestionChip key={text} text={text} onPress={() => setLabel(text)} />)}
        </View>
        <DateTimeField label="Quando" value={due} onChange={setDue} />
      </View>
    </BottomSheet>
  );
}
function SuggestionChip({ text, onPress }: { text: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ borderWidth: 1, borderColor: t.line, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, minHeight: 36, justifyContent: "center" }}>
      <Text style={{ color: t.ink, fontSize: font.small }}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  client: { flexDirection: "row", alignItems: "center", gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, marginTop: space.xs },
  actions: { flexDirection: "row", gap: space.sm },
  quick: { flex: 1, minHeight: 64, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center", gap: 4 },
  pad: { paddingHorizontal: space.lg, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, minHeight: touch },
  check: { width: touch, height: touch, alignItems: "center", justifyContent: "center" },
  notes: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  timeline: { flexDirection: "row", gap: space.sm },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, marginTop: 2 },
});
