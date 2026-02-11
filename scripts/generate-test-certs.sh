#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ECDSA_DIR="$ROOT_DIR/tests/fixtures/ecdsa"
RSA_DIR="$ROOT_DIR/tests/fixtures/rsa"

mkdir -p "$ECDSA_DIR" "$RSA_DIR"

force=0
if [[ "${1:-}" == "--force" ]]; then
  force=1
fi

gen_ecdsa() {
  local out="$1"
  if [[ -f "$out" && "$force" -ne 1 ]]; then
    return
  fi
  local key
  key="$(mktemp)"
  openssl ecparam -name prime256v1 -genkey -noout -out "$key"
  openssl req -x509 -new -key "$key" -subj "/CN=ECDSA Dummy ${2}" -days 3650 -outform DER -out "$out"
  rm -f "$key"
}

gen_rsa() {
  local out="$1"
  if [[ -f "$out" && "$force" -ne 1 ]]; then
    return
  fi
  local key
  key="$(mktemp)"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$key" -subj "/CN=RSA Dummy ${2}" -days 3650 -outform DER -out "$out"
  rm -f "$key"
}

for i in 1 2 3; do
  gen_ecdsa "$ECDSA_DIR/dummy-$i.cer" "$i"
done

for i in 1 2 3; do
  gen_rsa "$RSA_DIR/dummy-$i.cer" "$i"
done

echo "Generated test certs in:"
echo "  $ECDSA_DIR"
echo "  $RSA_DIR"
