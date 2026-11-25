// Plugin do Expo: configuração de segurança de rede do aplicativo de HOMOLOGAÇÃO.
// - Tudo por HTTPS, confiando só nas autoridades do sistema (certificados instalados pelo usuário NÃO valem).
// - HTTP sem criptografia somente para 127.0.0.1/localhost (homologação local pelo cabo: adb reverse) e 10.0.2.2
//   (emulador falando com o PC). O pacote definitivo não terá estas exceções.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por plugins/with-rede-homologacao.js -->
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">10.0.2.2</domain>
  </domain-config>
</network-security-config>
`;

module.exports = function withRedeHomologacao(config) {
  config = withDangerousMod(config, ["android", async (cfg) => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "network_security_config.xml"), XML);
    return cfg;
  }]);
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) throw new Error("with-rede-homologacao: <application> não encontrado no AndroidManifest");
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return cfg;
  });
};
