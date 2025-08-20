# SPDX-License-Identifier: Apache-2.0
#
# Copyright (C) 2025 ImmortalWrt.org

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for simple port forwarding via 3proxy
LUCI_DEPENDS:=+3proxy-mod-tcppm +3proxy-mod-udppm

PKG_MAINTAINER:=Tianling Shen <cnsztl@immortalwrt.org>
PKG_PROVIDES:=luci-app-socat

define Package/luci-app-3cat/conffiles
/etc/config/3cat
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
