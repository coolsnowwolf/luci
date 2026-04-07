local fs = require "nixio.fs"
local http = require "luci.http"
local sys = require "luci.sys"
local util = require "luci.util"

local map, section, net = ...

local ifc = net:get_interface():name()
local sid = net.sid or ifc:gsub("^vpn%-", "")
local ovpn_dir = "/etc/openvpn/openvpnc"
local ovpn_file = ovpn_dir .. "/default-" .. sid .. ".ovpn"
local auth_file = ovpn_dir .. "/default-" .. sid .. ".auth"
local upload_tmp = "/tmp/openvpnc-upload-" .. sid
local upload_fd, upload_source_name, upload_target, upload_notice

function map.on_after_commit(self)
	sys.call("/usr/bin/openvpnc-dnsmasq-sync >/dev/null 2>&1")
end

local function normalize_text(data)
	return data and data:gsub("\r\n?", "\n") or data
end

local function sanitize_filename(name)
	name = util.trim((name or ""):gsub("\\", "/"):match("([^/]+)$") or "")
	name = name:gsub("[^%w%._%-]", "_")
	name = name:gsub("^%.*", "")

	if name == "" then
		name = "profile-" .. sid .. ".ovpn"
	elseif not name:match("%.ovpn$") then
		name = name .. ".ovpn"
	end

	return name
end

local function persist_uploaded_file(source, dest)
	local data = fs.readfile(source)

	if not data then
		return nil
	end

	fs.mkdirr(ovpn_dir)
	fs.writefile(dest, normalize_text(data))
	fs.chmod(dest, "0600")

	if source ~= dest and source:match("^/tmp/") and fs.access(source) then
		fs.unlink(source)
	end

	return dest
end

fs.mkdirr(ovpn_dir)

http.setfilehandler(function(meta, chunk, eof)
	if not meta or meta.name ~= "ovpn_upload" then
		return
	end

	if not upload_fd and chunk then
		upload_source_name = meta.file
		upload_fd = io.open(upload_tmp, "w")
	end

	if upload_fd and chunk then
		upload_fd:write(chunk)
	end

	if eof and upload_fd then
		upload_fd:close()
		upload_fd = nil
	end
end)

http.formvalue("ovpn_upload_name")

if fs.access(upload_tmp) then
	upload_target = ovpn_dir .. "/" .. sanitize_filename(http.formvalue("ovpn_upload_name") ~= "" and http.formvalue("ovpn_upload_name") or upload_source_name)
	upload_target = persist_uploaded_file(upload_tmp, upload_target)
	fs.unlink(upload_tmp)

	if upload_target then
		upload_notice = translate("File saved to") .. " " .. upload_target
	end
end

local profiles = {}

for path in fs.glob(ovpn_dir .. "/*.ovpn") do
	profiles[#profiles + 1] = path
end

table.sort(profiles)

select = section:taboption("general", ListValue, "ovpn_file", translate("OpenVPN configuration"),
	translate("Choose which imported .ovpn file should be used by this interface."))

select:value("", translate("-- please choose --"))

for _, path in ipairs(profiles) do
	select:value(path, path:match("([^/]+)$"))
end

if upload_target and not select:cfgvalue(net.sid) then
	select.default = upload_target
	select:value(upload_target, upload_target:match("([^/]+)$"))
end

function select.cfgvalue(self, section_id)
	if upload_target then
		return upload_target
	end

	local value = Value.cfgvalue(self, section_id)
	if value and fs.access(value) then
		return value
	end

	return nil
end

function select.validate(self, value, section_id)
	if upload_target then
		return upload_target
	end

	if not value or value == "" then
		return nil, translate("Please upload or choose an .ovpn file")
	end

	if not fs.access(value) then
		return nil, translate("Selected .ovpn file does not exist")
	end

	return value
end

function select.write(self, section_id, value)
	self.map:set(section_id, self.option, upload_target or value)
end

upload = section:taboption("general", DummyValue, "_upload", translate("Upload .ovpn file"),
	translate("Upload files into the dedicated profile directory, then choose one from the list above."))
upload.template = "openvpnc/upload"
upload.upload_notice = upload_notice
upload.upload_name = sanitize_filename(upload_source_name or "")

username = section:taboption("general", Value, "username", translate("Username"),
	translate("If the selected profile uses auth-user-pass, a matching .auth file will be generated automatically from these credentials."))
username.rmempty = true

password = section:taboption("general", Value, "password", translate("Password"))
password.password = true
password.rmempty = true

custom_dns_enable = section:taboption("advanced", Flag, "custom_dns_enable", translate("Allow custom DNS servers"),
	translate("When enabled, the DNS servers entered below will be added to this interface even if the OpenVPN server does not push any DNS settings."))
custom_dns_enable.rmempty = false

custom_dns = section:taboption("advanced", Value, "custom_dns", translate("Custom DNS servers"),
	translate("Enter one or more DNS server addresses separated by spaces or commas, for example: 1.1.1.1,8.8.8.8"))
custom_dns.placeholder = "1.1.1.1 8.8.8.8"
custom_dns:depends("custom_dns_enable", "1")
custom_dns.rmempty = true

extra_routes_enable = section:taboption("advanced", Flag, "extra_routes_enable", translate("Allow extra route networks"),
	translate("When enabled, the custom route networks entered below will be appended after the route networks pushed by the OpenVPN server."))
extra_routes_enable.rmempty = false

extra_routes = section:taboption("advanced", Value, "extra_routes", translate("Extra route networks"),
	translate("Enter one or more IPv4 CIDR networks separated by spaces or commas, for example: 10.0.0.0/24,172.16.10.0/24"))
extra_routes.placeholder = "10.0.0.0/24 172.16.10.0/24"
extra_routes:depends("extra_routes_enable", "1")
extra_routes.rmempty = true

domain_dns_enable = section:taboption("advanced", Flag, "domain_dns_enable", translate("Resolve specific domains via custom DNS"),
	translate("When enabled, dnsmasq will forward the domains entered below to the custom DNS servers through the generated ovpnc.conf file in its active conf-dir directory."))
domain_dns_enable.rmempty = false
domain_dns_enable:depends("custom_dns_enable", "1")

dns_domains = section:taboption("advanced", Value, "dns_domains", translate("Domains resolved by custom DNS"),
	translate("Enter one or more domains separated by spaces or commas, for example: corp.example.com"))
dns_domains.placeholder = "corp.example.com"
dns_domains:depends("domain_dns_enable", "1")
dns_domains.rmempty = true

auth_note = section:taboption("advanced", DummyValue, "_auth_note", translate("Authentication file"))

function auth_note.cfgvalue(self, section)
	local value = select:cfgvalue(section)

	if value and value ~= "" then
		return value:gsub("%.ovpn$", ".auth")
	end

	return auth_file
end

mtu = section:taboption("advanced", Value, "mtu", translate("Override MTU"))
mtu.placeholder = "1500"
mtu.datatype = "max(9200)"

notes = section:taboption("advanced", DummyValue, "_openvpnc_path", translate("Stored profile path"))

function notes.cfgvalue(self, section)
	local value = select:cfgvalue(section) or ovpn_file
	return value
end
