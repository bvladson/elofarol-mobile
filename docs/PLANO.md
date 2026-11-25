# Plano do aplicativo nativo do MAG CRM

Para a TI e o revisor da MAG. Situação em 25/11/2026: **versão 1.0.0 para a equipe construída** (pacote definitivo, 32 e 64 bits), com download no CRM.

## 1. Relatório do primeiro teste em aparelho real

**Aparelho:**
- Sony Xperia 702SO, Android 9 (API 28), arm64-v8a, Chrome 138, português;
- ligado ao PC da TI por cabo USB.

| Passo | Resultado |
| --- | --- |
| Instalar o APK de desenvolvimento por `adb install` (0.1.0, código 1, pacote `.hml`) | **OK** |
| Abrir o app ligado ao Metro pelo cabo (`adb reverse`) | **OK**: tela de login em 7,6 s na primeira carga |
| Login na produção com e-mail e senha | Mostrou a mensagem errada. A produção ainda não tem o login do app e responde `401 invalid_token`. **Defeito corrigido** no mesmo dia: o app agora explica que é preciso usar o código do aparelho. |
| Login na produção com código do aparelho, Meu dia e Atendimento (leitura) | **Pendente**, com o responsável (dados reais; nenhuma tela foi capturada) |
| Fluxo completo na homologação local (dados fictícios), inclusive envio | **Pendente** no aparelho. No PC, a mesma API passou: login, perfil, conversas, envio repetido com a mesma chave (uma mensagem só, um único envio ao WhatsApp simulado), tarefas e logout (o token deixou de valer). |
| Enviar mensagem de teste pela linha autorizada, na produção | **Bloqueado** até a publicação autorizada da API do app e a definição da conta e do contato de teste |
| APK autônomo 0.2.0 (JavaScript embutido, chave da MAG) no lugar da versão de desenvolvimento | **OK**: instalado, sem a flag de depuração e sem backup |
| Abrir o APK autônomo com o Metro parado e nenhuma porta encaminhada | **OK** pelo log do Android: o pacote JavaScript embutido carregou em ~1 s, sem procurar o Metro e sem erro fatal |
| Fluxo interativo no aparelho com o APK 0.2.2 sem Metro (23/11, aparelho liberado pelo responsável; só dados fictícios da homologação local) | **21 de 21 OK**. Cobriu: login; leitura; envio simulado; app fechado à força no meio do envio e reaberto (mesma chave, sem duplicar); sem rede (aviso âmbar, envio único ao voltar); "Nada foi enviado" (cinza, repetir é seguro); envio incerto (vermelho; a repetição é recusada sem reenvio); revogação no servidor (o app volta ao login); saída; outra carteira; link direto negado; supervisão do administrador sem responder. No banco fictício: cada texto gravado uma vez, e o incerto registrado como incerto |
| Observação para a próxima versão | Sem rede, a conversa troca as mensagens já carregadas por "Sem conexão com o servidor". Melhor manter as mensagens e mostrar só o aviso |
| 24/11 tarde, fase 2 no emulador (AVD API 37; build de release x86_64 com o mesmo JavaScript do APK; homologação local fictícia) | **29 de 29 OK** (em rodadas retomadas). Cobriu:<br>• pedidos do site: importar abre a ficha do negócio;<br>• na ficha: mover etapa, agendar retorno, editar valor (R$ 2.500,00), observações, catálogo sem preço, rascunho com 2 produtos e orçamento gerado;<br>• na conversa: resposta rápida, foto da galeria, PDF, áudio gravado e proposta da cliente, cada um enviado **1 vez** ao WhatsApp simulado;<br>• proposta marcada como enviada; cliente novo e edição; negócio novo; funil abrindo a ficha.<br>**Defeito achado e corrigido na 0.3.1:** o envio de arquivo falhava com "sem conexão". O `fetch` global do Expo 58 não aceita o formato `{ uri, name, type }` do React Native no FormData; o app agora lê o arquivo e envia nome e tipo explícitos. Na 0.3.0, a falha era segura: nada saía para o cliente |
| 25/11, versão 1.0.0 definitiva (`br.com.magmoveiscorporativos.crm`) | Assinada com a chave da MAG, SHA-256 `3dae1b1d…a32706`, arm64-v8a e armeabi-v7a, rede só HTTPS, 1.074 arquivos sem segredo. No emulador (cópia x86_64 do mesmo código, chave de depuração), abriu sem falha na tela de entrada "MAG CRM", versão 1.0.0, sem o servidor local. A cópia não instalou por cima do TWA de teste antigo (`1.0.0-hml2`, chave da MAG): prova de que o Android só aceita atualização com a mesma chave. O APK da MAG, com código 8, entra por cima dele |
| 24/11, depois da publicação (retorno do responsável, com o app na produção) | Os filtros do Atendimento e do Meu funil apareciam cortados pela metade. A causa: os `ScrollView` horizontais encolhiam para dar espaço à lista. Na 0.2.3, a fileira de filtros não encolhe e cada pílula tem o número num selo. A caixa de entrada virou um seletor com lista (o e-mail aparece como nome). As etapas do funil mostram a cor, e os cards mostram o nome do cliente (cruzado com a lista de contatos, sem mudar a API) |

## 2. Evolução até a versão completa

| Fase | Entrega | Servidor (CRM) | Autorização |
| --- | --- | --- | --- |
| **1. Primeira entrega** (agora) | Login, abas nativas, Meu dia, Atendimento (lista, conversa, envio de texto), funil e clientes em consulta, conta e diagnóstico | API do app (branch `app-mobile-api-v1`) | Janela de publicação da API; conta e contato de teste |
| **2. APK sem Metro** (feito em 23/11) | APK de homologação com o JavaScript embutido, assinado com a chave da MAG (`scripts/construir-apk.mjs`), instalável por `adb install` | — | — |
| **3. Atendimento completo** (API na produção desde 24/11 14:22; app 0.3.1) | Anexos (câmera, galeria, arquivos, PDF), áudio (gravar, enviar, ouvir), abrir anexos recebidos, respostas rápidas, vincular conversa a negócio | Branch `app-mobile-api-v2` (3618694): `POST contacts/:id/attachments`, `attachmentIds`, `quick-replies`, vínculo | Janela |
| **4. Funil e propostas** (idem) | Ficha do negócio; mover etapa (com campos obrigatórios); agendar retorno; editar; propostas (ver, compartilhar, enviar na conversa, marcar enviada); clientes e negócios novos; pedidos do site | `GET opportunities/:id`, `PATCH`, `proposals`, `quotes/:id/proposals/:v/pdf\|attach\|sent`, `contacts`, `leads` | Janela |
| **5. Catálogo e Omie** (idem) | Catálogo com busca (sem preço), rascunho de produtos, orçamento gerado no CRM, pedidos do cliente (consulta do que está gravado) | `GET catalog`, `GET/PUT opportunities/:id/draft`, `…/draft/quote`, `GET contacts/:id/orders` | Janela |
| **6. Avisos** | Notificação de mensagem nova, sem o texto do cliente | Push (FCM) | Decisão de usar o FCM do Google |
| **7. Versão para a equipe** (1.0.0 construída em 25/11) | Pacote definitivo, assinado pela chave da MAG; download na página Aplicativo do CRM | Página de download (`b21ed92`, release `20261125-app-android`) | Pedida pelo usuário em 25/11; a página depende da janela de publicação |

Cada fase repete o mesmo ciclo:
1. API em branch, com testes por perfil (administrador, vendedor, outra carteira, sem acesso);
2. homologação local;
3. aparelho real;
4. janela de publicação autorizada.

O CRM web não muda.

## 3. Assinatura e atualização do APK

- **Desenvolvimento:** assinado com a chave de depuração do Android. Só para testes ligados ao Metro e nunca distribuído.
- **Homologação sem Metro (`.hml`):**
  - assinada com a **chave da MAG** (`MAG-CRM-ANDROID-ASSINATURA`, certificado `55:20:23:D3…F9:6B:15:78`), sob a mesma custódia;
  - o `scripts/construir-apk.mjs` passa ao `apksigner` o caminho do arquivo da senha (`--ks-pass file:`): a senha não passa por código, Gradle, variável de ambiente, linha de comando nem log;
  - o Gradle gera a release **sem assinatura** (`plugins/with-release-sem-assinatura.js`), que é assinada depois, fora dele;
  - o script também confere o certificado, a assinatura v2/v3, o JavaScript embutido e a ausência de segredos, e grava `releases/<versão>/` com o SHA-256.
- **A chave da MAG ainda não tem cópia de segurança.** Perdê-la impede qualquer atualização por cima.
- **Versão para a equipe:** pacote `br.com.magmoveiscorporativos.crm`, o mesmo do app anterior, que nunca foi distribuído. Com a mesma chave e código de versão **3 ou maior**, ele entra como atualização em qualquer aparelho que ainda tenha a versão anterior de teste.
- **Numeração:** `versionCode` só sobe, um por APK; `versionName` segue o padrão `MAIOR.MENOR.CORREÇÃO`.
- **Atualizar:** `adb install -r` por cima, sem desinstalar. O Android exige a mesma chave e um código maior. O token no SecureStore e as preferências continuam.
- **Integridade antes de instalar:** conferir o SHA-256 do APK e o certificado. O kit `homologar-adb.mjs` do projeto anterior será adaptado ao pacote novo.
- **Sem atualização pelo ar** (EAS Update): ela enviaria o código aos servidores da Expo. Cada atualização é um APK novo, conferido e autorizado.
- **Distribuição:** pelo cabo, pela TI, enquanto a MAG não fizer a verificação de desenvolvedor do Google. A preparação está no projeto anterior (`MAG-CRM-ANDROID/docs/VERIFICACAO-GOOGLE.md`).

## 4. O que depende do responsável

Feitos: a API do app está na produção (24/11) e o primeiro envio real controlado foi aprovado (24/11).

1. **Duas cópias cifradas da chave da MAG**, sob custódia da empresa, antes de a equipe inteira instalar: rodar `scripts/copiar-chave-cifrada.sh` com uma frase-senha da empresa e dois destinos da empresa (testado com chave fictícia). Sem a chave, nenhuma atualização instala por cima.
2. **Segundo aparelho**, Android mais novo e de outro fabricante, para áudio, câmera, PDFs e avisos. A 1.0.0 foi conferida no Sony (Android 9, versão de homologação com o mesmo código) e no emulador (API 37).
3. **Avisos de mensagem nova:** decidir se o app usa o FCM do Google.
4. **Verificação de desenvolvedor do Google** (D-U-N-S, Search Console e US$ 25): hoje a instalação direta do APK continua permitida; a exigência deve chegar a todos os países em 2027.
