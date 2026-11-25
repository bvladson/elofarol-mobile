// Plugin do Expo: a versão "release" sai do Gradle SEM assinatura.
// O modelo do Expo/React Native assina a release com a chave de DEPURAÇÃO (debug.keystore, senha "android"). O APK de
// homologação e o definitivo são assinados depois, fora do Gradle, pelo scripts/construir-apk.mjs com a chave da MAG
// (senha lida do arquivo da pasta da chave, nunca no código, no Gradle, em variável de ambiente ou na linha de comando).
const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = function withReleaseSemAssinatura(config) {
  return withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    const inicio = contents.search(/buildTypes\s*\{[\s\S]*?release\s*\{/);
    if (inicio < 0) throw new Error("with-release-sem-assinatura: bloco release não encontrado em android/app/build.gradle");
    const release = contents.indexOf("release", inicio);
    const alvo = contents.indexOf("signingConfig signingConfigs.debug", release);
    const fimBloco = contents.indexOf("}", release);
    if (alvo < 0 || alvo > fimBloco) return cfg; // já sem a chave de depuração
    cfg.modResults.contents = contents.slice(0, alvo)
      + "signingConfig null // APK sem assinatura: assinado depois com a chave da MAG (scripts/construir-apk.mjs)"
      + contents.slice(alvo + "signingConfig signingConfigs.debug".length);
    return cfg;
  });
};
