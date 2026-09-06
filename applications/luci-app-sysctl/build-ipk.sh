#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# build-ipk.sh - pack luci-app-sysctl into an opkg-installable .ipk
#                without requiring the OpenWrt SDK/buildroot.
#
# Usage:
#   ./build-ipk.sh [output-directory]
#
# The produced .ipk targets OpenWrt 24.10 (opkg, "all" architecture):
#   opkg install luci-app-sysctl_<version>-<release>_all.ipk

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$SCRIPT_DIR"
OUT_DIR="${1:-$PKG_DIR}"

# --- read package identity from the OpenWrt Makefile -----------------------
get_var() {
	sed -n "s/^$1:=//p" "$PKG_DIR/Makefile" | head -1
}

PKG_NAME="$(get_var PKG_NAME)"
PKG_VERSION="$(get_var PKG_VERSION)"
PKG_RELEASE="$(get_var PKG_RELEASE)"

for v in PKG_NAME PKG_VERSION PKG_RELEASE; do
	if [ -z "$(eval "echo \$$v")" ]; then
		echo "ERROR: $v not found in $PKG_DIR/Makefile" >&2
		exit 1
	fi
done

IPK_NAME="${PKG_NAME}_${PKG_VERSION}-${PKG_RELEASE}_all.ipk"

# --- sanity checks ----------------------------------------------------------
for f in \
	"$PKG_DIR/htdocs/luci-static/resources/view/sysctl.js" \
	"$PKG_DIR/root/usr/share/rpcd/ucode/luci.sysctl" \
	"$PKG_DIR/root/usr/share/luci/menu.d/$PKG_NAME.json" \
	"$PKG_DIR/root/usr/share/rpcd/acl.d/$PKG_NAME.json" \
	"$PKG_DIR/root/etc/sysctl.d/99-luci-sysctl.conf"
do
	if [ ! -f "$f" ]; then
		echo "ERROR: required file missing: $f" >&2
		exit 1
	fi
done

# --- staging ----------------------------------------------------------------
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

DATA="$WORK/data"
CTRL="$WORK/control"

mkdir -p "$DATA" "$CTRL"

# root/ maps to /
cp -a "$PKG_DIR/root/." "$DATA/"

# htdocs/ maps to /www
mkdir -p "$DATA/www"
cp -a "$PKG_DIR/htdocs/." "$DATA/www/"

# uniform ownership/permissions; rpcd refuses world-writable ucode plugins
find "$DATA" -type d -exec chmod 755 {} +
find "$DATA" -type f -exec chmod 644 {} +

# --- control metadata ---------------------------------------------------------
cat > "$CTRL/control" <<EOF
Package: $PKG_NAME
Version: $PKG_VERSION-$PKG_RELEASE
Architecture: all
Maintainer: luci-app-sysctl contributors
Section: luci
Priority: optional
Depends: libc, luci-base, rpcd, rpcd-mod-ucode
Description: LuCI application to manage kernel sysctl parameters
 View live kernel parameters and manage custom sysctl entries
 in /etc/sysctl.d/99-luci-sysctl.conf from the LuCI web interface.
EOF

cat > "$CTRL/conffiles" <<'EOF'
/etc/sysctl.d/99-luci-sysctl.conf
EOF

cat > "$CTRL/postinst" <<'EOF'
#!/bin/sh
# register the new ubus object and invalidate the LuCI menu cache
if [ -x /etc/init.d/rpcd ]; then
	/etc/init.d/rpcd restart
fi
rm -f /tmp/luci-indexcache* 2>/dev/null
exit 0
EOF

chmod 755 "$CTRL/postinst"
chmod 644 "$CTRL/control" "$CTRL/conffiles"

# --- archive ----------------------------------------------------------------
TAR_FLAGS=(--owner=0 --group=0 --numeric-owner)

tar "${TAR_FLAGS[@]}" -czf "$WORK/data.tar.gz" -C "$DATA" ./etc ./usr ./www
tar "${TAR_FLAGS[@]}" -czf "$WORK/control.tar.gz" -C "$CTRL" ./control ./conffiles ./postinst

printf '2.0\n' > "$WORK/debian-binary"

IPK_PATH="$OUT_DIR/$IPK_NAME"
mkdir -p "$OUT_DIR"
rm -f "$IPK_PATH"
tar -czf "$IPK_PATH" -C "$WORK" debian-binary control.tar.gz data.tar.gz

echo "OK: $IPK_PATH"
