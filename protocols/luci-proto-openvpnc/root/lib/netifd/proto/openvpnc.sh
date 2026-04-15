#!/bin/sh

[ -n "$INCLUDE_ONLY" ] || {
	. /lib/functions.sh
	. ../netifd-proto.sh
	init_proto "$@"
}

openvpnc_get_first_value() {
	local file="$1"
	local key="$2"

	awk -v key="$key" '
		/^[[:space:]]*[#;]/ { next }
		$1 == key {
			print $2
			exit
		}
	' "$file"
}

openvpnc_is_ipv4() {
	local value="$1"
	local octet

	case "$value" in
		''|*[!0-9.]*|*.*.*.*.*)
			return 1
			;;
	esac

	local old_ifs="$IFS"
	IFS='.'
	set -- $value
	IFS="$old_ifs"
	[ "$#" -eq 4 ] || return 1

	for octet in "$@"; do
		[ -n "$octet" ] || return 1
		[ "$octet" -ge 0 ] 2>/dev/null || return 1
		[ "$octet" -le 255 ] || return 1
	done

	return 0
}

openvpnc_get_upstream_dns_servers() {
	local resolv_file

	for resolv_file in /tmp/resolv.conf.d/resolv.conf.auto /tmp/resolv.conf.auto; do
		[ -r "$resolv_file" ] || continue
		awk '/^nameserver / { print $2 }' "$resolv_file"
	done | awk '!seen[$0]++'
}

openvpnc_resolve_host() {
	local host="$1"
	local ip
	local server

	openvpnc_is_ipv4 "$host" && {
		echo "$host"
		return 0
	}

	if command -v nslookup >/dev/null 2>&1; then
		for server in $(openvpnc_get_upstream_dns_servers); do
			openvpnc_is_ipv4 "$server" || continue
			ip="$({ nslookup "$host" "$server" 2>/dev/null || true; } | awk '/^Address [0-9]+: / { print $3; exit }')"
			openvpnc_is_ipv4 "$ip" || continue
			echo "$ip"
			return 0
		done
	fi

	for ip in $(resolveip -t 5 "$host" 2>/dev/null); do
		openvpnc_is_ipv4 "$ip" || continue
		echo "$ip"
		return 0
	done

	return 1
}

openvpnc_get_dev_type() {
	local file="$1"
	local dev_type
	local dev

	dev_type="$(openvpnc_get_first_value "$file" "dev-type")"
	[ -n "$dev_type" ] && {
		echo "$dev_type"
		return
	}

	dev="$(openvpnc_get_first_value "$file" "dev")"
	case "$dev" in
		tap*) echo "tap" ;;
		*) echo "tun" ;;
	 esac
	}

openvpnc_get_auth_file() {
	local file="$1"
	local mode
	local sidecar

	mode="$(awk '
		/^[[:space:]]*[#;]/ { next }
		$1 == "auth-user-pass" {
			if (NF >= 2) {
				print "configured"
			} else {
				print "required"
			}
			exit
		}
	' "$file")"

	case "$mode" in
		"")
			return 1
			;;
		configured)
			return 2
			;;
		required)
			sidecar="${file%.ovpn}.auth"
			[ -f "$sidecar" ] || return 3
			echo "$sidecar"
			return 0
			;;
	esac

	return 1
}

openvpnc_add_host_dependencies() {
	local config="$1"
	local file="$2"
	local host
	local ip

	for host in $(awk '
		/^[[:space:]]*[#;]/ { next }
		$1 == "remote" && NF >= 2 { print $2 }
	' "$file" | awk '!seen[$0]++'); do
		[ -n "$host" ] || continue
		ip="$(openvpnc_resolve_host "$host")" || continue
		proto_add_host_dependency "$config" "$ip"
	done
}

openvpnc_prepare_profile() {
	local config="$1"
	local file="$2"
	local tmp_file="/var/etc/openvpnc-$config.ovpn"
	local host
	local ip
	local rewrites=''
	local changed=0

	for host in $(awk '
		/^[[:space:]]*[#;]/ { next }
		$1 == "remote" && NF >= 2 { print $2 }
	' "$file" | awk '!seen[$0]++'); do
		openvpnc_is_ipv4 "$host" && continue
		ip="$(openvpnc_resolve_host "$host")" || continue
		rewrites="${rewrites}${host}=${ip}|"
		changed=1
		logger -t openvpnc "resolved remote host $host to $ip for $config"
	done

	if [ "$changed" != "1" ]; then
		echo "$file"
		return 0
	fi

	awk -v rewrites="$rewrites" '
		BEGIN {
			n = split(rewrites, items, /\|/)
			for (i = 1; i <= n; i++) {
				if (items[i] == "")
					continue
				split(items[i], pair, /=/)
				map[pair[1]] = pair[2]
			}
		}
		/^[[:space:]]*[#;]/ {
			print
			next
		}
		$1 == "remote" && NF >= 2 && ($2 in map) {
			$2 = map[$2]
		}
		{
			print
		}
	' "$file" > "$tmp_file" || return 1

	echo "$tmp_file"
}

openvpnc_write_auth_file() {
	local file="$1"
	local username="$2"
	local password="$3"

	mkdir -p "${file%/*}" || return 1
	umask 077
	{
		printf '%s\n' "$username"
		printf '%s\n' "$password"
	} > "$file"
}

openvpnc_zone_name() {
	printf 'ovpnc'
}

openvpnc_zone_section() {
	openvpnc_zone_name "$1"
}

openvpnc_forwarding_section() {
	printf '%s_fwd' "$(openvpnc_zone_name "$1")"
}

openvpnc_firewall_reload() {
	/etc/init.d/firewall enabled >/dev/null 2>&1 || return 0
	/etc/init.d/firewall reload >/dev/null 2>&1
}

openvpnc_sync_dnsmasq() {
	[ -x /usr/bin/openvpnc-dnsmasq-sync ] || return 0
	/usr/bin/openvpnc-dnsmasq-sync >/dev/null 2>&1
}

openvpnc_ensure_firewall() {
	local config="$1"
	local zone_section forwarding_section zone_name changed=0
	local legacy_zone_section legacy_forwarding_section

	zone_section="$(openvpnc_zone_section "$config")"
	forwarding_section="$(openvpnc_forwarding_section "$config")"
	zone_name="$zone_section"
	legacy_zone_section="$(printf 'openvpnc_%s' "$config" | tr -c 'A-Za-z0-9_' '_')"
	legacy_forwarding_section="$(printf 'openvpnc_%s_lan_fwd' "$config" | tr -c 'A-Za-z0-9_' '_')"

	for old_section in "$legacy_zone_section" "$legacy_forwarding_section" ovpn_ ovpn__fwd ovpnc_lan_fwd_; do
		if uci -q get firewall.$old_section >/dev/null; then
			uci -q delete firewall.$old_section
			changed=1
		fi
	done

	if [ "$(uci -q get firewall.$zone_section)" != "zone" ]; then
		uci -q set firewall.$zone_section=zone
		changed=1
	fi

	if [ "$(uci -q get firewall.$zone_section.name)" != "$zone_name" ]; then
		uci -q set firewall.$zone_section.name="$zone_name"
		changed=1
	fi

	if [ "$(uci -q get firewall.$zone_section.input)" != "REJECT" ]; then
		uci -q set firewall.$zone_section.input='REJECT'
		changed=1
	fi

	if [ "$(uci -q get firewall.$zone_section.output)" != "ACCEPT" ]; then
		uci -q set firewall.$zone_section.output='ACCEPT'
		changed=1
	fi

	if [ "$(uci -q get firewall.$zone_section.forward)" != "REJECT" ]; then
		uci -q set firewall.$zone_section.forward='REJECT'
		changed=1
	fi

	if [ "$(uci -q get firewall.$zone_section.masq)" != "1" ]; then
		uci -q set firewall.$zone_section.masq='1'
		changed=1
	fi

	if [ "$(uci -q get firewall.$zone_section.mtu_fix)" != "1" ]; then
		uci -q set firewall.$zone_section.mtu_fix='1'
		changed=1
	fi

	if [ "$(uci -q get firewall.$zone_section.family)" != "ipv4" ]; then
		uci -q set firewall.$zone_section.family='ipv4'
		changed=1
	fi

	if [ "$(uci -q get firewall.$zone_section.network)" != "$config" ]; then
		uci -q delete firewall.$zone_section.network
		uci add_list firewall.$zone_section.network="$config"
		changed=1
	fi

	if [ "$(uci -q get firewall.$forwarding_section)" != "forwarding" ]; then
		uci -q set firewall.$forwarding_section=forwarding
		changed=1
	fi

	if [ "$(uci -q get firewall.$forwarding_section.src)" != "lan" ]; then
		uci -q set firewall.$forwarding_section.src='lan'
		changed=1
	fi

	if [ "$(uci -q get firewall.$forwarding_section.dest)" != "$zone_name" ]; then
		uci -q set firewall.$forwarding_section.dest="$zone_name"
		changed=1
	fi

	if [ "$changed" = "1" ]; then
		uci commit firewall
		logger -t openvpnc "updated firewall zone $zone_name for interface $config"
		openvpnc_firewall_reload
	fi
}

proto_openvpnc_init_config() {
	proto_config_add_string "ovpn_file"
	proto_config_add_string "username"
	proto_config_add_string "password"
	proto_config_add_int "mtu"
	available=1
	no_device=1
}

proto_openvpnc_setup() {
	local config="$1"
	local ovpn_file username password mtu
	local ifname dev_type auth_file auth_state auth_required auth_inline ovpn_run_file

	json_get_vars ovpn_file username password mtu

	[ -n "$username" ] || username="$(uci -q get network.$config.username)"
	[ -n "$password" ] || password="$(uci -q get network.$config.password)"

	ifname="vpn-$config"
	mkdir -p /etc/openvpn/openvpnc

	[ -n "$ovpn_file" ] && [ -f "$ovpn_file" ] || {
		logger -t openvpnc "missing profile for $config"
		proto_setup_failed "$config"
		proto_block_restart "$config"
		return 1
	}

	openvpnc_add_host_dependencies "$config" "$ovpn_file"

	mkdir -p /var/run /var/etc
	ovpn_run_file="$(openvpnc_prepare_profile "$config" "$ovpn_file")" || {
		logger -t openvpnc "failed to prepare runtime profile for $config"
		proto_setup_failed "$config"
		proto_block_restart "$config"
		return 1
	}

	dev_type="$(openvpnc_get_dev_type "$ovpn_file")"
	auth_file="$(openvpnc_get_auth_file "$ovpn_file")"
	auth_state="$?"
	auth_required=0
	auth_inline=0

	case "$auth_state" in
		0|3)
			auth_required=1
			auth_file="${ovpn_file%.ovpn}.auth"
			;;
		2)
			auth_required=1
			auth_inline=1
			;;
	esac

	if [ -n "$username$password" ]; then
		[ -n "$username" ] && [ -n "$password" ] || {
			logger -t openvpnc "username and password must both be set for $config"
			proto_setup_failed "$config"
			proto_block_restart "$config"
			return 1
		}

		auth_file="${ovpn_file%.ovpn}.auth"
		openvpnc_write_auth_file "$auth_file" "$username" "$password" || {
			logger -t openvpnc "failed to write auth file $auth_file for $config"
			proto_setup_failed "$config"
			proto_block_restart "$config"
			return 1
		}
		auth_required=1
		auth_state=0
	fi

	if [ "$auth_state" = "3" ]; then
		logger -t openvpnc "profile $ovpn_file requires auth-user-pass; set username and password in UCI or create ${ovpn_file%.ovpn}.auth with username on first line and password on second line"
		proto_setup_failed "$config"
		proto_block_restart "$config"
		return 1
	fi

	openvpnc_ensure_firewall "$config"
	openvpnc_sync_dnsmasq

	set -- /usr/sbin/openvpn \
		--syslog "openvpnc($config)" \
		--status "/var/run/openvpnc-$config.status" \
		--cd "${ovpn_file%/*}" \
		--config "$ovpn_run_file" \
		--dev "$ifname" \
		--dev-type "$dev_type" \
		--script-security 2 \
		--up /lib/netifd/openvpnc-up \
		--down-pre \
		--down /lib/netifd/openvpnc-down \
		--setenv OPENVPNC_ID "$config"

	[ -n "$mtu" ] && set -- "$@" --tun-mtu "$mtu"
	if [ "$auth_required" = "1" ] && [ "$auth_inline" = "0" ]; then
		set -- "$@" --auth-user-pass "$auth_file"
	fi

	proto_run_command "$config" "$@"
}

proto_openvpnc_teardown() {
	local config="$1"

	rm -f "/var/run/openvpnc-$config.status"
	rm -f "/var/etc/openvpnc-$config.ovpn"
	openvpnc_sync_dnsmasq
	proto_kill_command "$config"
}

[ -n "$INCLUDE_ONLY" ] || {
	add_protocol openvpnc
}
