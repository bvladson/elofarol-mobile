#!/bin/bash
# Duas cópias CIFRADAS da chave de assinatura Android da MAG, para custódia da empresa.
#
# Uso (Git Bash, no PC que guarda a chave):
#   bash scripts/copiar-chave-cifrada.sh "<destino-1>" "<destino-2>"
#   ex.: bash scripts/copiar-chave-cifrada.sh "/e/MAG-CUSTODIA" "/g/Meu Drive/MAG-Custodia-TI"
#
# O que faz:
#  1. confere a chave antes de copiar: o certificado do mag-crm-release.jks tem de ser o do certificado-sha256.txt
#     (o keytool lê a senha do .jks direto do arquivo; ela não aparece);
#  2. empacota mag-crm-release.jks + senha-keystore.txt + certificado-sha256.txt e cifra EM FLUXO (tar | gpg):
#     nenhuma cópia aberta é gravada em disco;
#  3. cifra OpenPGP simétrica, AES-256, frase-senha derivada com SHA-512 iterado (65 milhões de rodadas), com
#     verificação de integridade (MDC). Abre em qualquer GnuPG (Windows, Linux, Mac), sem depender deste script;
#  4. pede a frase-senha de novo e abre a cópia em memória, conferindo cada arquivo contra o original (SHA-256);
#  5. grava a MESMA cópia nos dois destinos (com um LEIA-ME de restauração) e confere os bytes gravados.
#
# A FRASE-SENHA é digitada por quem roda, na janela do GnuPG. Ela não passa por argumento, arquivo, variável de
# ambiente nem log. Guarde-a SEPARADA das cópias (cofre de senhas da empresa ou envelope lacrado com a diretoria).
# Sem a frase-senha as cópias não abrem; sem as cópias a frase-senha não serve. Nunca envie nenhuma das duas por
# WhatsApp ou e-mail.
#
# Só para teste automatizado: MAG_CRM_ASSINATURA aponta outra pasta de chave e MAG_CHAVE_TESTE_FRASE_FD=<fd> lê a
# frase de um descritor de arquivo (nunca usar com a chave real).
set -euo pipefail
ORIGEM=${MAG_CRM_ASSINATURA:-"$HOME/mag-crm-assinatura"}
KEYTOOL=${KEYTOOL:-"$HOME/.bubblewrap/jdk/bin/keytool.exe"}
D1=${1:?informe o destino 1 (ex.: pendrive da empresa)}
D2=${2:?informe o destino 2 (ex.: pasta restrita no Drive da empresa)}
falhar() { echo "ERRO: $*" >&2; exit 1; }
[ "$D1" != "$D2" ] || falhar "os dois destinos são iguais: as cópias precisam ficar em lugares diferentes"
for f in mag-crm-release.jks senha-keystore.txt certificado-sha256.txt; do [ -s "$ORIGEM/$f" ] || falhar "falta $f em $ORIGEM"; done
command -v gpg >/dev/null || falhar "gpg não encontrado (use o Git Bash)"
[ -x "$KEYTOOL" ] || command -v keytool >/dev/null || falhar "keytool não encontrado"
[ -x "$KEYTOOL" ] || KEYTOOL=keytool
GPG_TESTE=()
if [ -n "${MAG_CHAVE_TESTE_FRASE_FD:-}" ]; then GPG_TESTE=(--batch --pinentry-mode loopback --passphrase-fd "$MAG_CHAVE_TESTE_FRASE_FD"); fi

echo "1/5 conferindo a chave antes de copiar"
ESPERADO=$(tr -d '\r\n ' < "$ORIGEM/certificado-sha256.txt" | tr 'a-f' 'A-F')
ACHADO=$("$KEYTOOL" -list -v -keystore "$ORIGEM/mag-crm-release.jks" -storetype PKCS12 -alias mag-crm -storepass:file "$ORIGEM/senha-keystore.txt" 2>/dev/null \
  | tr -d '\r' | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' | head -1 | tr 'a-f' 'A-F')
[ -n "$ACHADO" ] && [ "$ACHADO" = "$ESPERADO" ] || falhar "o certificado do .jks não confere com certificado-sha256.txt (nada foi copiado)"
echo "    certificado: $ACHADO"

NOME="MAG-CRM-CHAVE-ANDROID-$(date +%Y%m%d-%H%M).tar.gpg"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"
echo "2/5 cifrando (o GnuPG vai pedir a frase-senha duas vezes)"
tar -C "$ORIGEM" -cf - mag-crm-release.jks senha-keystore.txt certificado-sha256.txt \
  | gpg "${GPG_TESTE[@]}" --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
        --force-mdc --no-symkey-cache --compress-algo none --output "$TMP/$NOME"
if [ -n "${MAG_CHAVE_TESTE_FRASE_FD:-}" ]; then exec {MAG_CHAVE_TESTE_FRASE_FD}<&-; fi

echo "3/5 conferindo a cópia: digite a frase-senha de novo (abre só em memória)"
# Só "hash  nome" nos dois lados (o sha256sum do Git Bash marca arquivo binário com "*" antes do nome).
for f in mag-crm-release.jks senha-keystore.txt certificado-sha256.txt; do
  printf "%s  %s\n" "$(sha256sum < "$ORIGEM/$f" | cut -d' ' -f1)" "$f"
done | sort > "$TMP/originais.sha256"
# A conferência lê a frase de novo (sem cache): prova que quem guardou a frase consegue abrir a cópia.
if [ -n "${MAG_CHAVE_TESTE_FRASE_FD_2:-}" ]; then GPG_TESTE=(--batch --pinentry-mode loopback --passphrase-fd "$MAG_CHAVE_TESTE_FRASE_FD_2"); fi
gpg "${GPG_TESTE[@]}" --quiet --no-symkey-cache --decrypt "$TMP/$NOME" \
  | tar -xf - --to-command='printf "%s  %s\n" "$(sha256sum | cut -d" " -f1)" "$TAR_FILENAME"' | sort > "$TMP/copia.sha256"
cmp -s "$TMP/originais.sha256" "$TMP/copia.sha256" || falhar "a cópia aberta não confere com os originais (nada foi gravado nos destinos)"
echo "    os 3 arquivos abertos da cópia são idênticos aos originais"

echo "4/5 gravando nos dois destinos"
SHA=$(sha256sum "$TMP/$NOME" | cut -d' ' -f1)
for D in "$D1" "$D2"; do
  mkdir -p "$D"
  [ ! -e "$D/$NOME" ] || falhar "$D/$NOME já existe"
  cp "$TMP/$NOME" "$D/$NOME"
  cat > "$D/LEIA-ME-$NOME.txt" <<TXT
Cópia CIFRADA da chave de assinatura do aplicativo Android MAG CRM (custódia da MAG Móveis Corporativos).
Arquivo: $NOME
SHA-256 do arquivo cifrado: $SHA
Certificado esperado (SHA-256): $ACHADO
Criada em: $(date '+%d/%m/%Y %H:%M')

Para restaurar (só em caso de perda da chave original), num terminal com GnuPG:
  gpg --decrypt "$NOME" | tar -xf - -C <pasta-vazia-e-protegida>
e digite a frase-senha guardada SEPARADAMENTE (cofre de senhas da empresa ou envelope lacrado).
Conteúdo: mag-crm-release.jks (PKCS12, alias mag-crm), senha-keystore.txt (senha do .jks) e certificado-sha256.txt.
Sem esta chave, nenhuma atualização do aplicativo instala por cima das versões já distribuídas.
Não envie este arquivo nem a frase-senha por WhatsApp ou e-mail.
TXT
done
echo "5/5 conferindo os bytes gravados"
for D in "$D1" "$D2"; do
  [ "$(sha256sum "$D/$NOME" | cut -d' ' -f1)" = "$SHA" ] || falhar "a cópia em $D não confere"
  echo "    ok: $D/$NOME"
done
echo
echo "PRONTO. SHA-256 das duas cópias: $SHA"
echo "Custódia: guarde as cópias em locais diferentes da empresa e a frase-senha separada delas."
echo "Teste de restauração recomendado uma vez por ano (gpg --decrypt ... | tar -tf - lista os 3 arquivos)."
