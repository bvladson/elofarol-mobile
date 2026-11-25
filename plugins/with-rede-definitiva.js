// Plugin do Expo: configuração de segurança de rede do pacote DEFINITIVO do MAG CRM (o da equipe).
// - Tudo por HTTPS, confiando só nas autoridades do sistema (certificados instalados pelo usuário NÃO valem).
// - Nenhuma exceção de HTTP sem criptografia (a homologação local não existe neste pacote).
// O scripts/construir-apk.mjs confere no APK que não há <domain-config> com exceções.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por plugins/with-rede-definitiva.js -->
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

module.exports = function withRedeDefinitiva(config) {
  config = withDangerousMod(config, ["android", async (cfg) => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "network_security_config.xml"), XML);
    return cfg;
  }]);
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) throw new Error("with-rede-definitiva: <application> não encontrado no AndroidManifest");
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return cfg;
  });
};
