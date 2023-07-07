include $(TOPDIR)/rules.mk

LUCI_TITLE:=Docker Manager interface for LuCI
LUCI_DEPENDS:=+luci-compat +luci-lib-docker +luci-lib-ip +docker +dockerd +cgroupfs-mount +ttyd
LUCI_PKGARCH:=all

PKG_NAME:=luci-app-dockerman
PKG_VERSION:=v0.5.26
PKG_RELEASE:=1

PKG_LICENSE:=AGPL-3.0
PKG_MAINTAINER:=lisaac <lisaac.cn@gmail.com>

define Package/luci-app-dockerman/postinst
#!/bin/sh

/init.sh env
touch /etc/config/dockerd
uci set dockerd.dockerman=dockerman
uci set dockerd.dockerman.socket_path=`uci get dockerd.dockerman.socket_path 2&> /dev/null || echo '/var/run/docker.sock'`
uci set dockerd.dockerman.status_path=`uci get dockerd.dockerman.status_path 2&> /dev/null || echo '/tmp/.docker_action_status'`
uci set dockerd.dockerman.debug=`uci get dockerd.dockerman.debug 2&> /dev/null || echo 'false'`
uci set dockerd.dockerman.debug_path=`uci get dockerd.dockerman.debug_path 2&> /dev/null || echo '/tmp/.docker_debug'`
uci set dockerd.dockerman.remote_port=`uci get dockerd.dockerman.remote_port 2&> /dev/null || echo '2375'`
uci set dockerd.dockerman.remote_endpoint=`uci get dockerd.dockerman.remote_endpoint 2&> /dev/null || echo '0'`
uci del_list dockerd.dockerman.ac_allowed_interface='br-lan'
uci add_list dockerd.dockerman.ac_allowed_interface='br-lan'
uci commit dockerd
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
