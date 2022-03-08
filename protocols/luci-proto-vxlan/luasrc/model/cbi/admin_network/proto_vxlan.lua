
local map, section, net = ...

local peeraddr, ipaddr, port, vid, tunlink, mtu, ttl, tos, rxcsum, txcsum

peeraddr = section:taboption("general", Value, "peeraddr", translate("Remote IPv4 address or FQDN"), translate("The IPv4 address or the fully-qualified domain name of the remote tunnel end."))
peeraddr.optional = false
peeraddr.datatype = "or(hostname,ip4addr)"

ipaddr = section:taboption("general", Value, "ipaddr", translate("Local IPv4 address"), translate("The local IPv4 address over which the tunnel is created (optional)."))
ipaddr.optional = true
ipaddr.datatype = "ip4addr"

port = section:taboption("general", Value, "port", translate("Destination port"))
port.optional = true
port.placeholder = 4789
port.datatype = "port"

vid = section:taboption("general", Value, "vid", translate("VXLAN network identifier"), translate("ID used to uniquely identify the VXLAN"))
vid.optional = true
vid.datatype = 'range(1, 16777216)'

tunlink = section:taboption("general", Value, "tunlink", translate("Bind interface"), translate("Bind the tunnel to this interface (optional)."))
tunlink.optional = true


mtu = section:taboption("advanced", Value, "mtu", translate("Override MTU"), translate("Specify an MTU (Maximum Transmission Unit) other than the default (1280 bytes)."))
mtu.optional = true
mtu.placeholder = 1280
mtu.datatype = "range(68, 9200)"

ttl = section:taboption("advanced", Value, "ttl", translate("Override TTL"), translate("Specify a TTL (Time to Live) for the encapsulating packet other than the default (64)."))
ttl.optional = true
ttl.placeholder = 64
ttl.datatype = "min(1)"

tos = section:taboption("advanced", Value, "tos", translate("Override TOS"), translate("Specify a TOS (Type of Service)."))
tos.optional = true
tos.datatype = "range(0, 255)"

rxcsum = section:taboption("advanced", Flag, "rxcsum", translate("Enable rx checksum"))
rxcsum.optional = true
rxcsum.default = rxcsum.enabled

txcsum = section:taboption("advanced", Flag, "txcsum", translate("Enable tx checksum"))
txcsum.optional = true
txcsum.default = txcsum.enabled
