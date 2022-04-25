module("luci.controller.dawn", package.seeall)

function index()
    local e = entry({ "admin", "network", "dawn" }, alias("admin", "network", "dawn", "view_network"), _("Configure DAWN"), 60)
    e.i18n = "dawn"
    e.dependent = false
    e.acl_depends = { "luci-app-dawn" }

    entry({ "admin", "network", "dawn", "view_network" }, cbi("dawn/dawn_network"), "View Network Overview", 1).leaf = true
    entry({ "admin", "network", "dawn", "view_hearing_map" }, cbi("dawn/dawn_hearing_map"), "View Hearing Map", 2).leaf = true
end
