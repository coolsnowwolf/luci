#
# Copyright (C) 2008-2019 Jerrykuku
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=Argon Theme (Design Mod)
LUCI_DEPENDS:=+curl +jsonfilter
PKG_VERSION:=2.3.2
PKG_RELEASE:=20250520

define Package/luci-theme-argon/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.Design
	uci set luci.main.mediaurlbase='/luci-static/bootstrap'
	uci commit luci
}
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
