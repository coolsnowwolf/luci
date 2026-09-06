# SPDX-License-Identifier: Apache-2.0
#
# Copyright (C) 2026 luci-app-sysctl contributors
#
# LuCI application: manage kernel sysctl parameters from the web UI.
#
# Build inside OpenWrt 24.10 buildroot/SDK:
#   - copy this directory to package/luci-app-sysctl  (needs luci feed installed), or
#   - copy to feeds/luci/applications/luci-app-sysctl and re-run feeds update/install
#   then:  make menuconfig  ->  LuCI -> Applications -> luci-app-sysctl
#          make package/luci-app-sysctl/compile V=s

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sysctl
PKG_VERSION:=1.5.9
PKG_RELEASE:=1

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=luci-app-sysctl contributors

LUCI_TITLE:=LuCI application to manage kernel sysctl parameters
LUCI_DESCRIPTION:=View live kernel parameters and manage custom sysctl entries \
 stored in /etc/sysctl.d/99-luci-sysctl.conf from the LuCI web interface. \
 Supports browsing /proc/sys, searching parameters, one-click apply and \
 immediate runtime activation of single parameters.
LUCI_DEPENDS:=+luci-base +rpcd +rpcd-mod-ucode
LUCI_CONFFILES:=/etc/sysctl.d/99-luci-sysctl.conf
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
