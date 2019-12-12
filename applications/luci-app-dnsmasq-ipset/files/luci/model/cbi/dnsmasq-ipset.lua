-- Auther Qier LU <lvqier@gmail.com>

local m, s, o, p

m = Map("dnsmasq-ipset", translate("DNSmasq IP-Set"), translate("IP-Set settings for DNSMasq-full"))

s = m:section(TypedSection, "ipsets", translate("IP-Set Settings"))
s.anonymous = true
s.addremove = true

o = s:option(Value, "ipset_name", translate("IP-Set Name"))
o.placeholder = "target ipset"
o.default = "shadowsocks"
o.rmempty = false

o = s:option(Flag, "enabled", translate("Enabled"))

o = s:option(Flag, "dns_forward", translate("Forward DNS Lookups"))

p = s:option(Value, "upstream_dns_server", translate("Upstream DNS Server"))
p.placeholder = "Upstream DNS Server"
p.default = "127.0.0.1#5353"
p.rmempty = true

p:depends("dns_forward", "1")

o = s:option(DynamicList, "managed_domain", translate("Managed Domain List"))
o.datatype = "host"

return m
