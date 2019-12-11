#
# Copyright 2019 Xingwang Liao <kuoruan@gmail.com>
# Licensed to the public under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-frpc
PKG_VERSION:=1.2.1
PKG_RELEASE:=1

PKG_LICENSE:=MIT
PKG_MAINTAINER:=Xingwang Liao <kuoruan@gmail.com>

LUCI_TITLE:=LuCI support for Frpc
LUCI_DEPENDS:=
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/conffiles
/etc/config/frpc
endef

include $(TOPDIR)/feeds/luci/luci.mk

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	( . /etc/uci-defaults/40_luci-frpc ) && rm -f /etc/uci-defaults/40_luci-frpc
fi

chmod 755 "$${IPKG_INSTROOT}/etc/init.d/frpc" >/dev/null 2>&1
ln -sf "../init.d/frpc" \
	"$${IPKG_INSTROOT}/etc/rc.d/S99frpc" >/dev/null 2>&1
exit 0
endef

# call BuildPackage - OpenWrt buildroot signature
