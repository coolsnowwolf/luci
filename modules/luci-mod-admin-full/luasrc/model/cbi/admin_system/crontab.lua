local fs   = require "nixio.fs"
local nu   = require "nixio.util"
local util = require "luci.util"

m = Map("cron", translate("Scheduled Tasks"), translate("Scheduled Tasks Configuration"))

function time_validator(self, value, desc)
    if value ~= nil then
        h_str, m_str = string.match(value, "^(%d%d?):(%d%d?)$")
        h = tonumber(h_str)
        m = tonumber(m_str)
        if ( h ~= nil and
             h >= 0   and
             h <= 23  and
             m ~= nil and
             m >= 0   and
             m <= 59) then
            return value
        end
    end
    return nil, translatef("The value %s is invalid", desc)
end

task = m:section(TypedSection, "task", "")
task.anonymous = true
task.addremove = true
--task.rmempty = true
enable = task:option(Flag, "enabled", translate("Enable"))
task_name=task:option(Value, "task_name", translate("Task Name"),translate("Task Name desc"))

task_Everyday=task:option(Flag, "task_Everyday", translate("Everyday"),translate("Task Everyday desc"))
task_Everyday:depends("custom", "")
task_Everyday.disabled = 0

-- BEGIN Day(s) of Week
dow = task:option(MultiValue, "daysofweek", translate("Day(s) of Week"))
dow.optional = false
dow:depends("custom", "")
dow.rmempty = false
dow:value("Monday", translate("Monday"))
dow:value("Tuesday", translate("Tuesday"))
dow:value("Wednesday", translate("Wednesday"))
dow:value("Thursday", translate("Thursday"))
dow:value("Friday", translate("Friday"))
dow:value("Saturday", translate("Saturday"))
dow:value("Sunday", translate("Sunday"))
-- END Day(s) of Weel

--depends({mode="sta", eap_type="fast", encryption="wpa2"})


--[[
task_every_month=task:option(Flag, "task_Everymonth", translate("EveryMonth"),translate("Task everymonth desc"))
task_every_month:depends("task_Everyday", "")
task_every_month.disabled = 0

-- BEGIN Day(s) of Month
dom = task:option(Value, "daysofmonth", translate("Day(s) of Month"))
dom:depends("task_Everymonth","1")
dom:value("1", translate("1st"))
dom:value("2", translate("2nd"))
dom:value("3", translate("3rd"))
dom:value("4", translate("4th"))
dom:value("5", translate("5th"))
dom:value("6", translate("6th"))
dom:value("7", translate("8th"))
-- END Day(s) of Weel

task_Monday=task:option(Flag, "task_Monday", translate("Monday"))
task_Monday:depends("task_Everyday", "")
task_Monday.disabled = 0

task_Tuesday=task:option(Flag, "task_Tuesday", translate("Tuesday"))
task_Tuesday:depends("task_Everyday", "")
task_Tuesday.disabled = 0

task_Wednesday=task:option(Flag, "task_Wednesday", translate("Wednesday"))
task_Wednesday:depends("task_Everyday", "")
task_Wednesday.disabled = 0

task_Thursday=task:option(Flag, "task_Thursday", translate("Thursday"))
task_Thursday:depends("task_Everyday", "")
task_Thursday.disabled = 0

task_Friday=task:option(Flag, "task_Friday", translate("Friday"))
task_Friday:depends("task_Everyday", "")
task_Friday.disabled = 0

task_Sartuday=task:option(Flag, "task_Sartuday", translate("Saturday"))
task_Sartuday:depends("task_Everyday", "")
task_Sartuday.disabled = 0

task_Sunday=task:option(Flag, "task_Sunday", translate("Sunday"))
task_Sunday:depends("task_Everyday", "")
task_Sunday.disabled = 0
--]]

task_time=task:option(ListValue, "task_time", translate("Start time"),translate("Start time desc"))
task_time:depends("custom", "")
task_time:value("0:00", translate("0:00"))
task_time:value("0:15", translate("0:15"))
task_time:value("0:30", translate("0:30"))
task_time:value("0:45", translate("0:45"))
task_time:value("1:00", translate("1:00"))
task_time:value("1:15", translate("1:15"))
task_time:value("1:30", translate("1:30"))
task_time:value("1:45", translate("1:45"))
task_time:value("2:00", translate("2:00"))
task_time:value("2:15", translate("2:15"))
task_time:value("2:30", translate("2:30"))
task_time:value("2:45", translate("2:45"))
task_time:value("3:00", translate("3:00"))
task_time:value("3:15", translate("3:15"))
task_time:value("3:30", translate("3:30"))
task_time:value("3:45", translate("3:45"))
task_time:value("4:00", translate("4:00"))
task_time:value("4:15", translate("4:15"))
task_time:value("4:30", translate("4:30"))
task_time:value("4:45", translate("4:45"))
task_time:value("5:00", translate("5:00"))
task_time:value("5:15", translate("5:15"))
task_time:value("5:30", translate("5:30"))
task_time:value("5:45", translate("5:45"))
task_time:value("6:00", translate("6:00"))
task_time:value("6:15", translate("6:15"))
task_time:value("6:30", translate("6:30"))
task_time:value("6:45", translate("6:45"))
task_time:value("7:00", translate("7:00"))
task_time:value("7:15", translate("7:15"))
task_time:value("7:30", translate("7:30"))
task_time:value("7:45", translate("7:45"))
task_time:value("8:00", translate("8:00"))
task_time:value("8:15", translate("8:15"))
task_time:value("8:30", translate("8:30"))
task_time:value("8:45", translate("8:45"))
task_time:value("9:00", translate("9:00"))
task_time:value("9:15", translate("9:15"))
task_time:value("9:30", translate("9:30"))
task_time:value("9:45", translate("9:45"))
task_time:value("10:00", translate("10:00"))
task_time:value("10:15", translate("10:15"))
task_time:value("10:30", translate("10:30"))
task_time:value("10:45", translate("10:45"))
task_time:value("11:00", translate("11:00"))
task_time:value("11:15", translate("11:15"))
task_time:value("11:30", translate("11:30"))
task_time:value("11:45", translate("11:45"))
task_time:value("12:00", translate("12:00"))
task_time:value("12:15", translate("12:15"))
task_time:value("12:30", translate("12:30"))
task_time:value("12:45", translate("12:45"))
task_time:value("13:00", translate("13:00"))
task_time:value("13:15", translate("13:15"))
task_time:value("13:30", translate("13:30"))
task_time:value("13:45", translate("13:45"))
task_time:value("14:00", translate("14:00"))
task_time:value("14:15", translate("14:15"))
task_time:value("14:30", translate("14:30"))
task_time:value("14:45", translate("14:45"))
task_time:value("15:00", translate("15:00"))
task_time:value("15:15", translate("15:15"))
task_time:value("15:30", translate("15:30"))
task_time:value("15:45", translate("15:45"))
task_time:value("16:00", translate("16:00"))
task_time:value("16:15", translate("16:15"))
task_time:value("16:30", translate("16:30"))
task_time:value("16:45", translate("16:45"))
task_time:value("17:00", translate("17:00"))
task_time:value("17:15", translate("17:15"))
task_time:value("17:30", translate("17:30"))
task_time:value("17:45", translate("17:45"))
task_time:value("18:00", translate("18:00"))
task_time:value("18:15", translate("18:15"))
task_time:value("18:30", translate("18:30"))
task_time:value("18:45", translate("18:45"))
task_time:value("19:00", translate("19:00"))
task_time:value("19:15", translate("19:15"))
task_time:value("19:30", translate("19:30"))
task_time:value("19:45", translate("19:45"))
task_time:value("20:00", translate("20:00"))
task_time:value("20:15", translate("20:15"))
task_time:value("20:30", translate("20:30"))
task_time:value("20:45", translate("20:45"))
task_time:value("21:00", translate("21:00"))
task_time:value("21:15", translate("21:15"))
task_time:value("21:30", translate("21:30"))
task_time:value("21:45", translate("21:45"))
task_time:value("22:00", translate("22:00"))
task_time:value("22:15", translate("22:15"))
task_time:value("22:30", translate("22:30"))
task_time:value("22:45", translate("22:45"))
task_time:value("23:00", translate("23:00"))
task_time:value("23:15", translate("23:15"))
task_time:value("23:30", translate("23:30"))
task_time:value("23:45", translate("23:45"))
task_time:value("everym_5", translate("every_5_minute"))
task_time:value("everym_15", translate("every_15_minute"))
task_time:value("everym_30", translate("every_30_minute"))
task_time:value("everyh_1", translate("every_1_hour"))
task_time:value("everyh_12", translate("every_12_hour"))
task_time:value("everyh_24", translate("every_24_hour"))
task_time:value("custom", translate("every-custom-minute"))

task_minute=task:option(Value, "task_minute", translate("minutes"),translate("custom minutes"))
task_minute:depends( "task_time" , "custom" )

task_cmd=task:option(Value, "task_cmd", translate("Command"),translate("command for schedule"))
task_cmd:depends("custom", "")
task_cmd:value("reboot", translate("Restart system"))
task_cmd:value("/etc/init.d/bandwidth restart", translate("bandwidth reset"))
task_cmd:value("wifi up", translate("Wifi Up"))
task_cmd:value("wifi down", translate("Wifi Down"))
task_cmd:value("ifup wan", translate("Wan Up"))
task_cmd:value("ifdown wan", translate("Wan Down"))

-- BEGIN custom
custom=task:option(Flag, "custom", translate("Custom"))
custom_cron=task:option(Value, "custom_cron_table", translate("Custom cron"),translate("custom cron desc"))
custom_cron:depends("custom", "1")
-- END custom

return m
