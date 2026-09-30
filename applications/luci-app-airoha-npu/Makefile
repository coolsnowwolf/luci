# This is free software, licensed under the Apache License, Version 2.0 .

include $(TOPDIR)/rules.mk

PKG_VERSION:=1.0.1
PKG_RELEASE:=2
PKG_LICENSE:=Apache-2.0

LUCI_TITLE:=LuCI Airoha SoC Status (NPU, CPU, Frame Engine)
LUCI_DEPENDS:=+luci-base @TARGET_airoha

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
