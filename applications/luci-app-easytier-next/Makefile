include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for EasyTier Next
LUCI_URL:=https://github.com/EasyTier/EasyTier
PKG_DESCRIPTION:=Provides a modern LuCI Web management interface for EasyTier decentralized mesh VPN.
PKG_MAINTAINER:=Dante <dante@seckv.com>
LUCI_DEPENDS:=+easytier-next +luci-base
LUCI_PKGARCH:=all

define Package/luci-app-easytier-next/conffiles
/etc/config/easytier
/etc/easytier/
endef

define Package/luci-app-easytier-next/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	rm -f /tmp/luci-indexcache.* /tmp/luci-modulecache/* 2>/dev/null
	chmod 0755 /etc/init.d/easytier /etc/hotplug.d/iface/99-easytier-routes 2>/dev/null || true
	/etc/init.d/rpcd restart 2>/dev/null || true
}
exit 0
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
