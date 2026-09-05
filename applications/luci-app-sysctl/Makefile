# SPDX-License-Identifier: Apache-2.0

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sysctl
PKG_VERSION:=1.7.1
PKG_RELEASE:=1

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=luci-app-sysctl contributors

LUCI_TITLE:=LuCI application to manage kernel sysctl parameters
LUCI_DESCRIPTION:=View live kernel parameters and manage custom sysctl entries \
 stored in /etc/sysctl.d/99-luci-sysctl.conf from the LuCI web interface. \
 Supports browsing /proc/sys, searching parameters, one-click apply and \
 immediate runtime activation of single parameters.
LUCI_DEPENDS:=+luci-base +rpcd +rpcd-mod-ucode
LUCI_PKGARCH:=all

define Package/luci-app-sysctl/conffiles
/etc/sysctl.d/99-luci-sysctl.conf
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
