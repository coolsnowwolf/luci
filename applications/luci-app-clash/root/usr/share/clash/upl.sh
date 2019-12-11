#!/bin/sh /etc/rc.common

. /lib/functions.sh

load="/usr/share/clash/config/upload/config.yaml"	

awk '/^ {0,}Proxy:/,/^ {0,}Proxy Group:/{print}' $load 2>/dev/null |sed 's/\"//g' 2>/dev/null |sed "s/\'//g" 2>/dev/null |sed 's/\t/ /g' 2>/dev/null >/tmp/yaml_proxy.yaml 2>&1

server_file="/tmp/yaml_proxy.yaml"
single_server="/tmp/servers.yaml"
count=1
line=$(sed -n '/^ \{0,\}-/=' $server_file)
num=$(grep -c "^ \{0,\}-" $server_file)

cfg_get()
{
	echo "$(grep "$1" $single_server 2>/dev/null |awk -v tag=$1 'BEGIN{FS=tag} {print $2}' 2>/dev/null |sed 's/,.*//' 2>/dev/null |sed 's/^ \{0,\}//g' 2>/dev/null |sed 's/ \{0,\}$//g' 2>/dev/null |sed 's/ \{0,\}\}\{0,\}$//g' 2>/dev/null)"
}


for n in $line
do

   [ "$count" -eq 1 ] && {
      startLine="$n"
  }

   count=$(expr "$count" + 1)
   if [ "$count" -gt "$num" ]; then
      endLine=$(sed -n '$=' $server_file)
   else
      endLine=$(expr $(echo "$line" | sed -n "${count}p") - 1)
   fi
  
   sed -n "${startLine},${endLine}p" $server_file >$single_server
   startLine=$(expr "$endLine" + 1)
   
   #type
   server_type="$(cfg_get "type:")"
   #name
   server_name="$(cfg_get "name:")"
   #server
   server="$(cfg_get "server:")"
   #port
   port="$(cfg_get "port:")"
   #cipher
   cipher="$(cfg_get "cipher:")"
   #password
   password="$(cfg_get "password:")"
   #protocol
   protocol="$(cfg_get "protocol:")"
   #protocolparam
   protocolparam="$(cfg_get "protocolparam:")"
   #obfsparam
   obfsparam="$(cfg_get "obfsparam:")"
   #udp
   udp="$(cfg_get "udp:")"
   #plugin:
   plugin="$(cfg_get "plugin:")"
   #plugin-opts:
   plugin_opts="$(cfg_get "plugin-opts:")"
   #obfs:
   obfs="$(cfg_get "obfs:")"
   #obfs-host:
   obfs_host="$(cfg_get "obfs-host:")"
   #psk:
   obfs="$(cfg_get "psk:")"
   #mode:
   mode="$(cfg_get "mode:")"
   #tls:
   tls="$(cfg_get "tls:")"
   #skip-cert-verify:
   verify="$(cfg_get "skip-cert-verify:")"
   #mux:
   mux="$(cfg_get "mux:")"
   #host:
   host="$(cfg_get "host:")"
   #Host:
   Host="$(cfg_get "Host:")"
   #path:
   path="$(cfg_get "path:")"
   #ws-path:
   ws_path="$(cfg_get "ws-path:")"
   #headers_custom:
   headers="$(cfg_get "custom:")"
   #uuid:
   uuid="$(cfg_get "uuid:")"
   #alterId:
   alterId="$(cfg_get "alterId:")"
   #network
   network="$(cfg_get "network:")"
   #username
   username="$(cfg_get "username:")"
   #tls_custom:
   tls_custom="$(cfg_get "tls:")"
   
   name=clash
   uci_name_tmp=$(uci add $name servers)

   uci_set="uci -q set $name.$uci_name_tmp."
   uci_add="uci -q add_list $name.$uci_name_tmp."
    
   ${uci_set}name="$server_name"
   ${uci_set}type="$server_type"
   ${uci_set}server="$server"
   ${uci_set}port="$port"
   if [ "$server_type" = "vmess" ]; then
      ${uci_set}securitys="$cipher"
   elif [ "$server_type" = "ss" ]; then
      ${uci_set}cipher="$cipher"
   elif [ "$server_type" = "ssr" ]; then
      ${uci_set}cipher_ssr="$cipher"  
   fi
   ${uci_set}udp="$udp"
   
   ${uci_set}protocol="$protocol"
   ${uci_set}protocolparam="$protocolparam"

   if [ "$server_type" = "ss" ]; then
      ${uci_set}obfs="$obfs"
   elif [ "$server_type" = "ssr" ]; then
      ${uci_set}obfs_ssr="$obfs"
   fi
  
	
    ${uci_set}tls_custom="$tls_custom"

   ${uci_set}obfsparam="$obfsparam"

  
   ${uci_set}host="$obfs_host"
   

   [ -z "$obfs" ] && ${uci_set}obfs="$mode"

   if [ "$server_type" = "vmess" ]; then

	[ -z "$mode" ] && [ ! -z "$network" ] && ${uci_set}obfs_vmess="websocket"
	   
	[ -z "$mode" ] && [ -z "$network" ] && ${uci_set}obfs_vmess="none"
   fi
   ${uci_set}obfs_snell="$mode"
      [ -z "$obfs" ] && [ "$server_type" != "snell" ] && ${uci_set}obfs="$mode"
      [ -z "$mode" ] && [ "$server_type" != "snell" ] && ${uci_set}obfs="none"
      [ -z "$mode" ] && ${uci_set}obfs_snell="none"
   [ -z "$obfs_host" ] && ${uci_set}host="$host"

   if [ $tls ] && [ "$server_type" != "ss" ];then 
   ${uci_set}tls="$tls"
   fi
   ${uci_set}psk="$psk"
   if [ $verify ] && [ "$server_type" != "ssr" ];then
   ${uci_set}skip_cert_verify="$verify"
   fi

   ${uci_set}path="$path"
   [ -z "$path" ] && ${uci_set}path="$ws_path"
   ${uci_set}mux="$mux"
   ${uci_set}custom="$headers"
   
   [ -z "$headers" ] && ${uci_set}custom="$Host"
    
   if [ "$server_type" = "vmess" ]; then
    #v2ray
    ${uci_set}alterId="$alterId"
    ${uci_set}uuid="$uuid"
   fi
	
   if [ "$server_type" = "socks5" ] || [ "$server_type" = "http" ]; then
     ${uci_set}auth_name="$username"
     ${uci_set}auth_pass="$password"
   else
     ${uci_set}password="$password"
   fi
	
done

sleep 2

uci commit clash
rm -rf /tmp/servers.yaml 2>/dev/null
rm -rf /tmp/yaml_proxy.yaml 2>/dev/null



