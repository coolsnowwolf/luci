include $(TOPDIR)/rules.mk

PKG_VERSION:=1.0.5-3
PKG_RELEASE:=

PKG_MAINTAINER:=Sense <sensec@gmail.com>

LUCI_TITLE:=LuCI Support for XLNetAcc
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+jshn +curl +openssl-util

define Package/$(PKG_NAME)/conffiles
/etc/config/xlnetacc
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
