# SPDX-License-Identifier: Apache-2.0
#
# Copyright (C) 2025 ImmortalWrt.org

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI for SMB/CIFS Mount
LUCI_DEPENDS:=+kmod-fs-cifs

PKG_PROVIDES:=luci-app-cifs

define Package/luci-app-cifs-mount/conffiles
/etc/config/cifs-mount
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
