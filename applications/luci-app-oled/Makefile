#
# Copyright (C) 2020 Nate Ding
#
# This is free software, licensed under the GUN General Public License v3.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

LUCI_Title:=LuCI support for ssd1306 0.91\' 138x32 display
LUCI_DEPENDS:=+i2c-tools +libconfig

PKG_LICENSE:=GPLv3
PKG_LINCESE_FILES:=LICENSE
PKG_MAINTAINER:=natelol <natelol@github.com>

define Package/luci-app-oled/conffiles
/etc/config/oled
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
