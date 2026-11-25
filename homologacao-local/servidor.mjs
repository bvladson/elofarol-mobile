// Homologação LOCAL do aplicativo: a API v1 REAL do MAG CRM (código do branch app-mobile-api-v1) rodando no PC,
// com banco próprio e DADOS FICTÍCIOS, e um WhatsApp (WAHA) simulado que só registra os envios.
// Nada aqui acessa a produção nem a internet: qualquer fetch para fora do WAHA simulado é recusado.
//
// Uso:  npm run homologacao            (porta 3100)
//       adb reverse tcp:3100 tcp:3100  (o aparelho/emulador alcança o PC pelo cabo USB)
//  No app (desenvolvimento ou pacote .hml): Servidor = "Homologação local".
// Variáveis: CRM_DIR (cópia do CRM com a API do app), PORTA, DADOS (pasta do banco fictício).
// Controle da simulação SÓ no PC, na porta PORTA+1 (3101), que NÃO é encaminhada ao aparelho:
//   GET  /estado                          modo atual, envios e tentativas ao WAHA simulado
//   POST /simular?modo=normal|incerto|numero|linha|lento[&ms=15000]
//        incerto = o WAHA não responde ao envio (send_uncertain); numero = falha ao confirmar o número (not_sent);
//        linha = linha fora do ar (line_unavailable); lento = o envio demora (para fechar o app no meio)
//   POST /revogar-aparelhos?conta=vendedora|vendedor2|admin   revoga no servidor os aparelhos ativos da conta
//   GET  /contatos                        ids fictícios (um da vendedora e um de outra carteira)
import { createServer } from "node:http";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CRM_DIR = resolve(process.env.CRM_DIR || "../mag-site-crm");
const PORTA = Number(process.env.PORTA || 3100);
const DADOS = resolve(process.env.DADOS || join(AQUI, "dados"));
mkdirSync(DADOS, { recursive: true });
process.env.SITE_DATA_DIR = DADOS;
process.env.CRM_DISABLE_WORKER = "1";
// Fase 2: o catálogo e o PDF da proposta usam módulos que o Vite empacota no CRM; no Node puro, o gancho de testes do
// próprio CRM resolve os atalhos "@/" e as importações sem extensão. O PDF procura o logotipo a partir da pasta do CRM.
const GANCHO = join(CRM_DIR, "tests", "fixtures", "node-alias-hook.mjs");
if (existsSync(GANCHO)) register(pathToFileURL(GANCHO).href);
process.chdir(CRM_DIR);
// Catálogo FICTÍCIO (mesmo formato do arquivo que a VPS sincroniza à noite), só neste PC.
process.env.OMIE_CATALOG_PATH = join(DADOS, "catalogo-ficticio.json");
process.env.OMIE_INDICE_DIR = join(DADOS, "interno");
process.env.OMIE_IMAGE_DIR = join(DADOS, "fotos");
const SEM_FOTO = "/images/product-placeholder.svg";
const produto = (id, slug, sku, name, category, stock, available) => ({ id, slug, sku, name, category, stock, available, environments: [], brand: "MAG", line: "",
  color: "", image: SEM_FOTO, images: [SEM_FOTO], price: null, unit: "UN", description: "Produto fictício da homologação local" });
if (!existsSync(process.env.OMIE_CATALOG_PATH)) writeFileSync(process.env.OMIE_CATALOG_PATH, JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), products: [
  produto("9001", "cadeira-ergonomica-hml", "HML-CAD-01", "Cadeira ergonômica Diretor (fictícia)", "cadeiras", "PRONTA_ENTREGA", 18),
  produto("9002", "cadeira-interlocutor-hml", "HML-CAD-02", "Cadeira interlocutor fixa (fictícia)", "cadeiras", "DISPONIVEL", 6),
  produto("9003", "estacao-trabalho-hml", "HML-EST-03", "Estação de trabalho 1,40 m (fictícia)", "estacoes", "PRONTA_ENTREGA", 9),
  produto("9004", "mesa-reuniao-hml", "HML-MES-04", "Mesa de reunião 2,40 m (fictícia)", "mesas", "SOB_CONSULTA", null),
  produto("9005", "armario-alto-hml", "HML-ARM-05", "Armário alto 2 portas (fictício)", "armazenamento", "DISPONIVEL", 4),
  produto("9006", "gaveteiro-hml", "HML-GAV-06", "Gaveteiro volante 3 gavetas (fictício)", "armazenamento", "PRONTA_ENTREGA", 22),
] }));

// ---------- WhatsApp simulado (no próprio processo) ----------
const WAHA = "http://waha.homologacao.local:3000";
const envios = [], tentativas = [];
let sequencia = 0, modo = process.env.SIMULAR_WAHA_INCERTO === "1" ? "incerto" : "normal", atrasoMs = 0;
const resposta = (valor, status = 200) => new Response(JSON.stringify(valor), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (url, options = {}) => {
  const alvo = new URL(String(url));
  if (alvo.origin !== WAHA) throw new Error(`homologação local: acesso externo bloqueado (${alvo.origin})`);
  if (/^\/api\/sessions\/[^/]+$/.test(alvo.pathname) && (!options.method || options.method === "GET")) {
    if (modo === "linha") throw new Error("linha fora do ar (simulado)");
    return resposta({ name: alvo.pathname.split("/").pop(), status: "WORKING", me: { id: "5585999990001@c.us" }, config: { noweb: { store: { enabled: true, fullSync: false } } } });
  }
  if (alvo.pathname === "/api/contacts") return resposta({ name: "Contato fictício" });
  if (alvo.pathname === "/api/contacts/check-exists") {
    if (modo === "numero") throw new Error("número não confirmado (simulado)");
    return resposta({ numberExists: true, chatId: alvo.searchParams.get("phone") + "@c.us" });
  }
  if (["/api/sendText", "/api/sendImage", "/api/sendFile", "/api/sendVoice"].includes(alvo.pathname)) {
    tentativas.push({ quando: new Date().toISOString(), caminho: alvo.pathname, modo });
    console.log(`  [WAHA simulado] tentativa de envio nº ${tentativas.length} (${alvo.pathname}, modo ${modo})`);
    if (modo === "incerto") throw new Error("tempo esgotado (simulado)");
    if (modo === "lento") await new Promise((ok) => setTimeout(ok, atrasoMs));
    envios.push({ quando: new Date().toISOString(), caminho: alvo.pathname });
    console.log(`  [WAHA simulado] envio nº ${envios.length} confirmado`);
    return resposta({ id: `hml-local-${++sequencia}` });
  }
  return resposta({ error: "não simulado" }, 404);
};

const lib = (nome) => import(pathToFileURL(join(CRM_DIR, "src", "lib", nome)).href);
const db = await lib("local-db.server.ts");
const auth = await lib("local-auth-core.server.ts");
const crm = await lib("crm.server.ts");
const waha = await lib("crm-waha.server.ts");
const mobile = await lib("crm-mobile.server.ts");
const { handleCrmMobileApi } = await lib("crm-mobile-api.server.ts");

// ---------- dados fictícios (só na primeira vez) ----------
export const CONTAS = {
  admin: { email: "admin@homologacao.local", senha: "Homologacao-Admin-2026", perfis: ["admin"] },
  vendedora: { email: "vendedora@homologacao.local", senha: "Homologacao-Vendas-2026", perfis: ["comercial"] },
  vendedor2: { email: "vendedor2@homologacao.local", senha: "Homologacao-Vendas-2026", perfis: ["comercial"] },
};
const vazio = Number(db.getDb().prepare("SELECT count(*) n FROM users").get().n) === 0;
if (vazio) {
  const pessoa = async ({ email, senha, perfis }) => ({ id: (await auth.createUser(email, senha, perfis)).id, email, roles: perfis, created_at: "" });
  const admin = await pessoa(CONTAS.admin), vendedora = await pessoa(CONTAS.vendedora), vendedor2 = await pessoa(CONTAS.vendedor2);
  waha.saveWahaSettings(admin, { revision: 0, enabled: true, baseUrl: WAHA, apiKey: "chave-ficticia-homologacao", hmacKey: "hmac-ficticio-homologacao" });
  await waha.saveWahaLine(admin, { userId: vendedora.id, expectedPhone: "5585999990001", session: "mag-hml-local" });
  const agora = Date.now(), h = 3600_000, d = 24 * h;
  const quando = (ms) => new Date(agora + ms).toISOString();
  const clientes = [
    { nome: "Ana Ribeiro", empresa: "Escritório Alfa", cidade: "Fortaleza", negocio: "Estações de trabalho — 12 lugares", valor: 4_850_000,
      conversa: [["cliente", "Bom dia! Vocês fazem projeto para escritório de 12 pessoas?", -26 * h], ["vendedora", "Bom dia, Ana! Fazemos sim. Pode me passar a planta?", -25.5 * h, "read"], ["cliente", "Mandei por e-mail agora. Quero ver opções de cadeira também.", -40 * 60_000]],
      tarefas: [["Enviar proposta das estações", -1 * d], ["Ligar para confirmar a planta", 2 * h]] },
    { nome: "Bruno Carvalho", empresa: "Clínica Beta", cidade: "Eusébio", negocio: "Recepção completa", valor: 1_920_000,
      conversa: [["vendedora", "Bruno, segue o orçamento da recepção.", -3 * d, "delivered"], ["cliente", "Obrigado! Vou ver com meu sócio.", -2.9 * d]],
      tarefas: [["Retornar sobre o orçamento da recepção", 3 * h]] },
    { nome: "Carla Mendes", empresa: "Construtora Gama", cidade: "Maracanaú", negocio: "Mobiliário do stand de vendas", valor: 7_300_000,
      conversa: [["cliente", "Preciso de prazo de entrega para o dia 15.", -15 * 60_000], ["cliente", "Consegue me responder hoje?", -10 * 60_000]],
      tarefas: [["Confirmar prazo com a fábrica", 1 * d]] },
    { nome: "Diego Souza", empresa: "", cidade: "Fortaleza", negocio: "Cadeira ergonômica para home office", valor: 189_000,
      conversa: [["vendedora", "Diego, a cadeira chega na sexta.", -6 * d, "read"]],
      tarefas: [["Pós-venda: confirmar entrega", 4 * d]] },
    { nome: "Elisa Martins", empresa: "Coworking Delta", cidade: "Aquiraz", negocio: "Mesas de reunião", valor: 2_640_000,
      conversa: [["cliente", "Oi! Vi as mesas no site. Têm pronta entrega?", -2 * d], ["vendedora", "Oi, Elisa! Temos a de 2,40 m. Te mando fotos.", -1.9 * d, "sent"]],
      tarefas: [] },
  ];
  let n = 0;
  for (const c of clientes) {
    n++;
    const contato = crm.createContact(vendedora, { name: c.nome, company: c.empresa, phone: `55859991100${String(n).padStart(2, "0")}`, email: `${c.nome.split(" ")[0].toLowerCase()}@exemplo.invalid`, city: c.cidade });
    const op = crm.createOpportunity(vendedora, { contactId: contato.id, title: c.negocio, origin: "WhatsApp", interest: c.negocio });
    db.getDb().prepare("UPDATE crm_opportunities SET estimated_value_cents=? WHERE id=?").run(c.valor, op.id); // só no banco fictício
    c.conversa.forEach(([de, texto, ms, status], i) => crm.recordCrmMessage({ contactId: contato.id, provider: "waha", account: "mag-hml-local", externalId: `seed-${n}-${i}`,
      from: de, text: texto, at: quando(ms), channel: "whatsapp", status: status ?? (de === "cliente" ? "received" : "sent"), historical: de === "vendedora" }));
    for (const [rotulo, ms] of c.tarefas) crm.scheduleTask(vendedora, { opportunityId: op.id, label: rotulo, due: quando(ms) });
  }
  // As duas primeiras conversas foram lidas; as outras ficam como não lidas (como "Responder" no Atendimento).
  const [primeiro, segundo] = db.getDb().prepare("SELECT id FROM crm_contacts WHERE owner_id=? ORDER BY created_at LIMIT 2").all(vendedora.id);
  for (const linha of [primeiro, segundo]) if (linha) crm.markCrmRead(vendedora, linha.id);
  const outro = crm.createContact(vendedor2, { name: "Fábio Nogueira", company: "Loja Épsilon", phone: "5585999220001", city: "Fortaleza" });
  crm.createOpportunity(vendedor2, { contactId: outro.id, title: "Balcões de atendimento", origin: "Site" });
  crm.recordCrmMessage({ contactId: outro.id, provider: "test", account: "x", externalId: "seed-outra-carteira", from: "cliente", text: "Mensagem da carteira de outro vendedor", at: quando(-h), channel: "whatsapp", status: "received" });
  console.log("Dados fictícios criados.");
}

// ---------- fase 2 (só na primeira vez): proposta com PDF e pedido do site, tudo FICTÍCIO ----------
const pessoaDb = (email) => {
  const linha = db.getDb().prepare("SELECT id,email,roles,created_at FROM users WHERE email=?").get(email);
  return linha ? { id: String(linha.id), email: String(linha.email), roles: JSON.parse(String(linha.roles)), created_at: String(linha.created_at) } : null;
};
if (Number(db.getDb().prepare("SELECT count(*) n FROM internal_quotes").get().n) === 0) {
  const orc = await lib("orcamentos.server.ts");
  const prop = await lib("propostas.server.ts");
  const assignments = await lib("assignments.server.ts");
  const units = await lib("units.server.ts");
  const { hojeFortaleza } = await lib("orcamento-regras.ts");
  const admin = pessoaDb(CONTAS.admin.email), vendedora = pessoaDb(CONTAS.vendedora.email);
  const agoraIso = new Date().toISOString();
  db.getDb().prepare("INSERT OR IGNORE INTO omie_sellers(omie_seller_id,name,email,inactive,last_synced_at) VALUES ('9990001','VENDEDORA HOMOLOGACAO',NULL,0,?)").run(agoraIso);
  db.getDb().prepare("INSERT OR IGNORE INTO seller_links(user_id,omie_seller_id,confirmed_by,confirmed_at) VALUES (?,?,?,?)").run(vendedora.id, "9990001", admin.id, agoraIso);
  db.getDb().prepare("INSERT OR IGNORE INTO omie_refs(kind,code,label,extra,inactive,synced_at) VALUES ('conta','1000000001','Conta ficticia','{}',0,?)").run(agoraIso);
  db.getDb().prepare("INSERT OR IGNORE INTO omie_refs(kind,code,label,extra,inactive,synced_at) VALUES ('forma_pagamento','000','A Vista','{}',0,?)").run(agoraIso);
  const ana = db.getDb().prepare("SELECT id FROM crm_contacts WHERE owner_id=? AND name='Ana Ribeiro'").get(vendedora.id);
  const negocio = ana && db.getDb().prepare("SELECT id FROM crm_opportunities WHERE contact_id=? ORDER BY created_at LIMIT 1").get(ana.id);
  if (negocio) {
    const produtos = [
      { id: "9001", sku: "HML-CAD-01", nome: "Cadeira ergonômica Diretor (fictícia)", unidade: "UN", slug: "cadeira-ergonomica-hml" },
      { id: "9003", sku: "HML-EST-03", nome: "Estação de trabalho 1,40 m (fictícia)", unidade: "UN", slug: "estacao-trabalho-hml" },
    ];
    const quote = crm.createQuoteForOpportunity(vendedora, { opportunityId: negocio.id }, produtos);
    const amanha = new Date(Date.parse(`${hojeFortaleza()}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
    orc.salvarOrcamento(vendedora, quote.id, {
      versao: 1,
      // CNPJ de exemplo (dígitos válidos, usado em documentação), nunca de empresa real.
      cliente: { nome: "ESCRITORIO ALFA FICTICIO LTDA", fantasia: "Escritório Alfa", documento: "11.222.333/0001-81", email: "ana@exemplo.invalid", telefone: "(85) 99110-0001", cidade: "Fortaleza", uf: "CE" },
      itens: [{ produtoId: "9001", quantidade: "12", preco: "890,00", descontoTipo: "", desconto: "" }, { produtoId: "9003", quantidade: "12", preco: "1.290,00", descontoTipo: "", desconto: "" }],
      condicoes: { formaPagamento: "", previsao: amanha, consumidorFinal: false, emailNf: "", observacoes: "Homologação local: dados fictícios", notasInternas: "", conta: "1000000001" },
      proposta: { contato: "Ana Ribeiro", validade: "", descontoGeral: "", frete: "", montagem: "", observacoes: "" },
    }, new Map(produtos.map((p) => [p.id, p])));
    const versao = Number(db.getDb().prepare("SELECT version FROM internal_quotes WHERE id=?").get(quote.id).version);
    await prop.gerarProposta(vendedora, quote.id, { versaoOrcamento: versao, mostrarSku: true }, () => null);
  }
  const unidade = units.listUnitsPublic()[0];
  const pedido = db.saveQuote({ nome: "Gabriela Torres", empresa: "Escritório Zeta (fictício)", whatsapp: "85999330011", email: "gabriela@exemplo.invalid", cidade: "Fortaleza", estado: "CE",
    mensagem: "Quero orçamento de 8 cadeiras e 2 mesas para a sala de reunião." }, [{ slug: "cadeira-ergonomica-hml", sku: "HML-CAD-01", name: "Cadeira ergonômica Diretor (fictícia)", qty: 8 }]);
  assignments.assignNewLead(pedido.id, unidade?.id ?? null);
  assignments.assignLead(admin, { leadId: pedido.id, ownerId: vendedora.id, unitId: unidade?.id ?? null, revision: assignments.leadAssignment(pedido.id).revision });
  console.log("Dados fictícios da fase 2 criados (proposta com PDF e pedido do site).");
}

// ---------- servidor HTTP ----------
const servidor = createServer(async (req, res) => {
  const inicio = Date.now();
  const caminho = (req.url || "/").split("?")[0];
  try {
    if (caminho === "/saude") { res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, envios: envios.length })); return; }
    if (!caminho.startsWith("/api/crm/v1/")) { res.writeHead(404).end(); return; }
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")]));
    const temCorpo = !["GET", "HEAD"].includes(req.method || "GET");
    const request = new Request(`http://127.0.0.1:${PORTA}${req.url}`, { method: req.method, headers, ...(temCorpo ? { body: Readable.toWeb(req), duplex: "half" } : {}) });
    const response = await handleCrmMobileApi(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    console.log(`${new Date().toLocaleTimeString("pt-BR")} ${req.method} ${caminho.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id")} → ${response.status} (${Date.now() - inicio} ms)`);
  } catch (erro) {
    console.error("erro:", erro instanceof Error ? erro.message : erro);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unavailable" }));
  }
});
servidor.listen(PORTA, "127.0.0.1", () => {
  console.log(`Homologação local do MAG CRM em http://127.0.0.1:${PORTA} (dados fictícios em ${DADOS})`);
  console.log(`Contas fictícias: ${Object.values(CONTAS).map((c) => c.email).join(", ")} (senhas no README do app)`);
});

// ---------- controle da simulação: só no PC (porta PORTA+1, nunca encaminhada ao aparelho) ----------
const usuario = (chave) => {
  const conta = CONTAS[chave];
  const linha = conta && db.getDb().prepare("SELECT id,email,roles,created_at FROM users WHERE email=?").get(conta.email);
  return linha ? { id: String(linha.id), email: String(linha.email), roles: JSON.parse(String(linha.roles)), created_at: String(linha.created_at) } : null;
};
const controle = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const json = (valor, status = 200) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(valor));
  try {
    if (req.method === "GET" && url.pathname === "/estado")
      return json({ modo, atrasoMs, envios: envios.length, tentativas: tentativas.length, ultimasTentativas: tentativas.slice(-5) });
    if (req.method === "POST" && url.pathname === "/simular") {
      const novo = url.searchParams.get("modo") || "";
      if (!["normal", "incerto", "numero", "linha", "lento"].includes(novo)) return json({ erro: "modo inválido" }, 400);
      modo = novo;
      atrasoMs = modo === "lento" ? Math.min(60_000, Math.max(1000, Number(url.searchParams.get("ms") || 15_000))) : 0;
      console.log(`  [controle] simulação: ${modo}${atrasoMs ? ` (${atrasoMs} ms)` : ""}`);
      return json({ modo, atrasoMs });
    }
    if (req.method === "POST" && url.pathname === "/revogar-aparelhos") {
      const pessoa = usuario(url.searchParams.get("conta") || "");
      if (!pessoa) return json({ erro: "conta inválida" }, 400);
      const ativos = mobile.listCrmMobileDevices(pessoa).filter((aparelho) => aparelho.active);
      for (const aparelho of ativos) mobile.revokeCrmMobileDevice(pessoa, aparelho.id);
      console.log(`  [controle] ${ativos.length} aparelho(s) revogado(s) no servidor (${url.searchParams.get("conta")})`);
      return json({ revogados: ativos.length });
    }
    if (req.method === "GET" && url.pathname === "/contatos") {
      const vendedora = usuario("vendedora"), outro = usuario("vendedor2");
      const primeiro = (dono) => dono && db.getDb().prepare("SELECT id FROM crm_contacts WHERE owner_id=? ORDER BY created_at LIMIT 1").get(dono.id)?.id;
      return json({ vendedora: primeiro(vendedora), outraCarteira: primeiro(outro) });
    }
    return json({ erro: "não encontrado" }, 404);
  } catch (erro) {
    return json({ erro: erro instanceof Error ? erro.message : String(erro) }, 500);
  }
});
controle.listen(PORTA + 1, "127.0.0.1", () => console.log(`Controle da simulação (só no PC): http://127.0.0.1:${PORTA + 1}/estado`));
