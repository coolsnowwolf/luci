
local netmod = luci.model.network
local interface = luci.model.network.interface
local proto = netmod:register_protocol("vxlan")

function proto.get_i18n(self)
	return luci.i18n.translate("VXLAN (RFC7348)")
end

function proto.ifname(self)
	return self.sid
end

function proto.get_interface(self)
	return interface(self:ifname(), self)
end

function proto.opkg_package(self)
	return "vxlan"
end

function proto.is_installed(self)
	return nixio.fs.access("/lib/netifd/proto/vxlan.sh")
end

function proto.is_floating(self)
	return true
end

function proto.is_virtual(self)
	return true
end

function proto.get_interfaces(self)
	return nil
end

function proto.contains_interface(self, ifc)
	 return (netmod:ifnameof(ifc) == self:ifname())
end
