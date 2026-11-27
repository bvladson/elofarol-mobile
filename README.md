# ELOFAROL CRM MOBILE

**Customer Relationship Management & Sales Platform**

> Interface Android do Elofarol CRM. Segunda interface do mesmo ecossistema, não um produto separado.
>
> **A Vladson Labs Project** · Developed by Vladson Bezerra
> Participação autoral: Desenvolvimento original

O app da equipe comercial do Grupo MAG: atendimento por WhatsApp, funil, propostas e clientes no
celular, ligado ao [CRM do site MAG](https://github.com/bvladson/elofarol-web) por uma API própria
(`/api/crm/v1`). Interface **nativa**, sem WebView nem Trusted Web Activity, distribuída por APK
para a equipe, fora da Google Play.

**Versão 1.0.0 — 25/11/2026.** [Baixar o APK](https://github.com/bvladson/elofarol-mobile/releases/download/v1.0.0/MAG-CRM-1.0.0.apk)
(Android 7.0 ou mais novo; só entra com uma conta autorizada no CRM da MAG).

**Stack:** React Native 0.88 (Nova Arquitetura, Hermes), Expo SDK 58, Expo Router com abas
nativas, TypeScript, SecureStore (Android Keystore).

**33 arquivos TypeScript · 14 telas · 3.776 linhas de app · do primeiro commit à 1.0.0 em 3 dias**

---

## O que o app faz

| Área | O que tem |
| --- | --- |
| Entrar | E-mail e senha do CRM, com verificação em duas etapas, ou um código de aparelho gerado no CRM web |
| Meu dia | Contadores do atendimento, tarefas por prazo, propostas aguardando o cliente, pedidos novos do site |
| Atendimento | Conversas de WhatsApp com filtros e caixas; resposta com texto, foto, PDF, documento e áudio gravado no app; respostas rápidas; envio da proposta do cliente direto na conversa |
| Meu funil | Negócios por etapa e a ficha do negócio: mover etapa com os campos que ela exige, retorno, valor, observações, propostas, catálogo de produtos e orçamento, histórico |
| Clientes | Busca, cadastro e edição, negócio novo, pedidos do cliente |
| Minha conta | Perfil, diagnóstico sanitizado e saída que revoga o aparelho no servidor |

---

## Decisões que moldaram o código

- **Mensagem nenhuma sai duas vezes.** Cada envio tem uma chave (`clientMessageId`) guardada com
  uma impressão SHA-256 do contato e do texto — nunca com o texto. Repetir depois de fechar o app
  ou de ficar sem resposta reaproveita a chave, e o servidor não reenvia. Os três jeitos de
  falhar têm cor e título próprios: *nada foi enviado* (repetir é seguro), *sem resposta do
  servidor* (repetir não duplica) e *envio não confirmado pelo WhatsApp* (o app recusa repetir).
  Não existe reenvio automático.
- **O app pergunta ao servidor o que ele sabe fazer.** `GET /me` devolve a lista de recursos, e a
  tela esconde o que ainda não existe. API e app podem ser publicados em dias diferentes, e uma
  volta da API não quebra o app instalado.
- **Nenhum segredo no APK, por construção.** O script de release abre o APK assinado, varre os
  ~1.000 arquivos atrás de token de aparelho, chave privada, a senha da chave e as senhas da
  homologação, e reprova se achar qualquer um.
- **A senha da chave nunca passa por código.** O Gradle gera a release sem assinatura; o
  `apksigner` assina depois, lendo a senha direto do arquivo (`--ks-pass file:`). Nada em
  variável de ambiente, linha de comando ou log. O script confere o certificado da empresa,
  os esquemas v2/v3 e que há um único assinante.
- **Duas variantes, um código só.** A de homologação aceita um servidor local pelo cabo USB
  (HTTP só para `127.0.0.1` e `10.0.2.2`); a definitiva é só HTTPS, com as autoridades do
  sistema, e o script confere no próprio APK que não ficou nenhuma exceção de rede — inclusive
  na configuração que o app lê em tempo de execução, que o Expo embute durante a compilação.
- **Homologação contra a API de verdade.** `homologacao-local/servidor.mjs` sobe o código real do
  CRM no PC, com banco fictício e WhatsApp simulado, e uma porta de controle provoca as falhas:
  envio incerto, número errado, linha fora do ar, servidor lento, aparelho revogado.

Um defeito real encontrado assim: no Expo SDK 58, o `fetch` global não aceita o formato
`{ uri, name, type }` do React Native no `FormData`. O envio de anexos falhava com "sem conexão" —
de forma segura, sem mandar nada ao cliente. A correção lê o arquivo e envia nome e tipo
explícitos; o teste no emulador passou a cobrir foto, PDF, áudio e proposta, cada um enviado
exatamente uma vez.

---

## Distribuição

A equipe baixa o APK dentro do próprio CRM, na página **Aplicativo** — só perfis com acesso ao
CRM. A página mostra versão, tamanho, passos de instalação, o SHA-256 e um QR code para abrir no
celular; cada download entra na auditoria. O servidor só entrega o arquivo se tamanho e SHA-256
baterem com o manifesto publicado, e uma versão nova não exige publicar o site de novo.

Atualizar é instalar por cima: mesma chave, código de versão maior, e o acesso continua.

---

## Testes

- **Aparelho real** (Android 9): 21 de 21 cenários — envio, app fechado à força no meio do
  envio, sem rede, envio incerto, revogação no servidor, outra carteira, link direto negado.
- **Emulador** (Android 17): 29 de 29 com a fase 2 — pedidos do site, ficha do negócio, catálogo
  e orçamento, foto, PDF, áudio e proposta na conversa.
- **Produção:** primeiro envio real controlado, por um número de teste, aprovado antes da
  liberação para a equipe.
- O servidor tem a própria bateria no projeto do CRM: isolamento de carteiras, idempotência
  depois de reiniciar, conexão interrompida e as rotas do aplicativo (454 testes na última
  publicação).

---

## Estrutura

```text
src/app/          telas (Expo Router): entrada, abas, conversa, negócio, cliente, catálogo, propostas
src/lib/          API, sessão (SecureStore), tipos, tema, envio sem duplicidade, registro sanitizado
src/components/   composição de mensagem, anexos, formulários, folhas
plugins/          plugins do Expo: rede (homologação e definitiva), release sem assinatura, caminhos curtos
app.config.js     variantes de homologação e definitiva
scripts/          construir-apk.mjs (assina e confere) e a cópia cifrada da chave
homologacao-local/  a API real do CRM no PC, com dados fictícios
docs/             operação (TI), inventário da API e plano de evolução
```

---

## Observação sobre a cópia pública

Esta é uma cópia publicada do projeto real, com um histórico novo. Os dados da homologação local
são fictícios. A chave de assinatura e a senha dela nunca estiveram no repositório; os caminhos
da máquina de desenvolvimento foram trocados por caminhos genéricos.
