# SPDX-License-Identifier: GPL-2.0-only
include $(TOPDIR)/rules.mk

PKG_VERSION:=1.4
PKG_RELEASE:=4
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)
PKG_LICENSE:=GPL-2.0-only

LUCI_TITLE:=Design Theme Configuration
LUCI_DEPENDS:=+luci-theme-design
LUCI_PKGARCH:=all

define Package/luci-app-design-config/conffiles
/etc/config/design
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
