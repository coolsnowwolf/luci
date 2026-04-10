#!/bin/sh

NO_RESTART=0
[ "$1" = "--no-restart" ] && NO_RESTART=1

PKI_DIR="/etc/openvpn/pki"
TMP_DIR="$(mktemp -d /tmp/openvpn-pki.XXXXXX)"
CA_SUBJ="/C=US/ST=California/L=San Francisco/O=OpenVPN/OU=OpenVPN/CN=OpenVPN-CA"
SERVER_SUBJ="/C=US/ST=California/L=San Francisco/O=OpenVPN/OU=OpenVPN/CN=server"
CLIENT_SUBJ="/C=US/ST=California/L=San Francisco/O=OpenVPN/OU=OpenVPN/CN=client1"

cleanup() {
	rm -rf "$TMP_DIR"
}

trap cleanup EXIT INT TERM
set -e
umask 077

mkdir -p "$PKI_DIR"

cat > "$TMP_DIR/server_ext.cnf" <<'EOF'
basicConstraints=CA:FALSE
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF

cat > "$TMP_DIR/client_ext.cnf" <<'EOF'
basicConstraints=CA:FALSE
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
keyUsage=digitalSignature
extendedKeyUsage=clientAuth
EOF

rm -f \
	"$PKI_DIR/ca.key" \
	"$PKI_DIR/ca.crt" \
	"$PKI_DIR/server.key" \
	"$PKI_DIR/server.crt" \
	"$PKI_DIR/client1.key" \
	"$PKI_DIR/client1.crt"

openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 3650 \
	-keyout "$PKI_DIR/ca.key" \
	-out "$PKI_DIR/ca.crt" \
	-subj "$CA_SUBJ"

openssl req -nodes -newkey rsa:2048 \
	-keyout "$PKI_DIR/server.key" \
	-out "$TMP_DIR/server.csr" \
	-subj "$SERVER_SUBJ"

openssl x509 -req -sha256 -days 3650 \
	-in "$TMP_DIR/server.csr" \
	-CA "$PKI_DIR/ca.crt" \
	-CAkey "$PKI_DIR/ca.key" \
	-CAcreateserial \
	-out "$PKI_DIR/server.crt" \
	-extfile "$TMP_DIR/server_ext.cnf"

openssl req -nodes -newkey rsa:2048 \
	-keyout "$PKI_DIR/client1.key" \
	-out "$TMP_DIR/client1.csr" \
	-subj "$CLIENT_SUBJ"

openssl x509 -req -sha256 -days 3650 \
	-in "$TMP_DIR/client1.csr" \
	-CA "$PKI_DIR/ca.crt" \
	-CAkey "$PKI_DIR/ca.key" \
	-CAserial "$PKI_DIR/ca.srl" \
	-out "$PKI_DIR/client1.crt" \
	-extfile "$TMP_DIR/client_ext.cnf"

[ -s "$PKI_DIR/dh.pem" ] || openssl dhparam -out "$PKI_DIR/dh.pem" 2048

[ "$NO_RESTART" -eq 1 ] || /etc/init.d/openvpn restart

echo "OpenVPN Cert renew successfully"
