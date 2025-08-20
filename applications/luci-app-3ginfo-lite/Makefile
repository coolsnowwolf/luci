#
# Copyright 2021-2024 Rafał Wabik - IceG - From eko.one.pl forum
#
# Licensed to the GNU General Public License v3.0.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI JS Support for 3ginfo-lite
LUCI_DESCRIPTION:=LuCI JS interface for the 3ginfo-lite. The package allows you to view the parameters of the mobile internet connection.
LUCI_DEPENDS:=+sms-tool +comgt +kmod-usb-serial-option

PKG_NAME:=luci-app-3ginfo-lite
PKG_VERSION:=1.0.74
PKG_RELEASE:=20241111
PKG_MAINTAINER:=Rafał Wabik <4Rafal@gmail.com>

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
