# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for OpenVPN Server
LUCI_DEPENDS:=+openvpn-openssl +openvpn-easy-rsa +kmod-tun
LUCI_PKGARCH:=all
PKG_NAME:=luci-app-openvpn-server
PKG_VERSION:=3.0
PKG_RELEASE:=0

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
