#!/bin/sh
   RULE_FILE_NAME="$1"
   RULE_FILE_ENNAME=$(grep -F $RULE_FILE_NAME /etc/openclash/game_rules.list |awk -F ',' '{print $3}' 2>/dev/null)
   if [ ! -z "$RULE_FILE_ENNAME" ]; then
      DOWNLOAD_PATH=$(grep -F $RULE_FILE_NAME /etc/openclash/game_rules.list |awk -F ',' '{print $2}' 2>/dev/null)
   else
      DOWNLOAD_PATH=$RULE_FILE_NAME
   fi
   RULE_FILE_DIR="/etc/openclash/game_rules/$RULE_FILE_NAME"
   TMP_RULE_DIR="/tmp/$RULE_FILE_NAME"
   LOGTIME=$(date "+%Y-%m-%d %H:%M:%S")
   LOG_FILE="/tmp/openclash.log"
   HTTP_PORT=$(uci get openclash.config.http_port 2>/dev/null)
   PROXY_ADDR=$(uci get network.lan.ipaddr 2>/dev/null |awk -F '/' '{print $1}' 2>/dev/null)
   if [ -s "/tmp/openclash.auth" ]; then
      PROXY_AUTH=$(cat /tmp/openclash.auth |awk -F '- ' '{print $2}' |sed -n '1p' 2>/dev/null)
   fi
   if pidof clash >/dev/null; then
   	  curl -sL --connect-timeout 10 --retry 2 -x http://$PROXY_ADDR:$HTTP_PORT -U "$PROXY_AUTH" https://raw.githubusercontent.com/FQrabbit/SSTap-Rule/master/rules/"$DOWNLOAD_PATH" -o "$TMP_RULE_DIR" >/dev/null 2>&1
   else
      curl -sL --connect-timeout 10 --retry 2 https://raw.githubusercontent.com/FQrabbit/SSTap-Rule/master/rules/"$DOWNLOAD_PATH" -o "$TMP_RULE_DIR" >/dev/null 2>&1
   fi
   if [ "$?" -eq "0" ] && [ "$(ls -l $TMP_RULE_DIR |awk '{print $5}')" -ne 0 ]; then
      cmp -s $TMP_RULE_DIR $RULE_FILE_DIR
         if [ "$?" -ne "0" ]; then
            mv $TMP_RULE_DIR $RULE_FILE_DIR >/dev/null 2>&1\
            && rm -rf $TMP_RULE_DIR >/dev/null 2>&1
            echo "${LOGTIME} Rule File【$RULE_FILE_NAME】 Download Successful" >>$LOG_FILE
            return 1
         else
            echo "${LOGTIME} Updated Rule File【$RULE_FILE_NAME】 No Change, Do Nothing" >>$LOG_FILE
            rm -rf $TMP_RULE_DIR >/dev/null 2>&1
            return 2
         fi
   else
      rm -rf $TMP_RULE_DIR >/dev/null 2>&1
      echo "${LOGTIME} Rule File【$RULE_FILE_NAME】 Download Error" >>$LOG_FILE
      return 0
   fi