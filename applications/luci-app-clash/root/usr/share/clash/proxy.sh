#!/bin/sh /etc/rc.common
. /lib/functions.sh

REAL_LOG="/tmp/clash_real.log"
lang=$(uci get luci.main.lang 2>/dev/null)
config_type=$(uci get clash.config.config_type 2>/dev/null)


 	if [ $lang == "en" ];then
		echo "Strating to Create Custom Config.. " >$REAL_LOG 
	elif [ $lang == "zh_cn" ];then
    	 echo "开始创建自定义配置..." >$REAL_LOG
	fi
sleep 2
CONFIG_YAML_RULE="/usr/share/clash/custom_rule.yaml"
SERVER_FILE="/tmp/servers.yaml"
CONFIG_YAML="/usr/share/clash/config/custom/config.yaml"
TEMP_FILE="/tmp/dns_temp.yaml"
Proxy_Group="/tmp/Proxy_Group"
GROUP_FILE="/tmp/groups.yaml"
CONFIG_FILE="/tmp/y_groups"
CFG_FILE="/etc/config/clash"
DNS_FILE="/usr/share/clash/dns.yaml" 


   servcount=$( grep -c "config servers" $CFG_FILE 2>/dev/null)
   gcount=$( grep -c "config groups" $CFG_FILE 2>/dev/null)
   if [ $servcount -eq 0 ] || [ $gcount -eq 0 ];then
 	if [ $lang == "en" ];then
		echo "No servers or group. Aborting Operation .." >$REAL_LOG 
		sleep 2
			echo "Clash for OpenWRT" >$REAL_LOG
	elif [ $lang == "zh_cn" ];then
    	 echo "找不到代理或策略组。中止操作..." >$REAL_LOG
		 sleep 2
			echo "Clash for OpenWRT" >$REAL_LOG
	fi
	exit 0	
   fi
sleep 2
servers_set()
{
   local section="$1"
   config_get "type" "$section" "type" ""
   config_get "name" "$section" "name" ""
   config_get "server" "$section" "server" ""
   config_get "port" "$section" "port" ""
   config_get "cipher" "$section" "cipher" ""
   config_get "password" "$section" "password" ""
   config_get "securitys" "$section" "securitys" ""
   config_get "udp" "$section" "udp" ""
   config_get "obfs" "$section" "obfs" ""
   config_get "obfs_vmess" "$section" "obfs_vmess" ""
   config_get "host" "$section" "host" ""
   config_get "custom" "$section" "custom" ""
   config_get "tls" "$section" "tls" ""
   config_get "tls_custom" "$section" "tls_custom" ""
   config_get "skip_cert_verify" "$section" "skip_cert_verify" ""
   config_get "path" "$section" "path" ""
   config_get "alterId" "$section" "alterId" ""
   config_get "uuid" "$section" "uuid" ""
   config_get "auth_name" "$section" "auth_name" ""
   config_get "auth_pass" "$section" "auth_pass" ""
   config_get "mux" "$section" "mux" ""
   config_get "protocol" "$section" "protocol" ""
   config_get "protocolparam" "$section" "protocolparam" ""
   config_get "obfsparam" "$section" "obfsparam" ""
   config_get "obfs_ssr" "$section" "obfs_ssr" ""
   config_get "cipher_ssr" "$section" "cipher_ssr" ""
   config_get "psk" "$section" "psk" ""
   config_get "obfs_snell" "$section" "obfs_snell" ""
	
   if [ -z "$type" ]; then
      return
   fi
   
	if [ ! -z "$protocolparam" ];then
	  pro_param=", protocolparam: $protocolparam"	
	else
	  pro_param=", protocolparam: ''" 
	fi

	if [ ! -z "$protocol" ] && [ "$type" = "ssr" ];then
	  protol=", protocol: $protocol"
	else
	  protol=", protocol: origin"	 
	fi
	
	if [ ! -z "$obfs_ssr" ];then
	 ssr_obfs=", obfs: $obfs_ssr"
	else
	 ssr_obfs=", obfs: plain"
	fi
	
	if [ ! -z "$obfsparam" ];then
	 obfs_param=", obfsparam: $obfsparam"
         else
	obfs_param=", obfsparam: ''"
	fi 
   
   if [ -z "$server" ]; then
      return
   fi

   if [ ! -z "$mux" ]; then
      muxx="mux: $mux"
   fi
   if [ "$obfs_snell" = "none" ]; then
      obfs_snell=""
   fi
   
   if [ -z "$name" ]; then
      name="Server"
   fi
   
   if [ -z "$port" ]; then
      return
   fi
   
   if [ ! -z "$udp" ] && [ "$obfs" ] || [ "$obfs" = " " ]; then
      udpp=", udp: $udp"
   fi
   
   if [ "$obfs" != "none" ] && [ "$type" = "ss" ]; then
      if [ "$obfs" = "websocket" ]; then
         obfss="plugin: v2ray-plugin"
      else
         obfss="plugin: obfs"
      fi
   fi
   
   if [ "$obfs_vmess" = "none" ] && [ "$type" = "vmess" ]; then
      	obfs_vmesss=""
   elif [ "$obfs_vmess" != "none" ] && [ "$type" = "vmess" ]; then 
      	obfs_vmesss=", network: ws"
   fi  
   

   
   if [ ! -z "$custom" ] && [ "$type" = "vmess" ]; then
      custom=", ws-headers: { Host: $custom }"
   fi
   
   if [ ! "$tls" ] && [ "$type" = "vmess" ]; then
       tlss=""
   elif [ "$tls" ] && [ "$type" = "vmess" ]; then
      tlss=", tls: $tls"
   elif [ "$tls" ] && [ "$type" = "http" ]; then
	  tls_hs=", tls: $tls" 
   elif [ "$tls" ] && [ "$type" = "socks5" ]; then
	  tls_hs=", tls: $tls"	  
   fi

   
   if [ ! -z "$path" ]; then
      if [ "$type" != "vmess" ]; then
         paths="path: '$path'"
      else
         path=", ws-path: $path"
      fi
   fi

   if [ "$skip_cert_verify" = "true" ] && [ "$type" != "ss" ]; then
      skip_cert_verifys=", skip-cert-verify: $skip_cert_verify"
  elif [ ! "$skip_cert_verify" ]; then
      skip_cert_verifys=""	  
   fi

   
   if [ "$type" = "ss" ] && [ "$obfs" = " " ]; then
      echo "- { name: \"$name\", type: $type, server: $server, port: $port, cipher: $cipher, password: "$password"$udpp }" >>$SERVER_FILE
   elif [ "$type" = "ss" ] && [ "$obfs" = "websocket" ] || [ "$obfs" = "tls" ] ||[ "$obfs" = "http" ]; then
cat >> "$SERVER_FILE" <<-EOF
- name: "$name"
  type: $type
  server: $server
  port: $port
  cipher: $cipher
  password: "$password"
EOF
  if [ ! -z "$udp" ]; then
cat >> "$SERVER_FILE" <<-EOF
  udp: $udp
EOF
  fi
  if [ ! -z "$obfss" ]; then
cat >> "$SERVER_FILE" <<-EOF
  $obfss
  plugin-opts:
    mode: $obfs
EOF
  fi
  
   if [ "$host" ]; then
cat >> "$SERVER_FILE" <<-EOF
    host: $host
EOF
  fi 
  
  if [ "$tls_custom" = "true" ] && [ "$type" = "ss" ]; then
cat >> "$SERVER_FILE" <<-EOF
    tls: true
EOF
  fi
   if [ "$skip_cert_verify" = "true" ] && [ "$type" = "ss" ]; then
cat >> "$SERVER_FILE" <<-EOF
    skip_cert_verify: true
EOF
  fi

    if [ ! -z "$path" ]; then
cat >> "$SERVER_FILE" <<-EOF
    $paths
EOF
  fi
  
      if [ "$mux" = "true" ]; then
cat >> "$SERVER_FILE" <<-EOF
    $muxx
EOF
  fi

  if [ ! -z "$custom" ]; then
cat >> "$SERVER_FILE" <<-EOF
    headers:
      custom: $custom
EOF
  fi
   fi
   
   if [ "$type" = "vmess" ]; then
      echo "- { name: \"$name\", type: $type, server: $server, port: $port, uuid: $uuid, alterId: $alterId, cipher: $securitys$obfs_vmesss$path$custom$tlss$skip_cert_verifys }" >>$SERVER_FILE
   fi
   
   if [ "$type" = "socks5" ] || [ "$type" = "http" ]; then
      echo "- { name: \"$name\", type: $type, server: $server, port: $port, username: $auth_name, password: $auth_pass$skip_cert_verify$tls_hs }" >>$SERVER_FILE
   fi
   
    if [ "$type" = "ssr" ]; then
      echo "- { name: \"$name\", type: $type, server: $server, port: $port, cipher: $cipher_ssr, password: "$password"$protol$pro_param$ssr_obfs$obfs_param}" >>$SERVER_FILE
    fi

   if [ "$type" = "snell" ]; then
cat >> "$SERVER_FILE" <<-EOF
- name: "$name"
  type: $type
  server: $server
  port: $port
  psk: $psk
EOF
  if [ "$obfs_snell" != "none" ] && [ ! -z "$host" ]; then
cat >> "$SERVER_FILE" <<-EOF
  obfs-opts:
    mode: $obfs_snell
    $host
EOF
  fi
   fi

}

config_load clash
config_foreach servers_set "servers"

if [ "$(ls -l $SERVER_FILE|awk '{print $5}')" -ne 0 ]; then

sed -i "1i\   " $SERVER_FILE 2>/dev/null 
sed -i "2i\Proxy:" $SERVER_FILE 2>/dev/null 

egrep '^ {0,}-' $SERVER_FILE |grep name: |awk -F 'name: ' '{print $2}' |sed 's/,.*//' >$Proxy_Group 2>&1
sed -i "s/^ \{0,\}/    - /" $Proxy_Group 2>/dev/null 


yml_servers_add()
{
	
	local section="$1"
	config_get "name" "$section" "name" ""
	config_list_foreach "$section" "groups" set_groups "$name" "$2"
	
}

set_groups()
{

	if [ "$1" = "$3" ]; then
	   echo "    - \"${2}\"" >>$GROUP_FILE 2>/dev/null 
	fi

}

set_other_groups()
{

   if [ "${1}" = "DIRECT" ]||[ "${1}" = "REJECT" ];then
   echo "    - ${1}" >>$GROUP_FILE 2>/dev/null 
   elif [ "${1}" = "ALL" ];then
   cat $Proxy_Group >> $GROUP_FILE 2>/dev/null
   else
   echo "    - \"${1}\"" >>$GROUP_FILE 2>/dev/null 
   fi

}

yml_groups_set()
{

   local section="$1"
   config_get "type" "$section" "type" ""
   config_get "name" "$section" "name" ""
   config_get "old_name" "$section" "old_name" ""
   config_get "test_url" "$section" "test_url" ""
   config_get "test_interval" "$section" "test_interval" ""

   if [ -z "$type" ]; then
      return
   fi
   
   if [ -z "$name" ]; then
      return
   fi
   
   echo "- name: $name" >>$GROUP_FILE 2>/dev/null 
   echo "  type: $type" >>$GROUP_FILE 2>/dev/null 

  if [ "$type" == "url-test" ] || [ "$type" == "load-balance" ] || [ "$type" == "fallback" ] ; then
      echo "  proxies:" >>$GROUP_FILE 2>/dev/null 
      #cat $Proxy_Group >> $GROUP_FILE 2>/dev/null
   else
      echo "  proxies:" >>$GROUP_FILE 2>/dev/null 
   fi       
 
   if [ "$name" != "$old_name" ]; then
      sed -i "s/,${old_name}$/,${name}#d/g" $CONFIG_FILE 2>/dev/null
      sed -i "s/:${old_name}$/:${name}#d/g" $CONFIG_FILE 2>/dev/null
      sed -i "s/\'${old_name}\'/\'${name}\'/g" $CFG_FILE 2>/dev/null
      config_load "clash"
   fi
   
   config_list_foreach "$section" "other_group" set_other_groups 
   config_foreach yml_servers_add "servers" "$name" 
   
   [ ! -z "$test_url" ] && {
   	echo "  url: $test_url" >>$GROUP_FILE 2>/dev/null 
   }
   [ ! -z "$test_interval" ] && {
   echo "  interval: \"$test_interval\"" >>$GROUP_FILE 2>/dev/null 
   }
}


config_load clash
config_foreach yml_groups_set "groups"


if [ "$(ls -l $GROUP_FILE|awk '{print $5}')" -ne 0 ]; then
sed -i "1i\  " $GROUP_FILE 2>/dev/null 
sed -i "2i\Proxy Group:" $GROUP_FILE 2>/dev/null 
fi



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

		
cat >> "$TEMP_FILE" <<-EOF
#config-start-here
EOF

		sed -i "1i\port: ${http_port}" $TEMP_FILE 2>/dev/null
		sed -i "/port: ${http_port}/a\socks-port: ${socks_port}" $TEMP_FILE 2>/dev/null 
		sed -i "/socks-port: ${socks_port}/a\redir-port: ${redir_port}" $TEMP_FILE 2>/dev/null 
		sed -i "/redir-port: ${redir_port}/a\allow-lan: ${allow_lan}" $TEMP_FILE 2>/dev/null 
		if [ $allow_lan == "true" ];  then
		sed -i "/allow-lan: ${allow_lan}/a\bind-address: \"${bind_addr}\"" $TEMP_FILE 2>/dev/null 
		sed -i "/bind-address: \"${bind_addr}\"/a\mode: Rule" $TEMP_FILE 2>/dev/null
		sed -i "/mode: Rule/a\log-level: ${log_level}" $TEMP_FILE 2>/dev/null 
		sed -i "/log-level: ${log_level}/a\external-controller: 0.0.0.0:${dash_port}" $TEMP_FILE 2>/dev/null 
		sed -i "/external-controller: 0.0.0.0:${dash_port}/a\secret: \"${da_password}\"" $TEMP_FILE 2>/dev/null 
		sed -i "/secret: \"${da_password}\"/a\external-ui: \"/usr/share/clash/dashboard\"" $TEMP_FILE 2>/dev/null 
		sed -i "external-ui: \"/usr/share/clash/dashboard\"/a\  " $TEMP_FILE 2>/dev/null 
		sed -i "   /a\   " $TEMP_FILE 2>/dev/null
		else
		sed -i "/allow-lan: ${allow_lan}/a\mode: Rule" $TEMP_FILE 2>/dev/null
		sed -i "/mode: Rule/a\log-level: ${log_level}" $TEMP_FILE 2>/dev/null 
		sed -i "/log-level: ${log_level}/a\external-controller: 0.0.0.0:${dash_port}" $TEMP_FILE 2>/dev/null 
		sed -i "/external-controller: 0.0.0.0:${dash_port}/a\secret: \"${da_password}\"" $TEMP_FILE 2>/dev/null 
		sed -i "/secret: \"${da_password}\"/a\external-ui: \"/usr/share/clash/dashboard\"" $TEMP_FILE 2>/dev/null 
		fi
		sed -i '/#config-start-here/ d' $TEMP_FILE 2>/dev/null

		
cat $DNS_FILE >> $TEMP_FILE  2>/dev/null

cat $SERVER_FILE >> $TEMP_FILE  2>/dev/null

cat $GROUP_FILE >> $TEMP_FILE 2>/dev/null

if [ -f $CONFIG_YAML ];then
	rm -rf $CONFIG_YAML
fi

cat $TEMP_FILE $CONFIG_YAML_RULE > $CONFIG_YAML 2>/dev/null

sed -i "/Rule:/i\     " $CONFIG_YAML 2>/dev/null

rm -rf $TEMP_FILE $GROUP_FILE $Proxy_Group $CONFIG_FILE

 	if [ $lang == "en" ];then
		echo "Completed Creating Custom Config.. " >$REAL_LOG 
		 sleep 2
			echo "Clash for OpenWRT" >$REAL_LOG
	elif [ $lang == "zh_cn" ];then
    	 echo "创建自定义配置完成..." >$REAL_LOG
		  sleep 2
			echo "Clash for OpenWRT" >$REAL_LOG
	fi
	



if [ $config_type == "cus" ];then 
if pidof clash >/dev/null; then
/etc/init.d/clash restart 2>/dev/null
fi
fi

fi
rm -rf $SERVER_FILE


