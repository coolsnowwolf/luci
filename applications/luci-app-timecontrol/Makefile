# Copyright (C) 2020 Lienol <lawlienol@gmail.com>
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Time Control
LUCI_DEPENDS:=+luci-base @(PACKAGE_firewall||PACKAGE_firewall4)
LUCI_PKGARCH:=all
PKG_VERSION:=1.1
PKG_RELEASE:=3

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
