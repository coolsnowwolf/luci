local NXFS = require "nixio.fs"
local SYS  = require "luci.sys"
local HTTP = require "luci.http"
local DISP = require "luci.dispatcher"
local UTIL = require "luci.util"
local fs = require "luci.clash"
local uci = require "luci.model.uci".cursor()
local m, s, o, k
local clash = "clash"
local http = luci.http


m = Map("clash")
s = m:section(TypedSection, "clash" , translate("Rule"))
s.anonymous = true
s.addremove=false


o = s:option(Value, "rule_url")
o.title = translate("Custom Rule Url")
o.description = translate("Insert your custom rule Url and click download")
o.rmempty = true

o = s:option(Button,"rule_update")
o.title = translate("Download Rule")
o.inputtitle = translate("Download Rule")
o.description = translate("Download Rule")
o.inputstyle = "reload"
o.write = function()
  uci:commit("clash")
  SYS.call("sh /usr/share/clash/rule.sh >>/tmp/clash.log 2>&1 &")
  HTTP.redirect(DISP.build_url("admin", "services", "clash", "servers"))
end

local rule = "/usr/share/clash/custom_rule.yaml"
sev = s:option(TextValue, "rule")
sev.description = translate("NB: Attention to Proxy Group and Rule when making changes to this section")
sev.rows = 20
sev.wrap = "off"
sev.cfgvalue = function(self, section)
	return NXFS.readfile(rule) or ""
end
sev.write = function(self, section, value)
	NXFS.writefile(rule, value:gsub("\r\n", "\n"))
end

o = s:option(Button,"del_rule")
o.inputtitle = translate("Delete Rule")
o.write = function()
  SYS.call("rm -rf /usr/share/clash/custom_rule.yaml >/dev/null 2>&1 &")
end




krk = Map(clash)
s = krk:section(TypedSection, "clash", translate("Load Config"))
s.anonymous = true

o = s:option(ListValue, "loadfrom", translate("Load From"))
o:value("sub", translate("Subscription Config"))
o:value("upl", translate("Upload Config"))
o.description = translate("Select from which configuration custom server should be loaded from")

o = s:option(ListValue, "loadservers", translate("Load Servers"))
o:value("1", translate("enabled"))
o:value("0", translate("disabled"))
o.description = translate("Enable to read servers")


o = s:option(ListValue, "loadgroups", translate("Load Groups"))
o:value("1", translate("enabled"))
o:value("0", translate("disabled"))
o.description = translate("Enable to read policy group")

local t = {
    {Load_Config, Delete_Severs, Delete_Groups}
}

b = krk:section(Table, t)

o = b:option(Button,"Load_Config")
o.inputtitle = translate("Load Config")
o.inputstyle = "apply"
o.write = function()
 krk.uci:commit("clash")
 luci.sys.call("sh /usr/share/clash/load.sh >/dev/null 2>&1 &")
 SYS.call("sleep 2")
 luci.http.redirect(luci.dispatcher.build_url("admin", "services", "clash"))
end




o = b:option(Button,"Delete_Severs")
o.inputtitle = translate("Delete Severs")
o.inputstyle = "reset"
o.write = function()
  krk.uci:delete_all("clash", "servers", function(s) return true end)
  krk.uci:commit("clash")
  luci.http.redirect(luci.dispatcher.build_url("admin", "services", "clash", "servers"))
end

o = b:option(Button,"Delete_Groups")
o.inputtitle = translate("Delete Groups")
o.inputstyle = "reset"
o.write = function()
  krk.uci:delete_all("clash", "groups", function(s) return true end)
  krk.uci:commit("clash")
  luci.http.redirect(luci.dispatcher.build_url("admin", "services", "clash", "servers"))
end



s = krk:section(TypedSection, "servers", translate("Proxies"))
s.anonymous = true
s.addremove = true
s.sortable = true
s.template = "cbi/tblsection"
s.extedit = luci.dispatcher.build_url("admin/services/clash/servers-config/%s")
function s.create(...)
	local sid = TypedSection.create(...)
	if sid then
		luci.http.redirect(s.extedit % sid)
		return
	end
end



o = s:option(DummyValue, "type", translate("Type"))
function o.cfgvalue(...)
	return Value.cfgvalue(...) or translate("None")
end

o = s:option(DummyValue, "name", translate("Alias"))
function o.cfgvalue(...)
	return Value.cfgvalue(...) or translate("None")
end

o = s:option(DummyValue, "server", translate("Server Address"))
function o.cfgvalue(...)
	return Value.cfgvalue(...) or translate("None")
end

o = s:option(DummyValue, "port", translate("Server Port"))
function o.cfgvalue(...)
	return Value.cfgvalue(...) or translate("None")
end

o = s:option(DummyValue, "server" ,translate("Latency"))
o.template="clash/ping"
o.width="10%"

r = krk:section(TypedSection, "groups", translate("Policy Groups"))
r.anonymous = true
r.addremove = true
r.sortable = true
r.template = "clash/tblsection"
r.extedit = luci.dispatcher.build_url("admin/services/clash/groups/%s")
function r.create(...)
	local sid = TypedSection.create(...)
	if sid then
		luci.http.redirect(r.extedit % sid)
		return
	end
end

o = r:option(DummyValue, "type", translate("Group Type"))
function o.cfgvalue(...)
	return Value.cfgvalue(...) or translate("None")
end


o = r:option(DummyValue, "name", translate("Group Name"))
function o.cfgvalue(...)
	return Value.cfgvalue(...) or translate("None")
end


krk:append(Template("clash/list"))


local apply = luci.http.formvalue("cbi.apply")
if apply then
	krk.uci:commit("clash")
	SYS.call("sh /usr/share/clash/proxy.sh >/dev/null 2>&1 &")
  	luci.http.redirect(luci.dispatcher.build_url("admin", "services", "clash"))	
	
end

return  krk, m

