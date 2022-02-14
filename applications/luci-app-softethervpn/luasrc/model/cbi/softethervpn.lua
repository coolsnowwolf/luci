local s = require"luci.sys"
local m,s,o

m = Map("softethervpn")
m.title = translate("SoftEther VPN Service")
m.description = translate("SoftEther VPN is an open source, cross-platform, multi-protocol virtual private network solution developed by university of tsukuba graduate student Daiyuu Nobori for master's thesis. <br>can easily set up OpenVPN, IPsec, L2TP, ms-sstp, L2TPv3 and EtherIP servers on the router using the console.")

m:section(SimpleSection).template = "softethervpn/softethervpn_status"

s = m:section(TypedSection, "softether")
s.anonymous = true

o = s:option(Flag, "enable", translate("Enabled"))
o.rmempty = false

o = s:option(DummyValue, "moreinfo", translate("<strong>控制台下载：<a onclick=\"window.open('https://github.com/SoftEtherVPN/SoftEtherVPN_Stable/releases/download/v4.38-9760-rtm/softether-vpnserver_vpnbridge-v4.38-9760-rtm-2021.08.17-windows-x86_x64-intel.exe')\"><br/>Windows-x86_x64-intel.exe</a><a  onclick=\"window.open('https://www.softether-download.com/files/softether/v4.21-9613-beta-2016.04.24-tree/Mac_OS_X/Admin_Tools/VPN_Server_Manager_Package/softether-vpnserver_manager-v4.21-9613-beta-2016.04.24-macos-x86-32bit.pkg')\"><br/>macos-x86-32bit.pkg</a></strong>"))

return m
