set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="${SCRIPT_DIR}/server.key"
CERT_FILE="${SCRIPT_DIR}/server.crt"

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
    -subj "/C=US/ST=Local/L=Dev/O=ft_transcendence/OU=Dev/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    2>/dev/null

echo "SSL certificate generated successfully!"
echo "    Key:  $KEY_FILE"
echo "    Cert: $CERT_FILE"