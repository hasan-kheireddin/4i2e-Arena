#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
KEY_FILE="${SCRIPT_DIR}/server.key"
CERT_FILE="${SCRIPT_DIR}/server.crt"

read_env_var() {
    local key="$1"
    local raw

    [ -f "$ENV_FILE" ] || return 0

    raw="$(grep -m1 -E "^${key}=" "$ENV_FILE" | tr -d '\r' || true)"
    raw="${raw#*=}"

    if [[ "$raw" == \"*\" && "$raw" == *\" ]]; then
        raw="${raw:1:${#raw}-2}"
    elif [[ "$raw" == \'*\' && "$raw" == *\' ]]; then
        raw="${raw:1:${#raw}-2}"
    fi

    printf '%s' "$raw"
}

PUBLIC_APP_ORIGIN="${PUBLIC_APP_ORIGIN:-$(read_env_var PUBLIC_APP_ORIGIN)}"
SSL_EXTRA_DNS_NAMES="${SSL_EXTRA_DNS_NAMES:-$(read_env_var SSL_EXTRA_DNS_NAMES)}"
SSL_EXTRA_IPS="${SSL_EXTRA_IPS:-$(read_env_var SSL_EXTRA_IPS)}"

PUBLIC_APP_ORIGIN="${PUBLIC_APP_ORIGIN:-https://localhost:8443}"
PUBLIC_HOST="$(printf '%s' "$PUBLIC_APP_ORIGIN" | sed -E 's#^[a-zA-Z]+://([^/:]+).*$#\1#')"
CERT_COMMON_NAME="localhost"
SAN_ENTRIES=("DNS:localhost" "IP:127.0.0.1")

if [ -n "$PUBLIC_HOST" ] && [ "$PUBLIC_HOST" != "localhost" ] && [ "$PUBLIC_HOST" != "127.0.0.1" ]; then
    CERT_COMMON_NAME="$PUBLIC_HOST"
    if [[ "$PUBLIC_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        SAN_ENTRIES+=("IP:$PUBLIC_HOST")
    else
        SAN_ENTRIES+=("DNS:$PUBLIC_HOST")
    fi
fi

if [ -n "${SSL_EXTRA_DNS_NAMES:-}" ]; then
    IFS=',' read -ra EXTRA_DNS_NAMES <<< "$SSL_EXTRA_DNS_NAMES"
    for dns_name in "${EXTRA_DNS_NAMES[@]}"; do
        dns_name="$(printf '%s' "$dns_name" | xargs)"
        if [ -n "$dns_name" ]; then
            SAN_ENTRIES+=("DNS:$dns_name")
        fi
    done
fi

if [ -n "${SSL_EXTRA_IPS:-}" ]; then
    IFS=',' read -ra EXTRA_IPS <<< "$SSL_EXTRA_IPS"
    for ip_addr in "${EXTRA_IPS[@]}"; do
        ip_addr="$(printf '%s' "$ip_addr" | xargs)"
        if [ -n "$ip_addr" ]; then
            SAN_ENTRIES+=("IP:$ip_addr")
        fi
    done
fi

SUBJECT_ALT_NAME="$(IFS=,; printf '%s' "${SAN_ENTRIES[*]}")"

if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
    echo "  SSL certificates already exist. Skipping generation."
    echo "  Delete nginx/ssl/server.key and nginx/ssl/server.crt to regenerate."
    exit 0
fi

echo " Generating self-signed SSL certificate..."

openssl req -x509 \
    -nodes \
    -days 365 \
    -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=US/ST=Local/L=Dev/O=ft_transcendence/OU=Dev/CN=${CERT_COMMON_NAME}" \
    -addext "subjectAltName=${SUBJECT_ALT_NAME}" \
    2>/dev/null

echo "SSL certificate generated successfully!"
echo "    Key:  $KEY_FILE"
echo "    Cert: $CERT_FILE"
