# SPDX-License-Identifier: Apache-2.0
#
# Copyright (C) 2025 ImmortalWrt.org

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Scheduled Reboot

define Package/luci-app-autoreboot/conffiles
/etc/config/autoreboot
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
