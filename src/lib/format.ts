/** Formatação em pt-BR, fuso de São Paulo/Fortaleza tratado pelo próprio aparelho. */
const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const parseDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const dayDiff = (d: Date, ref = new Date()) => Math.round((startOfDay(d).getTime() - startOfDay(ref).getTime()) / 86400000);

export const time = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const shortDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
export const longToday = (d = new Date()) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;

/** "14:32", "ontem", "seg." ou "12/11": como nas listas de conversa. */
export function listStamp(iso: string | null | undefined) {
  const d = parseDate(iso);
  if (!d) return "";
  const diff = dayDiff(d);
  if (diff === 0) return time(d);
  if (diff === -1) return "ontem";
  if (diff > -7 && diff < 0) return `${WEEKDAYS[d.getDay()]!.slice(0, 3)}.`;
  return shortDate(d);
}
/** Prazo de tarefa: "atrasada há 2 dias", "hoje, 15:00", "amanhã, 09:00", "qui., 28/11". */
export function dueLabel(iso: string) {
  const d = parseDate(iso);
  if (!d) return "";
  const diff = dayDiff(d);
  if (diff < 0) return diff === -1 ? "atrasada desde ontem" : `atrasada há ${-diff} dias`;
  if (diff === 0) return `hoje, ${time(d)}`;
  if (diff === 1) return `amanhã, ${time(d)}`;
  return `${WEEKDAYS[d.getDay()]!.slice(0, 3)}., ${shortDate(d)}`;
}
export function dayHeading(iso: string) {
  const d = parseDate(iso);
  if (!d) return "";
  const diff = dayDiff(d);
  if (diff === 0) return "Hoje";
  if (diff === -1) return "Ontem";
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` de ${d.getFullYear()}` : ""}`;
}
export const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
/** Nome amigável de uma pessoa da equipe: quem não tem nome cadastrado vem pelo e-mail; mostra o nome antes do @. */
export function friendlyName(label: string) {
  if (!label.includes("@")) return label;
  const nome = (label.split("@")[0] ?? "").split(/[._-]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return nome || label;
}
export const money = (cents: number) =>
  `R$ ${(cents / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
export function phoneLabel(phone: string) {
  const d = phone.replace(/\D/g, "");
  const local = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}
