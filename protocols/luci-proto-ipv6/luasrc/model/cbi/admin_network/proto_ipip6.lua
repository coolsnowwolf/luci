local map, section, net = ...
local peeraddr, ip4ifaddr, ip6addr
local tunlink, encaplimit, defaultroute, metric, mtu

peeraddr = section:taboption("general", Value, "peeraddr", translate("Remote IPv6 address"))
peeraddr.datatype = "ip6addr"
peeraddr.rmempty  = false

ip4ifaddr = section:taboption("general", Value, "ip4ifaddr", translate("Local IPv4 address"))
ip4ifaddr.datatype = "ip4addr"
ip4ifaddr.rmempty  = false

ip6addr = section:taboption("general", Value, "ip6addr", translate("Local IPv6 address"), translate("Leave empty to use the current WAN address"))
ip6addr.datatype = "ip6addr"
ip6addr.rmempty = true

tunlink = section:taboption("advanced", DynamicList, "tunlink", translate("Tunnel Link"))
tunlink.template = "cbi/network_netlist"
tunlink.nocreate = true

encaplimit = section:taboption("advanced", Value, "encaplimit", translate("Encapsulation limit"))
for i = 0, 255 do
    encaplimit:value(tostring(i))
end
encaplimit:value("ignore")
encaplimit.default = "ignore"
encaplimit.rmempty = false

defaultroute = section:taboption("advanced", Flag, "defaultroute", translate("Default gateway"), translate("If unchecked, no default route is configured"))
defaultroute.default = defaultroute.enabled

ip6assign = section:taboption("advanced", Value, "ip6assign", translate("IPv6 assignment length"),
		translate("Assign a part of given length of every public IPv6-prefix to this interface"))
ip6assign:value("", translate("disabled"))
ip6assign:value("64")
ip6assign.datatype = "max(128)"

ip6hint = section:taboption("advanced", Value, "ip6hint", translate("IPv6 assignment hint"),
		translate("Assign prefix parts using this hexadecimal subprefix ID for this interface."))
for i=33,64 do ip6hint:depends("ip6assign", i) end


ip6hint = section:taboption("advanced", Value, "ip6prefix",
	translate("Custom delegated IPv6-prefix"))
ip6hint.dataype = "ip6addr"

ip6ifaceid = section:taboption("advanced", Value, "ip6ifaceid",
	translate("IPv6 suffix"), translate("Optional. Allowed values: 'eui64', 'random', fixed value like '::1' or '::1:2'. When IPv6 prefix (like 'a:b:c:d::') is received from a delegating server, use the suffix (like '::1') to form the IPv6 address ('a:b:c:d::1') for the interface."))
ip6ifaceid.dataype = "ip6hostid"
ip6ifaceid.placeholder = "::1"
ip6ifaceid.rmempty = true

ip6weight = section:taboption("advanced", Value, "ip6weight",
	translate("IPv6 preference"), translate("When delegating prefixes to multiple downstreams, interfaces with a higher preference value are considered first when allocating subnets."))
ip6weight.dataype = "uinteger"
ip6weight.placeholder = "0"

metric = section:taboption("advanced", Value, "metric", translate("Use gateway metric"))
metric.datatype = "uinteger"
metric:depends("defaultroute", defaultroute.enabled)
metric.placeholder = "0"

mtu = section:taboption("advanced", Value, "mtu", translate("Use MTU on tunnel interface"))
mtu.datatype = "max(9200)"
mtu.placeholder = "1280"
