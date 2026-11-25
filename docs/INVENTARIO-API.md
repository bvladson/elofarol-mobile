# Inventário da API do MAG CRM para o aplicativo

Para a TI e o revisor da MAG. Levantado em 23/11/2026 no código da produção atual (`045a3a9`, com os testes `7ed76dd`).

A API do aplicativo é a **API v1** em `/api/crm/v1`, já publicada:
- **acesso:** só com token de aparelho (`Authorization: Bearer mag_app_…`); nunca cookie do navegador, nunca token na URL;
- **o token:** é revogável e cai sozinho quando a senha, o perfil ou a verificação em duas etapas mudam;
- **limites:** 120 pedidos por minuto por aparelho e 5 aparelhos por pessoa;
- **escritas:** com chave de repetição segura (`Idempotency-Key`).

## O que já existe na produção

| Método e caminho | Para quê | Telas do app |
| --- | --- | --- |
| `GET me` | Pessoa, perfis, aparelho, funis visíveis | Sessão, Meu funil |
| `GET contacts?limit&before&search` | Carteira com o resumo da conversa (última mensagem, não lidas) e as contagens do Atendimento | Atendimento, Clientes, Meu dia |
| `GET contacts/:id` | Contato, negócios e conversa | Cliente, Conversa |
| `GET contacts/:id/messages?limit&before` | Histórico paginado, com anexos | Conversa |
| `GET/HEAD attachments/:id` | Download de anexo autorizado (com Range) | (próxima fase) |
| `GET opportunities?limit&after&contactId&pipelineId` | Negócios da carteira | Meu funil, Meu dia |
| `GET opportunities/:id` | Um negócio | (próxima fase) |
| `GET tasks?limit&after&opportunityId&status` | Tarefas e retornos | Meu dia |
| `POST tasks` | Agendar retorno | (próxima fase) |
| `POST tasks/:id/complete` | Concluir tarefa | Meu dia |
| `POST opportunities/:id/stage` | Mover etapa do funil | (próxima fase) |

O código registra o que **não** existe na produção: login por senha, envio de WhatsApp e mudanças no Omie.

## O que faltava para a primeira entrega: pronto no branch, não publicado

Branch **`app-mobile-api-v1`**, release candidata **6987102** (68eebe3 + portões), sobre a produção. Só rotas novas na API v1, sem mudança no CRM web: o único arquivo de código alterado é `src/lib/crm-mobile-api.server.ts`.

| Método e caminho | Regra |
| --- | --- |
| `POST auth/login` | E-mail, senha e código de duas etapas geram o mesmo token revogável do painel. Limites de tentativa compartilhados com o login web. Falha auditada sem o e-mail digitado. Token devolvido uma vez. |
| `POST auth/logout` | Revoga só o aparelho atual. |
| `GET me` (+ `features`) | O servidor diz o que oferece. O app liga as telas por essa lista, nunca pela própria versão. |
| `GET contacts` (+ `view`, `ownerId`, `searchMode`) | Filtros responder, aguardando, retornos e proposta. Caixa por responsável (só o administrador escolhe). Vendedor pedindo outra carteira: 403, sem dados. |
| `GET inboxes` | Caixas como no Atendimento web: minha, uma por responsável (com o final do WhatsApp) e todas. |
| `GET whatsapp` | Status da linha de quem pergunta, sem nome de sessão nem chaves. |
| `POST contacts/:id/read` | Marca a conversa como lida, com a carteira conferida. |
| `POST contacts/:id/messages` | Envio pelo **mesmo caminho do web** (WAHA, linha do dono do contato), idempotente por `clientMessageId`. Envio incerto **nunca** é reenviado. O administrador não responde por linha alheia. |

**Respostas do envio:**

| Código | Situação | O que o app faz |
| --- | --- | --- |
| `200` | Enviada (ou repetição da mesma chave: devolve a mesma mensagem) | Limpa o campo e a chave |
| `409 send_in_progress` | Envio com esta chave já começou ou ficou incerto | Avisa e não repete |
| `502 send_uncertain` | O WhatsApp não confirmou | Avisa para conferir no celular, nunca repete sozinho |
| `503 line_unavailable` | Linha desconectada, pausada, aguardando QR Code etc. Nada foi enviado | Mostra a frase do servidor; repetir é seguro |
| `503 not_sent` | Falhou antes de registrar (ex.: número não confirmado). Nada foi enviado | Idem |
| `403 forbidden` / `reply_not_allowed` | Outra carteira / administrador em linha alheia | Bloqueia |
| `409 no_line`, `triage_required`, `key_reused` · `400 business_rule` | Regras do CRM | Mostra a frase |
| sem resposta (rede/tempo) | O app não sabe se saiu | Mantém texto e chave: repetir o mesmo texto não duplica |

**Testes do branch:**
- 8 testes em `tests/crm-mobile-app.test.mjs` e 7 portões da release em `tests/crm-mobile-app-release.test.mjs`. Os portões cobrem: revogação de sessão; isolamento de carteiras e linhas; envio por linha alheia; idempotência depois de reiniciar o servidor e entre painel e app; toque duplo; conexão interrompida antes e durante o envio; painel web; e nenhum comando de sessão WAHA nem chamada ao Omie;
- suíte completa: 436 testes, 431 passaram, nenhum falhou, 5 pulados (renderização no servidor, que exige a versão compilada);
- `tsc` sem erros;
- o teste antigo de `ownerId` passou a esperar 403, porque o filtro agora existe.

**Publicar exige autorização** (release do CRM em janela, com cópia de segurança e volta preparada).

## Fase 2 (24/11/2026): pronta no branch, não publicada

Branch **`app-mobile-api-v2`**, commit **3618694**, sobre a produção (`20261124-crm-tela-cheia`, adddbc0).

- Arquivos: `src/lib/crm-mobile-processos.server.ts` (novo) e `src/lib/crm-mobile-api.server.ts` (roteador);
- `crm.server.ts` só passa a exportar `siteLeads` e `allProposals`;
- o CRM web não muda.

**Regra única:** cada rota chama a **mesma função do CRM web**. Carteira, regras de negócio, controle de versão e auditoria continuam no servidor, iguais às do painel. Nada chama o Omie, envia e-mail ou mexe em sessão do WhatsApp.

| Método e caminho | Para quê | Função do CRM | Recurso (`GET me`) |
| --- | --- | --- | --- |
| `POST contacts/:id/attachments` | Prepara um anexo (multipart, campo `file`, até 7 MiB, tipo conferido pelo conteúdo; 30 por 10 min por aparelho) | `stageCrmMedia` | `messages.attachments`, `messages.audio` |
| `POST contacts/:id/messages` + `attachmentIds` | Envia foto, documento, áudio (sem legenda) ou proposta pelo caminho único do Atendimento, com a mesma chave de repetição segura | `sendWahaMessage` | idem |
| `GET quick-replies` | Respostas rápidas (a mesma lista do Atendimento web) | `QUICK_REPLIES` | `messages.quickReplies` |
| `GET contacts/:id/binding` · `POST contacts/:id/opportunity` | Qual negócio recebe a conversa; vincular a outro negócio **deste** cliente | `readWahaContactContext` · `bindWahaContactOpportunity` | `conversations.bind` |
| `POST contacts` · `PATCH contacts/:id` | Cliente novo (não duplica na carteira: devolve o existente com `existing: true`) e edição com versão | `createContact` · `updateContact` | `contacts.write` |
| `POST opportunities` · `PATCH opportunities/:id` | Negócio novo (cliente da carteira ou novo, com valor) e edição (título, interesse, valor, observações, cliente aguardando) | `createOpportunity` · `updateOpportunity` | `opportunities.write` |
| `GET opportunities/:id` | Ficha completa: negócio, cliente, tarefas, histórico e propostas | `getOpportunityDetail` | `opportunities.detail` |
| `POST opportunities/:id/stage` · `POST tasks` | Mover etapa (obrigatórios e motivo da perda) e agendar retorno (já existiam; agora anunciados) | `moveOpportunityStage` · `scheduleTask` | `opportunities.stage`, `tasks.write` |
| `GET proposals` | Propostas da carteira, sem endereços do painel | `allProposals` | `proposals.read` |
| `GET quotes/:id/proposals/:v/pdf?modo=visualizar\|compartilhar` | PDF da versão gravada; compartilhar só a vigente, com as travas de desconto/aprovação; auditado | `pdfDaProposta` | `proposals.read`, `proposals.share` |
| `POST quotes/:id/proposals/:v/attach` | PDF da versão vigente preparado como anexo **na conversa do cliente da proposta** (o envio segue o caminho único) | `pdfDaProposta` + `stageCrmMedia` | `proposals.share` |
| `POST quotes/:id/proposals/:v/sent` | "Marcar como enviada ao cliente" | `marcarVersaoEnviada` | `proposals.share` |
| `GET catalog?q&filtro&todos` | Catálogo local (mesma busca da Consulta rápida), **sem preço** | `indiceInterno` + `buscarProdutos` | `catalog.read` |
| `GET/PUT opportunities/:id/draft` · `POST …/draft/quote` | Rascunho de produtos (com versão) e orçamento gerado uma vez (preço e condições no web) | `lerRascunho` · `salvarRascunho` · `gerarOrcamentoDoRascunho` | `drafts.write` |
| `GET contacts/:id/orders` | Orçamentos e pedidos do cliente: só o que está gravado, nada consultado no Omie | `pedidosDoContato` | `orders.read` |
| `GET leads` · `POST leads/:tipo/:id/import` | Pedidos do site atribuídos e ainda fora do CRM; importar duas vezes devolve o mesmo negócio | `siteLeads` · `importSiteLead` | `leads.import` |

**Testes (`tests/crm-mobile-processos.test.mjs`, 10 testes)** cobrem:

- cliente e negócio: cria sem duplicar, edita com versão, outra carteira 403;
- anexos: conteúdo falsificado, arquivo grande, aparelho revogado, repetição sem segundo envio, anexo reaproveitado recusado;
- vínculo da conversa; proposta com PDF real (ver, compartilhar, anexar, enviada);
- catálogo sem preço, rascunho com versão e orçamento gerado uma vez;
- pedidos do cliente e importação única de pedido do site;
- nenhum segredo nos registros.

Suíte completa: **446/446**. tsc e inventário de segurança OK.

**Fica para depois:** notificação de mensagem nova. Ela depende de decidir usar o Firebase (FCM) do Google, com conteúdo mínimo e sem texto do cliente.

**Fora do app por decisão do pedido:**
- administração geral, DHO e recrutamento;
- editor do site, marketing e banners;
- configuração de funis, usuários e permissões;
- saúde da VPS e integrações, metas e campanhas.
