# SPDX-License-Identifier: GPL-2.0-only
include $(TOPDIR)/rules.mk

PKG_VERSION:=1.0.3
PKG_RELEASE:=1
PKG_LICENSE:=GPL-2.0-only AND CC0-1.0 AND MIT AND LicenseRef-Public-Domain
LUCI_MAINTAINER:=coolsnowwolf <coolsnowwolf@gmail.com>

LUCI_TITLE:=Local OUI vendor icons for DHCP leases
LUCI_DEPENDS:=+luci-base
LUCI_PKGARCH:=all

define Package/luci-app-oui/conffiles
/etc/config/oui
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
