#
# Copyright (C) 2026
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=Support for OpenVPN Client
LUCI_DESCRIPTION:=This package provides support for OpenVPN client configuration in LuCI.
LUCI_DEPENDS:=+openvpn +kmod-tun +firewall
LUCI_PKGARCH:=all
PKG_VERSION:=1
PKG_RELEASE:=1

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature