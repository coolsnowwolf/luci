
local m, s, o
local clash = "clash"
local uci = luci.model.uci.cursor()
local fs = require "nixio.fs"
local sys = require "luci.sys"
local sid = arg[1]


m = Map(clash, translate("Edit Group"))
--m.pageaction = false
m.redirect = luci.dispatcher.build_url("admin/services/clash/create")
if m.uci:get(clash, sid) ~= "groups" then
	luci.http.redirect(m.redirect)
	return
end

-- [[ Groups Setting ]]--
s = m:section(NamedSection, sid, "groups")
s.anonymous = true
s.addremove   = false

o = s:option(ListValue, "type", translate("Group Type"))
o.rmempty = true
o.description = translate("Choose The Operation Mode")
o:value("select", translate("Select"))
o:value("url-test", translate("URL-Test"))
o:value("fallback", translate("Fallback"))
o:value("load-balance", translate("Load-Balance"))

o = s:option(Value, "name", translate("Group Name"))
o.rmempty = false

o = s:option(Value, "test_url", translate("Test URL"))
o.default = "http://www.gstatic.com/generate_204"
o.rmempty = true
o:depends("type", "url-test")
o:depends("type", "fallback")
o:depends("type", "load-balance")

o = s:option(Value, "test_interval", translate("Test Interval(s)"))
o.default = "300"
o.rmempty = true
o:depends("type", "url-test")
o:depends("type", "fallback")
o:depends("type", "load-balance")

o = s:option(DynamicList, "other_group", translate("Other Group"))
o.rmempty = false
o.description = translate("Proxy Groups Must Exist In Rule")
o:value("ALL", translate("All Servers"))
uci:foreach("clash", "servers",
		function(s)
		  if s.name ~= "" and s.name ~= nil and s.name ~= m.uci:get(clash, sid, "name") then
			   o:value(s.name)
			end
		end)
uci:foreach("clash", "groups",
		function(s)
		  if s.name ~= "" and s.name ~= nil and s.name ~= m.uci:get(clash, sid, "name") then
			   o:value(s.name)
			end
		end)
o:value("DIRECT")
o:value("REJECT")



local apply = luci.http.formvalue("cbi.apply")
if apply then
    m.uci:commit(clash, sid) 
    sys.call("/usr/share/clash/groups.sh start")
end

return m
