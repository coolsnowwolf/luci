#!/bin/bash

HISTORY_PATH="/etc/openclash/history"
SECRET=$(uci get openclash.config.dashboard_password 2>/dev/null)
LAN_IP=$(uci get network.lan.ipaddr 2>/dev/null |awk -F '/' '{print $1}' 2>/dev/null)
PORT=$(uci get openclash.config.cn_port 2>/dev/null)

urlencode() {
    local data
    if [ "$#" -eq "1" ]; then
       data=$(curl -s -o /dev/null -w %{url_effective} --get --data-urlencode "$1" "")
       if [ ! -z "$data" ]; then
           echo "${data##/?}"
       fi
    fi
}

GROUP_STATE() {
   echo "$(curl -m 5 -w %{http_code}"\n" -H "Authorization: Bearer ${SECRET}" -H "Content-Type:application/json" -X GET http://"$LAN_IP":"$PORT"/proxies/"$1" 2>/dev/null |sed -n '$p' 2>/dev/null)"
}

if [ -s "$HISTORY_PATH" ]; then
   cat $HISTORY_PATH |while read line
   do
      GROUP_NAME=$(echo $line |awk -F '#*#' '{print $1}')
      if [ -z "$(echo $line |grep "#*#")" ] || [ -z "$(grep "^$GROUP_NAME$" /tmp/Proxy_Group)" ]; then
         continue
      else
         GROUP_NAME=$(urlencode "$GROUP_NAME")
         NOW_NAME=$(echo $line |awk -F '#*#' '{print $3}')
         GROUP_STATE=$(GROUP_STATE "$GROUP_NAME")
         GROUP_STATE_NUM=0
         while ( [ ! -z "$(pidof clash)" ] && [ "$GROUP_STATE" != "200" ] && [ "$GROUP_STATE_NUM" -le 1 ] )
         do
            sleep 3
            GROUP_STATE_NUM=$(expr "$GROUP_STATE_NUM" + 1)
            GROUP_STATE=$(GROUP_STATE "$GROUP_NAME")
         done
         curl -m 5 --retry 2 -H "Authorization: Bearer ${SECRET}" -H "Content-Type:application/json" -X PUT -d '{"name":"'"$NOW_NAME"'"}' http://"$LAN_IP":"$PORT"/proxies/"$GROUP_NAME" >/dev/null 2>&1
      fi
   done >/dev/null 2>&1
fi