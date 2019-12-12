local fs = require "nixio.fs"

local f = SimpleForm("firewall",
	translate("Dnsmasq Domain List"))

local o = f:field(Value, "_custom")

o.template = "cbi/tvalue"
o.rows = 20

function o.cfgvalue(self, section)
	return fs.readfile("/etc/config/domain-list")
end

function o.write(self, section, value)
	value = value:gsub("\r\n?", "\n")
	fs.writefile("/etc/config/domain-list", value)
	
	rule ='#Server&Ipset List\n'

	for w in string.gmatch(value,"([^\n]+)") do
		rule = rule..'server=/'..w..'/127.0.0.1#5053\n'
		rule = rule..'ipset=/'..w..'/ssfw\n'
	end

	fs.writefile("/etc/dnsmasq.d/ssfw.conf", rule)

	luci.sys.call("/etc/init.d/dnsmasq restart")
end

return f
