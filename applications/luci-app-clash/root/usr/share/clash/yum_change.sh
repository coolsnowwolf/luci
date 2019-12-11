#!/bin/sh
CONFIG_YAML="/etc/clash/config.yaml"
CONFIG_YAML_SUB="/usr/share/clash/config/sub/config.yaml"
CONFIG_YAML_UPL="/usr/share/clash/config/upload/config.yaml"
CONFIG_YAML_CUS="/usr/share/clash/config/custom/config.yaml"
lang=$(uci get luci.main.lang 2>/dev/null)
config_type=$(uci get clash.config.config_type 2>/dev/null)

if [ $config_type == "sub" ];then 
if [  -f $CONFIG_YAML_SUB ] && [ "$(ls -l $CONFIG_YAML_SUB|awk '{print int($5/1024)}')" -ne 0 ];then
	cp $CONFIG_YAML_SUB $CONFIG_YAML 2>/dev/null
fi
elif [ $config_type == "upl" ];then 
if [  -f $CONFIG_YAML_UPL ] && [ "$(ls -l $CONFIG_YAML_UPL|awk '{print int($5/1024)}')" -ne 0 ];then
	cp $CONFIG_YAML_UPL $CONFIG_YAML 2>/dev/null
fi
elif [ $config_type == "cus" ];then 
if [  -f $CONFIG_YAML_CUS ] && [ "$(ls -l $CONFIG_YAML_CUS|awk '{print int($5/1024)}')" -ne 0 ];then
	cp $CONFIG_YAML_CUS $CONFIG_YAML 2>/dev/null
fi
fi

if [  -f $CONFIG_YAML ];then


 	if [ $lang == "en" ];then
		echo "Checking DNS Settings.. " >$REAL_LOG 
	elif [ $lang == "zh_cn" ];then
    	 echo "DNS设置检查..." >$REAL_LOG
	fi
if [ -z "$(grep "^ \{0,\}listen:" $CONFIG_YAML)" ] || [ -z "$(grep "^ \{0,\}enhanced-mode:" $CONFIG_YAML)" ] || [ -z "$(grep "^ \{0,\}enable:" $CONFIG_YAML)" ] || [ -z "$(grep "^ \{0,\}dns:" $CONFIG_YAML)" ] ;then
#===========================================================================================================================
	uci set clash.config.mode="1" && uci commit clash
#===========================================================================================================================	
fi
 

#===========================================================================================================================
		mode=$(uci get clash.config.mode 2>/dev/null)
		da_password=$(uci get clash.config.dash_pass 2>/dev/null)
		redir_port=$(uci get clash.config.redir_port 2>/dev/null)
		http_port=$(uci get clash.config.http_port 2>/dev/null)
		socks_port=$(uci get clash.config.socks_port 2>/dev/null)
		dash_port=$(uci get clash.config.dash_port 2>/dev/null)
		bind_addr=$(uci get clash.config.bind_addr 2>/dev/null)
		allow_lan=$(uci get clash.config.allow_lan 2>/dev/null)
		log_level=$(uci get clash.config.level 2>/dev/null)
		subtype=$(uci get clash.config.subcri 2>/dev/null)
				
if [ $mode -eq 1 ];  then
	
 	if [ $lang == "en" ];then
		echo "Setting Up Ports and Password.. " >$REAL_LOG 
	elif [ $lang == "zh_cn" ];then
    	 echo "设置端口,DNS和密码..." >$REAL_LOG
	fi		
		sed -i "/Proxy:/i\#clash-openwrt" $CONFIG_YAML 2>/dev/null
                sed -i "/#clash-openwrt/a\#=============" $CONFIG_YAML 2>/dev/null
		sed -i "/#=============/a\ " $CONFIG_YAML 2>/dev/null
		sed -i '1,/#clash-openwrt/d' $CONFIG_YAML 2>/dev/null		
		mv /etc/clash/config.yaml /etc/clash/dns.yaml
		cat /usr/share/clash/dns.yaml /etc/clash/dns.yaml > $CONFIG_YAML 2>/dev/null
		rm -rf /etc/clash/dns.yaml
		sed -i "1i\port: ${http_port}" $CONFIG_YAML 2>/dev/null
		sed -i "/port: ${http_port}/a\socks-port: ${socks_port}" $CONFIG_YAML 2>/dev/null 
		sed -i "/socks-port: ${socks_port}/a\redir-port: ${redir_port}" $CONFIG_YAML 2>/dev/null 
		sed -i "/redir-port: ${redir_port}/a\allow-lan: ${allow_lan}" $CONFIG_YAML 2>/dev/null 
		if [ $allow_lan == "true" ];  then
		sed -i "/allow-lan: ${allow_lan}/a\bind-address: \"${bind_addr}\"" $CONFIG_YAML 2>/dev/null 
		sed -i "/bind-address: \"${bind_addr}\"/a\mode: Rule" $CONFIG_YAML 2>/dev/null
		sed -i "/mode: Rule/a\log-level: ${log_level}" $CONFIG_YAML 2>/dev/null 
		sed -i "/log-level: ${log_level}/a\external-controller: 0.0.0.0:${dash_port}" $CONFIG_YAML 2>/dev/null 
		sed -i "/external-controller: 0.0.0.0:${dash_port}/a\secret: \"${da_password}\"" $CONFIG_YAML 2>/dev/null 
		sed -i "/secret: \"${da_password}\"/a\external-ui: \"/usr/share/clash/dashboard\"" $CONFIG_YAML 2>/dev/null 
		sed -i "external-ui: \"/usr/share/clash/dashboard\"/a\  " $CONFIG_YAML 2>/dev/null 
		sed -i "   /a\   " $CONFIG_YAML 2>/dev/null
		else
		sed -i "/allow-lan: ${allow_lan}/a\mode: Rule" $CONFIG_YAML 2>/dev/null
		sed -i "/mode: Rule/a\log-level: ${log_level}" $CONFIG_YAML 2>/dev/null 
		sed -i "/log-level: ${log_level}/a\external-controller: 0.0.0.0:${dash_port}" $CONFIG_YAML 2>/dev/null 
		sed -i "/external-controller: 0.0.0.0:${dash_port}/a\secret: \"${da_password}\"" $CONFIG_YAML 2>/dev/null 
		sed -i "/secret: \"${da_password}\"/a\external-ui: \"/usr/share/clash/dashboard\"" $CONFIG_YAML 2>/dev/null 
		
		fi
		sed -i '/#=============/ d' $CONFIG_YAML 2>/dev/null	
		if [ ! -z "$(grep "^experimental:" $CONFIG_YAML)" ]; then
		sed -i "/experimental:/i\     " $CONFIG_YAML 2>/dev/null
		else
		sed -i "/dns:/i\     " $CONFIG_YAML 2>/dev/null
		fi	
else
 	if [ $lang == "en" ];then
		echo "Setting Up Ports and Password.. " >$REAL_LOG 
	elif [ $lang == "zh_cn" ];then
    	 echo "设置端口,DNS和密码..." >$REAL_LOG
	fi	
		if [ ! -z "$(grep "^experimental:" /etc/clash/config.yaml)" ]; then
		sed -i "/experimental:/i\     " $CONFIG_YAML 2>/dev/null
		sed -i "/     /a\#clash-openwrt" $CONFIG_YAML 2>/dev/null
                sed -i "/#clash-openwrt/a\#=============" $CONFIG_YAML 2>/dev/null
		sed -i '1,/#clash-openwrt/d' $CONFIG_YAML 2>/dev/null

		else

		sed -i "/dns:/i\     " $CONFIG_YAML 2>/dev/null
		sed -i "/     /a\#clash-openwrt" $CONFIG_YAML 2>/dev/null
                sed -i "/#clash-openwrt/a\#=============" $CONFIG_YAML 2>/dev/null
		sed -i '1,/#clash-openwrt/d' $CONFIG_YAML 2>/dev/null
		fi

		sed -i "1i\port: ${http_port}" $CONFIG_YAML 2>/dev/null
		sed -i "/port: ${http_port}/a\socks-port: ${socks_port}" $CONFIG_YAML 2>/dev/null 
		sed -i "/socks-port: ${socks_port}/a\redir-port: ${redir_port}" $CONFIG_YAML 2>/dev/null 
		sed -i "/redir-port: ${redir_port}/a\allow-lan: ${allow_lan}" $CONFIG_YAML 2>/dev/null 
		if [ $allow_lan == "true" ];  then
		sed -i "/allow-lan: ${allow_lan}/a\bind-address: \"${bind_addr}\"" $CONFIG_YAML 2>/dev/null 
		sed -i "/bind-address: \"${bind_addr}\"/a\mode: Rule" $CONFIG_YAML 2>/dev/null
		sed -i "/mode: Rule/a\log-level: ${log_level}" $CONFIG_YAML 2>/dev/null 
		sed -i "/log-level: ${log_level}/a\external-controller: 0.0.0.0:${dash_port}" $CONFIG_YAML 2>/dev/null 
		sed -i "/external-controller: 0.0.0.0:${dash_port}/a\secret: \"${da_password}\"" $CONFIG_YAML 2>/dev/null 
		sed -i "/secret: \"${da_password}\"/a\external-ui: \"/usr/share/clash/dashboard\"" $CONFIG_YAML 2>/dev/null 
		
		else
		sed -i "/allow-lan: ${allow_lan}/a\mode: Rule" $CONFIG_YAML 2>/dev/null
		sed -i "/mode: Rule/a\log-level: ${log_level}" $CONFIG_YAML 2>/dev/null 
		sed -i "/log-level: ${log_level}/a\external-controller: 0.0.0.0:${dash_port}" $CONFIG_YAML 2>/dev/null 
		sed -i "/external-controller: 0.0.0.0:${dash_port}/a\secret: \"${da_password}\"" $CONFIG_YAML 2>/dev/null 
		sed -i "/secret: \"${da_password}\"/a\external-ui: \"/usr/share/clash/dashboard\"" $CONFIG_YAML 2>/dev/null 
		fi
		sed -i '/#=============/ d' $CONFIG_YAML 2>/dev/null
		if [ ! -z "$(grep "^experimental:" $CONFIG_YAML)" ]; then
		sed -i "/experimental:/i\     " $CONFIG_YAML 2>/dev/null
		else
		sed -i "/dns:/i\     " $CONFIG_YAML 2>/dev/null
		fi
fi
#=========================================================================================================================== 
fi
