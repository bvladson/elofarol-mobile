// Plugin de configuração do Expo: encurta os caminhos dos arquivos-objeto do C++ no Windows.
//
// A Nova Arquitetura compila o código gerado das bibliotecas (codegen) dentro do CMake do app, e o CMake embute o
// caminho inteiro do código-fonte no nome do arquivo .o. No Windows isso passa de 260 caracteres e o ninja 1.10
// (que vem com o CMake do Android SDK) falha com "Filename longer than 260 characters". Com CMAKE_OBJECT_PATH_MAX,
// o CMake troca a parte longa por um código curto (hash). Não exige administrador nem mexe no Windows.
// Fica num plugin (e não editado à mão em android/) para valer a cada "expo prebuild".
// 250 (era 240 até 25/11/2026): com armeabi-v7a a pasta dos objetos é 2 caracteres maior que com arm64-v8a, e o nome
// já encurtado (pasta + hash + arquivo) passava de 240; aí o CMake desiste de encurtar e o ninja recusa o caminho
// longo (272). Com 250 o nome encurtado cabe e continua abaixo dos 260 do Windows.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARCADOR = "-DCMAKE_OBJECT_PATH_MAX=";

module.exports = function withCmakeCaminhosCurtos(config, { max = 250 } = {}) {
  return withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes(MARCADOR)) return cfg;
    if (!/defaultConfig\s*\{/.test(contents)) throw new Error("with-cmake-caminhos-curtos: defaultConfig não encontrado em android/app/build.gradle");
    cfg.modResults.contents = contents.replace(
      /defaultConfig\s*\{/,
      `defaultConfig {\n        // Caminhos curtos para o C++ no Windows (plugins/with-cmake-caminhos-curtos.js)\n        externalNativeBuild { cmake { arguments "${MARCADOR}${max}" } }`,
    );
    return cfg;
  });
};
