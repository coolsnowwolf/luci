
local a, t, e

a = Map("zerotier", translate("ZeroTier"),
	translate("Zerotier is an open source, cross-platform and easy to use virtual LAN"))
a:section(SimpleSection).template  = "zerotier/zerotier_status"

t = a:section(NamedSection, "sample_config", "zerotier")
t.anonymous = true
t.addremove = false

e = t:option(Flag, "enabled", translate("Enabled"))
e.default = 0
e.rmempty=false

e = t:option(Flag, "nat", translate("Auto NAT Clients"), translate("Allow zerotier clients access your LAN network"))
e.default = 0
e.rmempty = false

e = t:option(DummyValue, "opennewwindow" , 
	translate("<input type=\"button\" class=\"cbi-button cbi-button-apply\" value=\"Zerotier.com\" onclick=\"window.open('https://my.zerotier.com/network')\" />"),
	translate("Create or manage your zerotier network, and auth clients who could access"))

t = a:section(TypedSection, "join", translate("Join Network"))
t.anonymous = true
t.addremove = true
t.template = "cbi/tblsection"

e = t:option(Flag, "enabled", translate("Enabled"))
e.default = 1

e = t:option(Value, "network", translate("ZeroTier Network ID"))
e.datatype = "and(rangelength(16,16),hexstring)"
e.maxlength = 16
e.size = 16
e.rmempty = false

e = t:option(Flag, "allow_managed", translate("Allow Managed"))
e.default = 1

e = t:option(Flag, "allow_global", translate("Allow Global"))

e = t:option(Flag, "allow_default", translate("Allow Default"))

e = t:option(Flag, "allow_dns", translate("Allow DNS"))

return a
