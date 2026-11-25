// Variantes do MAG CRM nativo. O app.json descreve a de HOMOLOGAÇÃO (pacote .hml, servidor local liberado), como
// sempre foi; sem variável nada muda.
// MAG_CRM_VARIANTE=definitiva gera o pacote da equipe:
//  - pacote br.com.magmoveiscorporativos.crm (o mesmo do app de teste anterior: com a chave da MAG e código maior,
//    entra como atualização por cima), nome "MAG CRM" e esquema de link próprio;
//  - extra.variante "definitiva": só o servidor de produção (src/lib/config.ts);
//  - rede só HTTPS, sem as exceções de HTTP da homologação (plugins/with-rede-definitiva.js).
// Versão e código de versão são os do app.json: um contador único para todos os APKs (o código só sobe).
const REDE_HML = "./plugins/with-rede-homologacao.js";
const REDE_DEFINITIVA = "./plugins/with-rede-definitiva.js";

module.exports = ({ config }) => {
  const variante = process.env.MAG_CRM_VARIANTE || "hml";
  if (variante === "hml") return config;
  if (variante !== "definitiva") throw new Error(`MAG_CRM_VARIANTE desconhecida: ${variante} (use "definitiva" ou nada)`);
  if (!config.plugins.includes(REDE_HML)) throw new Error("app.config.js: plugin de rede da homologação não encontrado no app.json");
  return {
    ...config,
    name: "MAG CRM",
    scheme: "magcrm",
    android: { ...config.android, package: "br.com.magmoveiscorporativos.crm" },
    plugins: config.plugins.map((plugin) => (plugin === REDE_HML ? REDE_DEFINITIVA : plugin)),
    extra: { ...config.extra, variante: "definitiva" },
  };
};
