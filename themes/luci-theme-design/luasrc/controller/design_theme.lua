module("luci.controller.design_theme", package.seeall)

function index()
	local page = entry({"admin", "services", "theme_menu_flush"}, call("menu_flush"))
	page.leaf = true
	page.hidden = true
	page.dependent = false
end

function menu_flush()
	luci.sys.call("rm -f /tmp/luci-indexcache.*")
	luci.sys.call("rm -rf /tmp/luci-modulecache")

	luci.http.prepare_content("application/json")
	luci.http.write_json({ flushed = true })
end
