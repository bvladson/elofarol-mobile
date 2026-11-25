# MAG CRM — operação do aplicativo (TI)

Aplicativo comercial da MAG Móveis Corporativos, em **React Native com Expo e TypeScript**:
- interface nativa, sem WebView, Trusted Web Activity ou iframe;
- usa o backend, o banco, a autenticação e as regras do MAG CRM pela **API v1** (`/api/crm/v1`);
- não tem banco próprio nem segredo de WAHA ou Omie;
- uso interno, distribuído por APK, **fora da Google Play**.

| | |
| --- | --- |
| Situação | **1.0.0, a versão da equipe** (25/11/2026). Baixada no CRM: Aplicativo → *Baixar o aplicativo Android* |
| Pacotes | definitivo `br.com.magmoveiscorporativos.crm` ("MAG CRM", só produção) · homologação `br.com.magmoveiscorporativos.crm.hml` ("MAG CRM HML", servidor local liberado) |
| Base | Expo SDK 58 · React Native 0.88 (Nova Arquitetura, Hermes) · Expo Router com abas nativas |
| Android | 7.0 ou superior (minSdk 24) · alvo API 36 · arm64-v8a e armeabi-v7a (celulares de 64 e de 32 bits) |
| Permissões | `INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA` (foto para o cliente), `RECORD_AUDIO` (só ao gravar um áudio), `MODIFY_AUDIO_SETTINGS`, `WAKE_LOCK` |

## O que o app faz

| Área | O que tem |
| --- | --- |
| Entrar | E-mail e senha do CRM (com o código de duas etapas, se a conta usar) ou o código do aparelho gerado no CRM web |
| Meu dia | Contadores do Atendimento, tarefas por prazo, propostas aguardando o cliente, pedidos novos do site |
| Atendimento | Filtros, caixas (administrador), leitura e resposta; foto, PDF e documentos, áudio gravado no app, respostas rápidas, proposta do cliente direto na conversa, vínculo da conversa com o negócio |
| Meu funil | Negócios por etapa e a ficha do negócio: mover etapa (com os campos que ela exige), retorno, valor, observações, propostas, catálogo e orçamento, histórico |
| Clientes | Busca, cliente novo e edição, negócio novo, pedidos do cliente |
| Minha conta | Perfil, diagnóstico sanitizado, sair (revoga o aparelho no servidor) |

A API do app (`/api/crm/v1`) está na produção desde 24/11/2026 (a fase 2 desde 14:22). O app descobre sozinho o que o servidor oferece (`features` em `GET /me`) e esconde o que ainda não existe. Detalhes em [docs/INVENTARIO-API.md](docs/INVENTARIO-API.md).

## Pastas

```text
src/app/          telas (Expo Router): login, abas (Meu dia, Atendimento, Meu funil, Clientes), conversa, cliente, conta
src/lib/          API, sessão (SecureStore), tipos, tema, formatação, registro sanitizado, chave de envio
src/components/   componentes de tela
plugins/          plugins do Expo: caminhos curtos do C++ no Windows, release sem assinatura, rede da homologação e a definitiva
app.config.js     variantes: homologação (padrão, o app.json) e definitiva (MAG_CRM_VARIANTE=definitiva)
scripts/          construir-apk.mjs: assina com a chave da MAG, confere e grava releases/<versão>
homologacao-local/servidor.mjs   API real do CRM no PC, com dados fictícios e WhatsApp simulado
docs/             inventário da API, plano de evolução, assinatura e testes
android/          gerado por "expo prebuild" (fora do Git; não editar à mão)
releases/         APKs assinados, SHA256SUMS e info.json (fora do Git)
```

## Ambiente no Windows (PC da TI)

- **Node 24.**
- **JDK 17:** `%USERPROFILE%\.bubblewrap\jdk`.
- **Android SDK do Android Studio** (`%LOCALAPPDATA%\Android\Sdk`): plataforma 37, build-tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1 e platform-tools (`adb`).
- **Caminhos longos:** o Windows corta caminhos acima de 260 caracteres e a compilação C++ da Nova Arquitetura passa disso. O plugin `plugins/with-cmake-caminhos-curtos.js` resolve sem administrador. Mesmo assim, mantenha o projeto num caminho curto (`C:\mag-crm-mobile`).
- `npx expo prebuild` **recria a pasta android/** do zero (a compilação seguinte é completa, ~8 min).

## Construir o APK (sem Metro, sem cabo)

O JavaScript vai embutido no APK. O app funciona com o PC desligado e o cabo desconectado.

Há duas variantes (ver `app.config.js`). A **definitiva** é a da equipe: pacote `br.com.magmoveiscorporativos.crm`, nome "MAG CRM", só o servidor de produção e rede só HTTPS. A de **homologação** (padrão, sem variável) é o `.hml`, com o servidor local liberado. A variável `MAG_CRM_VARIANTE` precisa valer no prebuild, no Gradle (o Expo embute a configuração no APK durante a compilação) e na assinatura. Trocar de variante pede um prebuild novo.

```powershell
cd C:\mag-crm-mobile
npm ci
# 1. Subir "version" e "android.versionCode" no app.json (um contador para todos os APKs; o script recusa repetido).
$env:MAG_CRM_VARIANTE = "definitiva"          # para a homologação: Remove-Item Env:MAG_CRM_VARIANTE
npx expo prebuild --platform android --clean --no-install
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"; $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd android; .\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a; cd ..
# 2. Assinar com a chave da MAG, conferir e gravar releases\<versão>\ (APK, SHA256SUMS.txt, info.json)
node scripts/construir-apk.mjs
```

O `construir-apk.mjs`:
- confere o pacote, a versão, o nome e a variante, e que o JavaScript está embutido (`assets/index.android.bundle`);
- confere a configuração que o app lê em tempo de execução (`assets/app.config`) e a rede: no definitivo, nenhuma exceção de HTTP;
- recusa um APK depurável;
- faz o `zipalign` e assina com `apksigner`;
- confere a assinatura v2/v3, que há um único assinante e que o certificado é o da MAG (`55:20:23:D3…F9:6B:15:78`);
- procura segredos dentro do APK;
- grava `MAG-CRM-<versão>.apk` (definitivo) ou `MAG-CRM-HML-<versão>.apk` (homologação).

## Distribuição para a equipe

- **Onde baixar:** no CRM web, *Aplicativo* → **Baixar o aplicativo Android** (`/interno/crm/aplicativo`). Só perfis admin e comercial. A página mostra a versão, o tamanho, os passos de instalação, o SHA-256 e um QR code para abrir a página no celular. Cada download entra na auditoria.
- **Publicar uma versão nova** (sem release do site): copiar o APK e o manifesto `atual.json` para `/opt/mag-site/data/app-android/` no servidor (dono `magsite`, permissão 600; primeiro o APK, depois o manifesto). O site só entrega o arquivo se o tamanho e o SHA-256 baterem com o manifesto. O manifesto tem `versao`, `versionCode`, `pacote`, `arquivo`, `sha256`, `tamanhoBytes`, `androidMinimo`, `certificadoSha256` e `publicadoEm`.
- **Atualizar:** a versão nova instala por cima da anterior (mesma chave, código maior) e o acesso continua. Também entra por cima do app de teste antigo (TWA `1.0.0-hml2`, código 2), que usava o mesmo pacote.
- Fora da Google Play: o Android pede permissão para o navegador instalar apps, e o Play Protect pode avisar.

**Instalar ou atualizar no celular (cabo USB, Depuração USB ligada):**

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices                                            # serial do aparelho
& $adb -s <serial> install -r releases\1.0.0\MAG-CRM-1.0.0.apk         # atualização: mantém o login
```

A versão de desenvolvimento (assinada com a chave de depuração) e a de homologação (chave da MAG) **não se substituem**: na primeira troca é preciso `adb uninstall br.com.magmoveiscorporativos.crm.hml`, o que apaga o login guardado no aparelho.

## Chave de assinatura da MAG

- **Onde fica:** numa pasta fora do repositório, com acesso só do responsável (`mag-crm-release.jks`, PKCS12, alias `mag-crm`), indicada em `MAG_CRM_ASSINATURA`.
- **Senha:** o `apksigner` lê direto do arquivo da pasta da chave (`--ks-pass file:`). Ela nunca passa por código, Gradle, variável de ambiente, linha de comando ou log. O Gradle gera a release **sem assinatura** (`plugins/with-release-sem-assinatura.js`).
- **Cópia de segurança (duas cópias cifradas, custódia da empresa):** no Git Bash, `bash scripts/copiar-chave-cifrada.sh "<destino-1>" "<destino-2>"`. O roteiro:
  - confere o certificado do `.jks`;
  - cifra em fluxo (OpenPGP AES-256, abre em qualquer GnuPG), sem gravar a chave aberta em disco;
  - abre a cópia em memória e confere os 3 arquivos contra os originais;
  - grava a mesma cópia nos dois destinos, com um LEIA-ME de restauração.

  A frase-senha é digitada por quem roda, na janela do GnuPG, e fica **separada** das cópias (cofre de senhas da empresa ou envelope lacrado). Sem a chave, nenhuma atualização futura instala por cima, e cada aparelho teria de desinstalar o app e entrar de novo.

## Desenvolvimento pelo cabo USB (Metro)

```powershell
npx expo prebuild --platform android --no-install
cd android; .\gradlew.bat app:assembleDebug -PreactNativeArchitectures=arm64-v8a,x86_64; cd ..
& $adb -s <serial> install -r android\app\build\outputs\apk\debug\app-debug.apk
& $adb -s <serial> reverse tcp:8081 tcp:8081              # Metro (código JavaScript)
& $adb -s <serial> reverse tcp:3100 tcp:3100              # homologação local (opcional)
npm start                                                 # Metro (expo start --dev-client)
& $adb -s <serial> shell am start -a android.intent.action.VIEW -d "exp+mag-crm-mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
```

**Depuração:**
- **Menu de desenvolvimento:** sacudir o celular, ou `adb shell input keyevent 82`. Nele: *Reload* e *Open DevTools* (React Native DevTools no PC).
- **Logs:** no Metro (versão de desenvolvimento) ou em `adb logcat --pid=$(adb shell pidof br.com.magmoveiscorporativos.crm.hml)` (APK autônomo). Em ambos, os logs já saem sanitizados.
- **Conferência antes de entregar:** `npm run typecheck`. O ESLint ainda não está configurado. Não rode `npx expo lint`: ele instala pacotes por conta própria e muda o `package-lock.json`.

## Entrar

**Na produção:** e-mail e senha do CRM, com o código de duas etapas se a conta usar. Ou pelo código do aparelho:
1. No CRM web (PC ou navegador do celular), abrir **Aplicativo** (`/interno/crm/aplicativo`) → **Autorizar um aparelho**.
2. Dar um nome, escolher a validade (1, 7 ou 30 dias) e confirmar com a senha e o código de duas etapas.
3. Copiar o código `mag_app_…`.
4. No app, abrir a aba **Código do aparelho** e tocar em **Entrar**.

Para revogar, use a mesma página. O código nunca deve ir para mensagens, e-mails ou relatórios.

**Na homologação local** (versão de desenvolvimento e pacote `.hml`):
1. Rode `npm run homologacao` e o `adb reverse tcp:3100 tcp:3100`.
2. No app, escolha o servidor **Homologação local** e entre com uma conta fictícia.
3. Para provocar falhas, use o controle na porta **3101**, que fica só no PC e nunca é encaminhada ao aparelho: `POST /simular?modo=normal|incerto|numero|linha|lento`, `POST /revogar-aparelhos?conta=vendedora` e `GET /estado`. Os detalhes estão no cabeçalho do `homologacao-local/servidor.mjs`.

As contas são fictícias e só existem no banco local do PC:

| Conta | Senha | Perfil |
| --- | --- | --- |
| `vendedora@homologacao.local` | `Homologacao-Vendas-2026` | Comercial, com linha de WhatsApp simulada |
| `vendedor2@homologacao.local` | `Homologacao-Vendas-2026` | Comercial, outra carteira (teste de isolamento) |
| `admin@homologacao.local` | `Homologacao-Admin-2026` | Administrador (caixas, supervisão sem responder) |

## Segurança

- O token de aparelho fica só no **SecureStore** (Android Keystore). É revogável no servidor e cai com a troca de senha, a desativação da conta ou a mudança de perfil. Se o servidor recusar o token, o app sai e apaga os dados guardados na memória.
- **Nenhum segredo** de WAHA, Omie ou serviço no app; tudo passa pelo backend MAG. O `construir-apk.mjs` reprova o APK que contenha token, chave privada, a senha da chave ou as senhas da homologação local.
- **Envio sem duplicidade:**
  - cada mensagem tem uma chave (`clientMessageId`), guardada com uma impressão (SHA-256) do contato e do texto, nunca com o texto;
  - repetir o mesmo texto, mesmo depois de fechar o app ou de ficar sem resposta do servidor, reaproveita a chave, e o servidor não reenvia;
  - cada resultado tem cor, ícone e título próprios:
    - **Nada foi enviado** (cinza): linha fora do ar ou número não confirmado; repetir é seguro;
    - **Sem resposta do servidor** (âmbar): não se sabe se saiu, mas repetir o mesmo texto não duplica;
    - **Envio não confirmado pelo WhatsApp** (vermelho): pode ter chegado; o CRM nunca reenvia e recusa repetir o texto;
  - o app só envia quando a pessoa toca em enviar: não há reenvio automático em nenhum caso.
- **Administrador** vê as caixas, mas não responde por linha alheia (regra do servidor e da tela).
- **Registro de erros sanitizado:** sem senha, token, e-mail, telefone nem texto de cliente.
- **Rede:** tudo por HTTPS, confiando só nas autoridades do sistema. No pacote de homologação, HTTP sem criptografia só para `127.0.0.1`, `localhost` e `10.0.2.2` (homologação local pelo cabo). O pacote definitivo não tem nenhuma exceção (`plugins/with-rede-definitiva.js`), e o `construir-apk.mjs` confere isso no APK.
- `allowBackup=false`; sem atualização remota de código (o JavaScript vem só do APK assinado).
