#
# Copyright (C) 2008-2014 The LuCI Team <luci@lists.subsignal.org>
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI for Zerotier
LUCI_DEPENDS:=+zerotier
LUCI_PKGARCH:=all
PKG_VERSION:=1.2.0
PKG_RELEASE:=

include $(TOPDIR)/feeds/luci/luci.mk

define Package/luci-app-zerotier/prerm
#!/bin/sh

/etc/init.d/zerotier enable
/etc/init.d/luci_zerotier disable
/etc/init.d/luci_zerotier stop
exit 0
endef

define Package/luci-app-zerotier/conffiles
/etc/config/zero
endef

# call BuildPackage - OpenWrt buildroot signature
