module("luci.controller.ttyd", package.seeall)

function index()
    if not nixio.fs.access("/etc/config/ttyd") then
        return
    end

local page = entry({"admin", "system", "ttyd"}, alias("admin", "system", "ttyd", "terminal"), _("TTYD Terminal"))
page.order = 20
page.dependent = true
page.acl_depends = { "luci-app-ttyd" }
    entry({"admin", "system", "ttyd","terminal"}, template("ttyd/terminal"), _("Terminal"), 1)
    entry({"admin", "system", "ttyd", "config"}, cbi("ttyd/config"), _("Configuration"), 2)
end
