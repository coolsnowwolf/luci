-- Copyright 2020 Lean <coolsnowwolf@gmail.com>
-- Licensed to the public under the Apache License 2.0.

m = Map("forked-daapd", translate("Music Remote Center"))
m.description = translate("Music Remote Center is a DAAP (iTunes Remote), MPD (Music Player Daemon) and RSP (Roku) media server.")

m:section(SimpleSection).template  = "forked-daapd/forked-daapd_status"

s = m:section(TypedSection, "forked-daapd")
s.addremove = false
s.anonymous = true

o = s:option(Flag, "enabled", translate("Enabled"))
o.default = "0"
o.rmempty = false

o = s:option(Value, "port", translate("Port"))
o.rmempty = false
o.datatype = "port"

o = s:option(Value, "db_path", translate("Database File Path"))
o.default = "/opt/forked-daapd-songs3.db"
o.rmempty = false

o = s:option(Value, "directories", translate("Music Directorie Path"))
o.default = "/opt/music"
o.rmempty = false

o = s:option(DummyValue, "readme", translate("Readme"))
o.description = translate("About iOS Remote Pairing: <br />1. Open the web interface <br /> 2. Start iPhone Remote APP, go to Settings, Add Library<br />3. Enter the pair code in the web interface")

return m
