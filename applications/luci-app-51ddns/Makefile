# SPDX-License-Identifier: Apache-2.0

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for 51DDNS remote access
LUCI_URL:=https://github.com/21hkcloud/51ddns-openwrt
LUCI_DESCRIPTION:=Configure and monitor the 51DDNS remote access agent.
LUCI_DEPENDS:=+luci-base +51ddns-agent +curl +ca-bundle +flock
LUCI_EXTRA_DEPENDS:=51ddns-agent (>=0.6.7-1)
LUCI_PKGARCH:=all

PKG_VERSION:=0.1.7
PKG_RELEASE:=23
PKG_PO_VERSION:=26.310.00009
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Jinshuan Wang <21hkcloud@gmail.com>

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
