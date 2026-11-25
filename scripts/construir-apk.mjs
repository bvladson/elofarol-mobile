// Assina e confere o APK de homologação/definitivo do MAG CRM nativo.
// Entrada: android/app/build/outputs/apk/release/app-release-unsigned.apk (gradlew app:assembleRelease, que sai SEM
// assinatura por causa do plugins/with-release-sem-assinatura.js).
//  1. confere pacote, versão e que o JavaScript está EMBUTIDO (assets/index.android.bundle): o APK não depende do Metro;
//  2. recusa versão repetida ou código de versão menor ou igual ao último construído;
//  3. zipalign; apksigner com a chave da MAG lendo a senha DIRETO do arquivo da pasta da chave (--ks-pass file:);
//     a senha nunca passa por código, Gradle, variável de ambiente, linha de comando ou log;
//  4. confere assinatura (v2), 1 assinante e o certificado da MAG; não depurável;
//  5. procura segredos no APK (token de aparelho, chave privada, a senha da chave, senhas da homologação local);
//  6. grava releases/<versão>/ (fora do Git) com o APK, SHA256SUMS.txt e info.json.
// Uso: node scripts/construir-apk.mjs [--substituir]   (--substituir só para versão NUNCA instalada fora do PC)
// Variante definitiva (o pacote da equipe): MAG_CRM_VARIANTE=definitiva, a mesma do prebuild (ver app.config.js).
// Ela confere também que o APK não tem exceções de rede (só HTTPS) e grava MAG-CRM-<versão>.apk.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASSINATURA = process.env.MAG_CRM_ASSINATURA || join(homedir(), "mag-crm-assinatura");
const KS = join(ASSINATURA, "mag-crm-release.jks"), SENHA = join(ASSINATURA, "senha-keystore.txt"), CERT = join(ASSINATURA, "certificado-sha256.txt");
const SDK = process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
const BT = join(SDK, "build-tools", "37.0.0");
const JDK = join(homedir(), ".bubblewrap", "jdk");
const WIN = process.platform === "win32";
const exe = (n) => (WIN ? `${n}.exe` : n);
const JAVA = join(JDK, "bin", exe("java")), JAR = join(JDK, "bin", exe("jar"));
const ZIPALIGN = join(BT, exe("zipalign")), AAPT2 = join(BT, exe("aapt2")), APKSIGNER = join(BT, "lib", "apksigner.jar");
const ENTRADA = join(RAIZ, "android", "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk");
const substituir = process.argv.includes("--substituir");

function falhar(msg) { console.error(`\nERRO: ${msg}`); process.exit(1); }
// Erros citam só o programa, nunca os argumentos (que incluem caminhos da chave).
function rodar(cmd, args, { cwd = RAIZ } = {}) {
  return new Promise((ok, erro) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, JAVA_HOME: JDK } });
    let saida = "";
    p.stdout.on("data", (d) => (saida += d)); p.stderr.on("data", (d) => (saida += d));
    p.on("error", erro);
    p.on("close", (c) => (c === 0 ? ok(saida) : erro(new Error(`${basename(cmd)} terminou com código ${c}\n${saida.slice(-2000)}`))));
  });
}
const sha256 = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const comDoisPontos = (hex) => hex.toUpperCase().match(/../g).join(":");

// ---------- pré-condições ----------
for (const [rotulo, caminho] of [["chave", KS], ["arquivo de senha", SENHA], ["certificado esperado", CERT], ["java", JAVA], ["jar", JAR], ["zipalign", ZIPALIGN], ["aapt2", AAPT2], ["apksigner", APKSIGNER], ["APK sem assinatura (rode gradlew app:assembleRelease)", ENTRADA]])
  if (!existsSync(caminho)) falhar(`${rotulo} não encontrado: ${caminho}`);
// A configuração é a do app.config.js: a variante definitiva com MAG_CRM_VARIANTE=definitiva; senão, a homologação.
const variante = process.env.MAG_CRM_VARIANTE || "hml";
const app = createRequire(import.meta.url)(join(RAIZ, "app.config.js"))({ config: JSON.parse(readFileSync(join(RAIZ, "app.json"), "utf8")).expo });
const pacote = app.android.package, versionName = app.version, versionCode = app.android.versionCode;
const ESPERADO = variante === "definitiva"
  ? { pacote: "br.com.magmoveiscorporativos.crm", nome: "MAG CRM", extra: "definitiva", apk: `MAG-CRM-${versionName}.apk` }
  : { pacote: "br.com.magmoveiscorporativos.crm.hml", nome: "MAG CRM HML", extra: "hml", apk: `MAG-CRM-HML-${versionName}.apk` };
if (pacote !== ESPERADO.pacote || app.name !== ESPERADO.nome || app.extra?.variante !== ESPERADO.extra)
  falhar(`a configuração não bate com a variante ${variante}: ${pacote} / ${app.name} / ${app.extra?.variante}`);
const certEsperado = readFileSync(CERT, "utf8").trim().replace(/:/g, "").toLowerCase();
if (!/^[0-9a-f]{64}$/.test(certEsperado)) falhar("certificado-sha256.txt inválido.");
if (statSync(ENTRADA).mtimeMs < Math.max(statSync(join(RAIZ, "app.json")).mtimeMs, statSync(join(RAIZ, "app.config.js")).mtimeMs))
  falhar("o APK é mais antigo que o app.json/app.config.js: recompile (gradlew app:assembleRelease).");
const RELEASES = join(RAIZ, "releases"), destino = join(RELEASES, versionName);
if (existsSync(destino) && !substituir) falhar(`releases/${versionName} já existe. Suba "version" e "android.versionCode" no app.json.`);
const anteriores = existsSync(RELEASES) ? readdirSync(RELEASES).filter((n) => n !== versionName && existsSync(join(RELEASES, n, "info.json"))).map((n) => JSON.parse(readFileSync(join(RELEASES, n, "info.json"), "utf8"))) : [];
const maior = Math.max(0, ...anteriores.map((i) => i.versionCode));
if (versionCode <= maior) falhar(`versionCode ${versionCode} precisa ser maior que ${maior}.`);
console.log(`MAG CRM ${pacote} ${versionName} (código ${versionCode})`);

// ---------- 1. o APK de entrada é o esperado e traz o JavaScript ----------
const badgingEntrada = await rodar(AAPT2, ["dump", "badging", ENTRADA]);
const m = badgingEntrada.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
if (!m || m[1] !== pacote || Number(m[2]) !== versionCode || m[3] !== versionName) falhar(`pacote/versão do APK (${m ? m.slice(1).join(" ") : "?"}) não batem com o app.json.`);
if (/application-debuggable/.test(badgingEntrada)) falhar("o APK é depurável: use a release.");
const rotulo = (badgingEntrada.match(/application-label:'([^']*)'/) || [])[1];
if (rotulo !== app.name) falhar(`nome do app no APK (${rotulo}) diferente do esperado (${app.name}).`);
const lista = await rodar(JAR, ["tf", ENTRADA]);
if (!/^assets\/index\.android\.bundle$/m.test(lista)) falhar("assets/index.android.bundle ausente: o APK dependeria do Metro.");
// Rede: o definitivo é só HTTPS (nenhum <domain-config>); a homologação tem as exceções locais. Uma troca de
// variante sem novo prebuild aparece aqui.
// A release encurta os caminhos dos recursos (res/xml/network_security_config.xml vira algo como res/8G.xml): o arquivo
// é achado pelo nome do recurso na tabela do APK.
const recursos = await rodar(AAPT2, ["dump", "resources", ENTRADA]);
const arquivoRede = (recursos.match(/xml\/network_security_config\s+\(\)\s+\(file\)\s+(\S+)/) || [])[1];
const manifesto = await rodar(AAPT2, ["dump", "xmltree", "--file", "AndroidManifest.xml", ENTRADA]);
const idRede = (recursos.match(/resource (0x[0-9a-f]+) xml\/network_security_config/) || [])[1];
if (!arquivoRede || !idRede || !manifesto.includes(`networkSecurityConfig(0x01010527)=@${idRede}`))
  falhar("configuração de segurança de rede ausente no APK (ou o manifesto não aponta para ela).");
const rede = await rodar(AAPT2, ["dump", "xmltree", "--file", arquivoRede, ENTRADA]).catch(() => "");
if (!/network-security-config/.test(rede)) falhar("configuração de segurança de rede ilegível no APK.");
if (variante === "definitiva" && /domain-config/.test(rede)) falhar("o APK definitivo tem exceções de rede (domain-config): refaça o prebuild com MAG_CRM_VARIANTE=definitiva.");
if (variante !== "definitiva" && !/domain-config/.test(rede)) falhar("o APK de homologação está sem as exceções de rede locais: o prebuild foi da variante definitiva?");
console.log(`[1/5] pacote, versão, nome, rede (${variante}) e JavaScript embutido conferidos`);

// ---------- 2. alinhar e assinar ----------
const trabalho = mkdtempSync(join(tmpdir(), "mag-crm-apk-"));
try {
  const alinhado = join(trabalho, "alinhado.apk"), assinado = join(trabalho, "assinado.apk");
  await rodar(ZIPALIGN, ["-P", "16", "-f", "4", ENTRADA, alinhado]);
  await rodar(ZIPALIGN, ["-c", "-P", "16", "4", alinhado]);
  await rodar(JAVA, ["-jar", APKSIGNER, "sign", "--ks", KS, "--ks-type", "PKCS12", "--ks-key-alias", "mag-crm", "--ks-pass", `file:${SENHA}`, "--out", assinado, alinhado]);
  console.log("[2/5] alinhado e assinado com a chave da MAG");

  // ---------- 3. conferir assinatura ----------
  const v = await rodar(JAVA, ["-jar", APKSIGNER, "verify", "--verbose", "--print-certs", assinado]);
  const esquema = (n) => new RegExp(`Verified using v${n} scheme \\(APK Signature Scheme v${n}\\): true`).test(v);
  // O formato muda entre versões do apksigner ("Signer #1 certificate…", "V3.0 Signer: certificate…"):
  // todas as linhas de certificado precisam trazer a mesma impressão digital.
  const certs = [...new Set([...v.matchAll(/certificate SHA-256 digest: ([0-9a-f]{64})/g)].map((x) => x[1]))];
  const cert = certs.length === 1 ? certs[0] : undefined;
  if (!/^Verifies$/m.test(v)) falhar("apksigner verify não confirmou a assinatura.");
  if (!esquema(2)) falhar("assinatura v2 ausente.");
  if ((v.match(/Number of signers: (\d+)/) || [])[1] !== "1") falhar("esperado exatamente 1 assinante.");
  // Impressões digitais de certificado são públicas (vão no assetlinks); mostrar as duas ajuda a diagnosticar.
  if (cert !== certEsperado) falhar(`o certificado do APK não é o da chave da MAG.\n  esperado:   ${comDoisPontos(certEsperado)}\n  encontrado: ${cert ? comDoisPontos(cert) : "(não lido)"}\n  saída do apksigner (linhas de certificado):\n    ${v.split(/\r?\n/).filter((l) => /certificate|Signer|Verified|scheme/i.test(l)).join("\n    ")}`);
  const badging = await rodar(AAPT2, ["dump", "badging", assinado]);
  const minSdk = Number((badging.match(/(?:minSdkVersion|sdkVersion):'(\d+)'/) || [])[1]);
  const targetSdk = Number((badging.match(/targetSdkVersion:'(\d+)'/) || [])[1]);
  const permissoes = [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map((x) => x[1]);
  console.log("[3/5] assinatura v2, 1 assinante, certificado da MAG");

  // ---------- 4. nenhum segredo dentro do APK ----------
  const conteudo = join(trabalho, "conteudo"); mkdirSync(conteudo);
  await rodar(JAR, ["xf", assinado], { cwd: conteudo });
  // A configuração que o app lê em tempo de execução (Constants.expoConfig) é embutida pelo Gradle: se a variável
  // da variante faltou na compilação, o pacote seria definitivo com a configuração da homologação.
  const embutida = join(conteudo, "assets", "app.config");
  if (!existsSync(embutida)) falhar("assets/app.config ausente no APK.");
  const cfgApp = JSON.parse(readFileSync(embutida, "utf8"));
  if (cfgApp.name !== app.name || cfgApp.extra?.variante !== ESPERADO.extra || cfgApp.android?.package !== pacote)
    falhar(`configuração embutida no APK (${cfgApp.name} / ${cfgApp.extra?.variante} / ${cfgApp.android?.package}) não é a da variante ${variante}: compile com MAG_CRM_VARIANTE=${variante === "definitiva" ? "definitiva" : "(vazia)"}.`);
  const senha = readFileSync(SENHA, "utf8").trim();
  const proibidos = [
    [/mag_app_[A-Za-z0-9_-]{43}/, "token de aparelho"],
    [/BEGIN (RSA |EC )?PRIVATE KEY/, "chave privada"],
    [/Homologacao-(Vendas|Admin)-2026/, "senha da homologação local"],
    [new RegExp(senha.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "senha da chave de assinatura"],
  ];
  const achados = []; let varridos = 0;
  const varrer = (pasta) => {
    for (const nome of readdirSync(pasta)) {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) { varrer(caminho); continue; }
      if ([".png", ".webp", ".jpg"].includes(extname(nome).toLowerCase())) continue;
      varridos++;
      const bytes = readFileSync(caminho), textos = [bytes.toString("latin1"), bytes.toString("utf16le")];
      for (const [re, rotulo] of proibidos) if (textos.some((t) => re.test(t))) achados.push(`${relative(conteudo, caminho)}: ${rotulo}`);
    }
  };
  varrer(conteudo);
  if (achados.length) falhar(`segredos encontrados no APK:\n  ${achados.join("\n  ")}`);
  console.log(`[4/5] varredura de segredos: ${varridos} arquivos, nada encontrado`);

  // ---------- 5. gravar a release ----------
  mkdirSync(destino, { recursive: true });
  const nomeApk = ESPERADO.apk, final = join(destino, nomeApk);
  copyFileSync(assinado, final);
  const shaApk = sha256(final);
  writeFileSync(join(destino, "SHA256SUMS.txt"), `${shaApk}  ${nomeApk}\n`);
  const info = {
    aplicativo: app.name, variante, pacote, versionCode, versionName, apk: nomeApk, apkSha256: shaApk, tamanhoBytes: statSync(final).size,
    certificadoSha256: comDoisPontos(cert), assinatura: { v1: esquema(1), v2: esquema(2), v3: esquema(3) }, minSdk, targetSdk, permissoes,
    javascriptEmbutido: true, dependeDoMetro: false, varreduraDeSegredos: { arquivos: varridos, achados: 0 },
    construidoEm: new Date().toISOString(),
  };
  writeFileSync(join(destino, "info.json"), `${JSON.stringify(info, null, 2)}\n`);
  console.log(`[5/5] gravado
APK:         ${final}
SHA-256:     ${shaApk}
Certificado: ${info.certificadoSha256}
Assinatura:  v1=${info.assinatura.v1} v2=${info.assinatura.v2} v3=${info.assinatura.v3}
Android:     mínimo API ${minSdk}, alvo API ${targetSdk}
Permissões:  ${permissoes.join(", ") || "(nenhuma)"}`);
} finally {
  rmSync(trabalho, { recursive: true, force: true }); // pasta temporária própria (sem junções)
}
