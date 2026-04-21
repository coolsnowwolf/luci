#!/bin/sh

required_files="
/etc/openvpn/pki/ca.crt
/etc/openvpn/pki/dh.pem
/etc/openvpn/pki/server.crt
/etc/openvpn/pki/server.key
/etc/openvpn/pki/client1.crt
/etc/openvpn/pki/client1.key
"

for cert in $required_files; do
	[ -s "$cert" ] || exec /etc/openvpn/renewcert.sh --no-restart
done

exit 0