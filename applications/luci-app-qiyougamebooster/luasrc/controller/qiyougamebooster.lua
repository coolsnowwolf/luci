module("luci.controller.qiyougamebooster", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/qiyougamebooster") then
		return
	end

	local page
	page = entry({"admin", "services", "qiyougamebooster"}, cbi("qiyougamebooster"), ("QiYou Game Booster"), 99)
	page.dependent = false
	page.acl_depends = {"luci-app-qiyougamebooster"}

	entry({"admin","services","qiyougamebooster","status"}, call("act_status")).leaf = true
end

function act_status()
	local e = {}
	e.running = luci.sys.call("pgrep -f qiyougamebooster >/dev/null") == 0
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end
