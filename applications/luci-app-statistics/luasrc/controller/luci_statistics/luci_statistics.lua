-- Copyright 2008 Freifunk Leipzig / Jo-Philipp Wich <jow@openwrt.org>
-- Copyright 2012 Jo-Philipp Wich <jow@openwrt.org>
-- Licensed to the public under the Apache License 2.0.

module("luci.controller.luci_statistics.luci_statistics", package.seeall)

function index()

	require("nixio.fs")
	require("luci.util")
	require("luci.statistics.datatree")

	-- override entry(): check for existence <plugin>.so where <plugin> is derived from the called path
	function _entry( path, ... )
		local file = path[5] or path[4]
		if nixio.fs.access( "/usr/lib/collectd/" .. file .. ".so" ) then
			entry( path, ... )
		end
	end

	local labels = {
		s_output	= _("Output plugins"),
		s_general	= _("General plugins"),
		s_network	= _("Network plugins"),
	}

	-- our collectd menu
	local collectd_menu = {
		output  = { },
		general = { },
		network = { }
	}

	local plugin_dir = "/usr/lib/lua/luci/statistics/plugins/"
	for filename in nixio.fs.dir(plugin_dir) do
		local plugin_fun = loadfile(plugin_dir .. filename)
		setfenv(plugin_fun, { _ = luci.i18n.translate })
		local plugin = plugin_fun()
		local name = filename:gsub("%.lua", "")
		table.insert(collectd_menu[plugin.category], name)
		labels[name] = plugin.label
	end

	-- create toplevel menu nodes
	local st = entry({"admin", "statistics"}, template("admin_statistics/index"), _("Statistics"), 80)
	st.index = true

	entry({"admin", "statistics", "collectd"}, cbi("luci_statistics/collectd"), _("Setup"), 20).subindex = true


	-- populate collectd plugin menu
	local index = 1
	for section, plugins in luci.util.kspairs( collectd_menu ) do
		local e = entry(
			{ "admin", "statistics", "collectd", section },
			firstchild(), labels["s_"..section], index * 10
		)

		e.index = true

		for j, plugin in luci.util.vspairs( plugins ) do
			_entry(
				{ "admin", "statistics", "collectd", section, plugin },
				cbi("luci_statistics/" .. plugin ),
				labels[plugin] or plugin, j * 10
			)
		end

		index = index + 1
	end

	-- output views
	local page = entry( { "admin", "statistics", "graph" }, template("admin_statistics/index"), _("Graphs"), 10)
	      page.setuser  = "nobody"
	      page.setgroup = "nogroup"

	local vars = luci.http.formvalue(nil, true)
	local span = vars.timespan or nil
	local host = vars.host or nil

	-- get rrd data tree
	local tree = luci.statistics.datatree.Instance(host)

	local _, plugin, idx
	for _, plugin, idx in luci.util.vspairs( tree:plugins() ) do

		-- get plugin instances
		local instances = tree:plugin_instances( plugin )

		-- load plugin menu entry from the description
		local plugin_name = "luci.statistics.rrdtool.definitions." .. plugin
		local stat, def = pcall( require, plugin_name )
		if stat and def and type(def.item) == "function" then
			entry(
				{ "admin", "statistics", "graph", plugin },
				call("statistics_render"), def.item(), idx
			).query = { timespan = span , host = host }
		end

		-- if more then one instance is found then generate submenu
		if #instances > 1 then
			local _, inst, idx2
			for _, inst, idx2 in luci.util.vspairs(instances) do
				-- instance menu entry
				entry(
					{ "admin", "statistics", "graph", plugin, inst },
					call("statistics_render"), inst, idx2
				).query = { timespan = span , host = host }
			end
		end
	end
end

function statistics_render()

	require("luci.statistics.rrdtool")
	require("luci.template")
	require("luci.model.uci")

	local vars  = luci.http.formvalue()
	local req   = luci.dispatcher.context.request
	local path  = luci.dispatcher.context.path
	local uci   = luci.model.uci.cursor()
	local spans = luci.util.split( uci:get( "luci_statistics", "collectd_rrdtool", "RRATimespans" ), "%s+", nil, true )
	local span  = vars.timespan or uci:get( "luci_statistics", "rrdtool", "default_timespan" ) or spans[1]
	local host  = vars.host     or uci:get( "luci_statistics", "collectd", "Hostname" ) or luci.sys.hostname()
	local opts = { host = vars.host }
	local graph = luci.statistics.rrdtool.Graph( luci.util.parse_units( span ), opts )
	local hosts = graph.tree:host_instances()

	local is_index = false
	local i, p, inst, idx

	-- deliver image
	if vars.img then
		local l12 = require "luci.ltn12"
		local png = io.open(graph.opts.imgpath .. "/" .. vars.img:gsub("%.+", "."), "r")
		if png then
			luci.http.prepare_content("image/png")
			l12.pump.all(l12.source.file(png), luci.http.write)
		end
		return
	end

	local plugin, instances
	local images = { }

	-- find requested plugin and instance
	for i, p in ipairs( luci.dispatcher.context.path ) do
		if luci.dispatcher.context.path[i] == "graph" then
			plugin    = luci.dispatcher.context.path[i+1]
			instances = { luci.dispatcher.context.path[i+2] }
		end
	end

	-- no instance requested, find all instances
	if #instances == 0 then
		--instances = { graph.tree:plugin_instances( plugin )[1] }
		instances = graph.tree:plugin_instances( plugin )
		is_index = (#instances > 1)

	-- index instance requested
	elseif instances[1] == "-" then
		instances[1] = ""
		is_index = true
	end

	-- render graphs
	for i, inst in luci.util.vspairs( instances ) do
		for i, img in luci.util.vspairs( graph:render( plugin, inst, is_index ) ) do
			table.insert( images, graph:strippngpath( img ) )
			images[images[#images]] = inst
		end
	end

	luci.template.render( "public_statistics/graph", {
		images           = images,
		plugin           = plugin,
		timespans        = spans,
		current_timespan = span,
		hosts            = hosts,
		current_host     = host,
		is_index         = is_index
	} )
end
