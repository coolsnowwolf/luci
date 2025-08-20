include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for IPSec VPN Server (IKEv1 with PSK and Xauth)
LUCI_DEPENDS:=+strongswan +strongswan-minimal +strongswan-mod-xauth-generic +strongswan-mod-kernel-libipsec +kmod-tun
LUCI_PKGARCH:=all

define Package/luci-app-ipsec-vpnd/conffiles
/etc/config/ipsec-vpnd
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
