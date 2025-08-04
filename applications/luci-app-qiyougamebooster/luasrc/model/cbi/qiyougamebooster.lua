require("luci.sys")

m = Map("qiyougamebooster", translate("QiYou Game Booster"),
	translate("Play console games online with less lag and more stability.") .. "<br />" ..
	translate("— now supporting PS, Switch, Xbox, PC, and mobile."))

s = m:section(TypedSection, "qiyougamebooster")
s.anonymous = true
s.addremove = false

sts = luci.sys.exec("qiyougamebooster.sh status 2> /dev/null")
ver = luci.sys.exec("qiyougamebooster.sh version 2> /dev/null")
o = s:option(DummyValue, "status")
o.rawhtml = true
o.value = '<span style="color:green"><strong>' .. translate("Status") .. ":" .. ver .. " " .. translate(sts) ..'</strong></span>'

o = s:option(Flag, "enabled", translate("Enable"))
o.default = 0

o = s:option(DummyValue, "instructions")
o.rawhtml = true
o.value = "<p><img src='/qiyougamebooster/Tutorial.png' height='300'/></p>"

return m
