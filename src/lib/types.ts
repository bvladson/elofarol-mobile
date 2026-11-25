/** Contratos da API v1 do MAG CRM (/api/crm/v1). Espelham src/lib/crm.ts e crm-pipelines.ts do CRM. */
export type Role = "admin" | "comercial" | string;
export type Feature =
  | "auth.login" | "auth.logout" | "conversations.views" | "conversations.inboxes"
  | "conversations.read" | "messages.send" | "whatsapp.status" | string;

export interface PipelineStage {
  id: string; label: string; color: string; kind: string; category: string; position: number;
  probability: number; wipLimit: number | null; staleDays: number | null; requiredFields: string[];
}
export interface Pipeline { id: string; name: string; scope: string; isDefault: boolean; revision: number; stages: PipelineStage[] }

export interface Me {
  user: { id: string; email: string; roles: Role[] };
  deviceId: string;
  version: number;
  /** Ausente nos servidores anteriores à API do aplicativo (só leitura). */
  features?: Feature[];
  pipelines: Pipeline[];
  defaultPipelineId: string | null;
}

export interface Contact {
  id: string; name: string; company?: string; phone: string; email: string; city: string;
  ownerId: string; ownerName: string; unitId: string | null; revision: number; createdAt: string; updatedAt: string;
}
export interface Attachment { id: string; name: string; mimeType?: string; size?: number; downloadUrl?: string; kind?: string }
export interface Message {
  id: string; from: "cliente" | "vendedora"; text: string; at: string; status: string;
  channel: string; provider: string; externalId: string | null; attachments?: Attachment[];
}
export interface Conversation { id: string; contactId: string; unread: number; messages: Message[]; channel: string }
export type InboxView = "todas" | "responder" | "aguardando" | "retornos" | "proposta";
export interface ContactsPage {
  contacts: Contact[]; conversations: Conversation[]; total: number; hasMore: boolean; nextCursor: string | null;
  viewCounts?: Record<InboxView, number>;
}
export interface MessagesPage { messages: Message[]; hasMore: boolean; nextCursor: string | null }

export interface Opportunity {
  id: string; contactId: string; title: string; interest: string; stage: string; origin: string;
  createdAt: string; lastInteraction: string; awaitingReply: boolean;
  nextAction: { label: string; due: string; taskId?: string };
  notes: string; lossReason?: string; revision: number; ownerId: string; ownerName: string; unitId: string | null;
  quoteIds: string[]; estimatedValueCents: number; pipelineId: string | null; stageId: string | null;
  stageEnteredAt: string | null; position: number | null;
}
export interface OpportunitiesPage { opportunities: Opportunity[]; hasMore: boolean; nextCursor: string | null }
export interface ContactDetail { contact: Contact; opportunities: Opportunity[]; opportunitiesTruncated: boolean; conversation: Conversation }

export interface Task { id: string; opportunityId: string; label: string; due: string; status: "pending" | "done"; createdAt: string; completedAt: string | null }
export interface TasksPage { tasks: Task[]; total: number; hasMore: boolean; nextCursor: string | null }

export interface Inbox { id: string; ownerId: string | null; label: string; hint: string | null; own: boolean }
export interface InboxesResponse { canChoose: boolean; inboxes: Inbox[] }
export interface WhatsappStatus {
  provider: string | null; configured: boolean; connected: boolean; canReply: boolean; ownLine: boolean;
  state: string; message: string | null; phoneHint: string | null;
}
export interface LoginResponse { token: string; device: { id: string; name: string; expiresAt: string }; user: Me["user"] }
export interface SendResponse { message: { id: string; status: string; clientMessageId: string } }

// ---------- Fase 2 (processos comerciais) ----------
export interface StagedAttachment { id: string; name: string; mimeType: string; size: number; kind: "image" | "audio" | "document"; status: string; downloadUrl: string }
export interface QuickReply { id: string; shortcut: string; title: string; text: string }
export interface Binding { opportunityId: string | null; triageReason: string | null; canBind: boolean }
export interface Activity { id: string; kind: string; label: string; at: string; actorName: string }
export type ProposalStatus = "Rascunho" | "Enviada" | "Aceita" | "Recusada" | "Cancelada" | string;
export interface ProposalItem {
  id: string; quoteId: string; number: string; opportunityId: string | null; contactId: string | null; status: ProposalStatus;
  valueCents: number; date: string; version: number | null; customerName: string;
}
export interface OpportunityDetail {
  opportunity: Opportunity; contact: Contact; tasks: Task[]; tasksTruncated: boolean; activities: Activity[]; proposals: ProposalItem[];
}
export interface CatalogItem {
  id: string; sku: string; nome: string; unidade: string; categoria: string; marca: string; imagem: string; foto: string;
  estoque: "PRONTA_ENTREGA" | "DISPONIVEL" | "SOB_CONSULTA" | null; disponivel: number | null; publicado: boolean; inativo: boolean; bloqueado: boolean;
}
export interface CatalogResponse { sincronizadoEm: string | null; total: number; filtros: { id: string; label: string }[]; itens: CatalogItem[] }
export interface DraftItem { produtoId: string; sku: string; nome: string; unidade: string; quantidade: number }
export interface Draft { opportunityId: string; itens: DraftItem[]; revision: number; atualizadoEm: string | null }
export interface CustomerOrder {
  quoteId: string; numeroNegociacao: string; situacaoNegociacao: string;
  pedido: { estado: string; numero: string | null; etapa: string | null; cancelado: boolean; faturado: boolean; consultadoEm: string | null; enviadoEm: string | null; erro: string | null } | null;
}
export interface SiteLead {
  sourceKind: "quote" | "contact"; sourceId: string; protocol: string; name: string; company: string; origin: string; createdAt: string;
  ownerId: string | null; ownerName: string | null; interest: string;
}
export const ORIGINS = ["WhatsApp", "Indicação", "Site", "Anúncio Meta", "Anúncio Google", "Desconhecida"] as const;
export const LOSS_REASONS = ["Preço", "Prazo", "Sem estoque", "Desistiu", "Outro"] as const;
export const REQUIRED_FIELD_LABEL: Record<string, string> = { value: "Valor (proposta ou estimado)", nextAction: "Próxima ação agendada", notes: "Observações preenchidas" };
