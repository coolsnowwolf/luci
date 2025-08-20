include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-wechatpush
PKG_VERSION:=3.6.8

PKG_MAINTAINER:=tty228 <tty228@yeah.net>
PKG_CONFIG_DEPENDS:= \
        CONFIG_PACKAGE_WECHATPUSH_Enable_Traffic_Monitoring \
        CONFIG_PACKAGE_WECHATPUSH_Enable_Local_Disk_Information_Detection \
        CONFIG_PACKAGE_WECHATPUSH_Enable_Host_Information_Detection

LUCI_TITLE:=LuCI support for wechatpush
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+iputils-arping +curl +jq +bash \
        +PACKAGE_WECHATPUSH_Enable_Local_Disk_Information_Detection:lsblk \
        +PACKAGE_WECHATPUSH_Enable_Local_Disk_Information_Detection:smartmontools \
        +PACKAGE_WECHATPUSH_Enable_Local_Disk_Information_Detection:smartmontools-drivedb \
        +PACKAGE_WECHATPUSH_Enable_Host_Information_Detection:openssh-client \
        +PACKAGE_WECHATPUSH_Enable_Host_Information_Detection:openssh-keygen

define Package/luci-app-wechatpush/config
  if PACKAGE_luci-app-wechatpush
    config PACKAGE_WECHATPUSH_Enable_Traffic_Monitoring
      bool "Enable Traffic Monitoring"
      depends on BROKEN
      help
        The traffic statistics feature relies on the wrtbwmon package.
        This plugin may conflict with Routing/NAT, Flow Offloading, and
        proxy internet access plugins, potentially leading to an inability
        to retrieve traffic information.

    config PACKAGE_WECHATPUSH_Enable_Local_Disk_Information_Detection
      bool "Enable Local Disk Information Detection"
      help
        If the lsblk package is not installed, the total disk capacity
        information might be inconsistent with actual values.
        When smartctl is not installed, information about disk temperature,
        power-on time, health status, and more will be unavailable.
        If you are using a virtual machine or have not installed a
        physical disk, this feature is typically unnecessary.

    config PACKAGE_WECHATPUSH_Enable_Host_Information_Detection
      bool "Enable Host Information Detection"
      help
        When using a virtual machine and requiring information about the
        host machine's temperature and disk details, you need to install
        openssh-client and openssh-keygen for SSH connections.
  endif
endef

define Package/luci-app-wechatpush/conffiles
/etc/config/wechatpush
/usr/share/wechatpush/api/diy.json
/usr/share/wechatpush/api/logo.jpg
/usr/share/wechatpush/api/ipv4.list
/usr/share/wechatpush/api/ipv6.list
/usr/share/wechatpush/api/device_aliases.list
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
