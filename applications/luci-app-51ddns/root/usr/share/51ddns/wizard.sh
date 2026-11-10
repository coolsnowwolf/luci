# Copyright 2026 51DDNS
# SPDX-License-Identifier: Apache-2.0

wizard_root=/tmp/51ddns-luci-wizard
wizard_config=/etc/config/51ddns
wizard_identity=/etc/51ddns
wizard_api=https://api.51ddns.com

wizard_reply() {
	json_init
	json_add_string state "$1"
	shift
	while [ "$#" -ge 2 ]; do
		json_add_string "$1" "$2"
		shift 2
	done
	json_dump
	json_cleanup
}

wizard_fail() {
	wizard_reply error code "$1"
	exit 0
}

wizard_field() { jsonfilter -i "$1" -e "$2" 2> /dev/null; }
wizard_uptime() { cut -d. -f1 /proc/uptime; }
wizard_mode() { ls -ldn "$1" 2> /dev/null | awk '{print $1 ":" $3 ":" $4}'; }
wizard_uuid() { cat /proc/sys/kernel/random/uuid 2> /dev/null; }
wizard_get() { uci -q get "51ddns.main.$1" 2> /dev/null; }
wizard_own_file() { [ -f "$1" ] && [ ! -L "$1" ] && [ "$(wizard_mode "$1")" = '-rw-------:0:0' ]; }
wizard_own_dir() { [ -d "$1" ] && [ ! -L "$1" ] && [ "$(wizard_mode "$1")" = 'drwx------:0:0' ]; }

valid_router_web_target() {
	local address host port
	[ -z "$1" ] && return 0
	[ "${#1}" -le 128 ] || return 1
	case "$1" in http://* | https://*) address="${1#*://}" ;; *) return 1 ;; esac
	address="${address%/}"
	case "$address" in
	\[*\]:*) host="${address#\[}"; host="${host%%\]*}"; port="${address##*:}"; [ "$address" = "[$host]:$port" ] || return 1 ;;
	\[*\]) host="${address#\[}"; host="${host%\]}"; port='' ;;
	*:*) host="${address%:*}"; port="${address##*:}"; [ -n "$port" ] || return 1 ;;
	*) host="$address"; port='' ;;
	esac
	case "$host" in '' | *[!0-9a-fA-F:.]*) return 1 ;; esac
	case "$port" in '' ) ;; *[!0-9]*) return 1 ;; esac
	if [ -n "$port" ]; then
		[ "${#port}" -le 5 ] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] && [ "$port" -ne 17851 ] || return 1
	fi
	case "$host" in 127.0.0.1 | ::1) return 0 ;; 0.0.0.0 | :: | 22[4-9].* | 23[0-9].* | [fF][fF]*) return 1 ;; esac
	ip -o address show 2> /dev/null | awk -v host="$host" '
		$3 == "inet" || $3 == "inet6" { sub(/\/.*/, "", $4); if (tolower($4) == tolower(host)) found=1 }
		END { exit !found }'
}

wizard_session_remove() {
	wizard_own_dir "$1" || return 1
	rm -f "$1/cookie" "$1/expiry" "$1/device-id" "$1/device-name" "$1/installation-id" "$1/pending-token" "$1/bound" "$1/written" \
		"$1/replace-offer" "$1/replace-from" "$1/replace-config" "$1/luci-session"
	rmdir "$1"
}

wizard_session_alive() {
	local deadline
	wizard_own_dir "$1" && wizard_own_file "$1/cookie" || return 1
	if [ -e "$1/luci-session" ] || [ -L "$1/luci-session" ]; then
		# A LuCI-bound handle follows the cloud cookie lifetime.
		wizard_own_file "$1/luci-session" || return 1
		awk -F '\t' '$5 ~ /^[0-9]+$/ && ($5 == 0 || $5 > systime()) { valid=1 } END { exit !valid }' "$1/cookie"
		return
	fi
	wizard_own_file "$1/expiry" || return 1
	deadline="$(cat "$1/expiry")" || return 1
	case "$deadline" in '' | *[!0-9]*) return 1 ;; esac
	[ "${#deadline}" -le 12 ] && [ "$deadline" -gt "$(wizard_uptime)" ]
}

wizard_rpc_session() {
	local id
	# LuCI's authenticated ubus proxy inserts this field and rejects it in client arguments.
	id="$(wizard_field "$work/request" '@.ubus_rpc_session')" || return 1
	case "$id" in *[!0-9a-f]* | 00000000000000000000000000000000) return 1 ;; esac
	[ "${#id}" -eq 32 ] || return 1
	printf '%s' "$id"
}

wizard_session_matches_rpc() {
	local id
	wizard_own_dir "$session" && wizard_own_file "$session/luci-session" || return 1
	id="$(wizard_rpc_session)" || return 1
	[ "$(cat "$session/luci-session")" = "$id" ]
}

wizard_session_gc() {
	local directory suffix
	for directory in "$wizard_root"/session-*; do
		[ -e "$directory" ] || continue
		suffix="${directory##*/session-}"
		case "$suffix" in *[!0-9a-f]*) continue ;; esac
		[ "${#suffix}" -eq 32 ] || continue
		wizard_session_alive "$directory" || wizard_session_remove "$directory" >/dev/null 2>&1
	done
}

wizard_cloud() {
	local endpoint="$1" body="$2" cookie="$3" save_cookie="$4"
	case "$endpoint" in
	register | login | logout) endpoint="/v1/auth/$endpoint" ;;
	bind) endpoint=/v1/router-setup/bind ;;
	*) return 1 ;;
	esac
	set -- -q --silent --show-error --proto '=https' --noproxy '*' --tlsv1.2 \
		--cacert /etc/ssl/certs/ca-certificates.crt --connect-timeout 4 --max-time 12 \
		--max-filesize 65536 --request POST --header 'Content-Type: application/json' \
		--user-agent '51DDNS-LuCI-Setup/1' --data-binary "@$body" --output "$work/response" --write-out '%{http_code}'
	[ -z "$cookie" ] || set -- "$@" --cookie "$cookie"
	[ -z "$save_cookie" ] || set -- "$@" --cookie-jar "$save_cookie"
	cloud_status="$(curl "$@" "$wizard_api$endpoint" 2> /dev/null)" || return 1
	[ "${#cloud_status}" -eq 3 ] || return 1
}

wizard_cloud_read() {
	local endpoint="$1" cookie="${2:-}"
	set -- -q --silent --proto '=https' --noproxy '*' --tlsv1.2 \
		--cacert /etc/ssl/certs/ca-certificates.crt --connect-timeout 4 --max-time 12 --max-filesize 65536 \
		--output "$work/response" --write-out '%{http_code}'
	[ -z "$cookie" ] || set -- "$@" --cookie "$cookie" --cookie-jar "$work/cookie-raw"
	cloud_status="$(curl "$@" "$wizard_api$endpoint" 2>/dev/null)" ||
		wizard_fail transport_unavailable
	if [ -n "$cookie" ] && [ "$cloud_status" = 200 ]; then
		wizard_renew_cookie "$cookie"
	fi
}

wizard_verify_session() {
	wizard_cloud_read /v1/auth/session "$session/cookie"
	case "$cloud_status" in
	401)
		wizard_session_remove "$session" >/dev/null 2>&1 || wizard_fail config_write_failed
		return 1
		;;
	200) ;;
	*) wizard_fail server_unavailable ;;
	esac
	session_email="$(wizard_field "$work/response" '@.user.email')" || wizard_fail server_unavailable
	case "$session_email" in '' | *[[:space:][:cntrl:]]*) wizard_fail server_unavailable ;; esac
	[ "${#session_email}" -le 254 ] || wizard_fail server_unavailable
}

wizard_resume() {
	local session_email
	if wizard_verify_session; then
		wizard_reply authenticated handle "$handle" account_email "$session_email"
	else
		wizard_reply signed_out
	fi
}

wizard_plans() {
	local device endpoint=/v1/router-setup/plans
	device="$(wizard_field "$work/request" '@.device_id')"
	if [ -n "$device" ]; then
		valid_device_id "$device" || wizard_fail invalid_request
		endpoint="$endpoint?device_id=$device"
	fi
	wizard_cloud_read "$endpoint" "$session/cookie"
	[ "$cloud_status" = 200 ] || wizard_cloud_error
	[ "$(wizard_field "$work/response" '@.state')" = plans ] || wizard_fail server_unavailable
	cat "$work/response"
}

wizard_catalog() {
	local products products_type
	wizard_cloud_read /v1/products
	[ "$cloud_status" = 200 ] || wizard_fail server_unavailable
	json_load "$(cat "$work/response")" 2>/dev/null || wizard_fail server_unavailable
	json_get_type products_type products || wizard_fail server_unavailable
	[ "$products_type" = array ] || wizard_fail server_unavailable
	json_cleanup
	products="$(wizard_field "$work/response" '@.products')" || wizard_fail server_unavailable
	printf '{"state":"catalog","products":%s}\n' "$products"
}

wizard_cloud_error() {
	local code
	if [ "$cloud_status" = 401 ] && [ -n "${session:-}" ]; then
		wizard_session_remove "$session" >/dev/null 2>&1 || wizard_fail config_write_failed
		wizard_fail session_expired
	fi
	code="$(wizard_field "$work/response" '@.error.code')"
	case "$code" in
	invalid_credentials | email_exists | invalid_invite_code | login_rate_limited | device_quota_exceeded | device_record_limit_exceeded)
		wizard_fail "$code" ;;
	router_setup_device_unavailable) wizard_fail device_unavailable ;;
	router_setup_plan_unavailable) wizard_fail plan_unavailable ;;
	router_setup_binding_changed) wizard_fail device_installation_mismatch ;;
	invalid_installation | invalid_device_id) wizard_fail invalid_request ;;
	*) [ "$cloud_status" != 401 ] || wizard_fail session_expired; wizard_fail server_unavailable ;;
	esac
}

wizard_cookie() {
	# Keep only the exact secure API session cookie, in curl's private file format.
	awk -F '\t' '$1 == "#HttpOnly_api.51ddns.com" && $2 == "FALSE" && $3 == "/" && $4 == "TRUE" &&
		$5 ~ /^[0-9]+$/ && ($5 == 0 || $5 > systime()) &&
		$6 == "51ddns_api_session" && length($7) >= 16 && length($7) <= 256 && $7 !~ /[^A-Za-z0-9_-]/ { print; found++ }
		END { exit found != 1 }' "$1" > "$2"
}

wizard_renew_cookie() {
	# Preserve the old private jar if the server did not return a usable cookie.
	if [ -s "$work/cookie-raw" ] && wizard_cookie "$work/cookie-raw" "$work/cookie"; then
		mv -f "$work/cookie" "$1" 2>/dev/null || :
	fi
}

wizard_owner_hint() {
	local token address status
	token="$(wizard_get account_token)" || return 1
	case "$token" in 51d_*[!A-Za-z0-9_-]* | 51d_) return 1 ;; 51d_*) ;; *) return 1 ;; esac
	[ "${#token}" -ge 16 ] && [ "${#token}" -le 128 ] || return 1
	printf 'Authorization: Bearer %s\nX-51DDNS-Device-ID: %s\n' "$token" "$1" > "$work/owner-header" || return 1
	set -- -q --silent --proto '=https' --noproxy '*' --tlsv1.2 \
		--cacert /etc/ssl/certs/ca-certificates.crt --connect-timeout 2 --max-time 3 \
		--max-filesize 8192 --header "@$work/owner-header" --output "$work/owner-response" --write-out '%{http_code}'
	status="$(curl "$@" "$wizard_api/v1/agent/identity" 2>/dev/null)" && [ "$status" = 204 ] || return 1
	status="$(curl "$@" "$wizard_api/v1/agent/token-owner" 2>/dev/null)" && [ "$status" = 200 ] || return 1
	address="$(wizard_field "$work/owner-response" '@.account_email')" || return 1
	printf '%s\n' "$address" | LC_ALL=C awk -F '@' '
		NR != 1 || NF != 2 || length($0) > 254 || $1 !~ /^[A-Za-z0-9][A-Za-z0-9._+-]*$/ ||
		$2 !~ /^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z][A-Za-z]+$/ { exit 1 }
		{ printf "%s***@%s", substr($1, 1, 1), tolower($2) }'
}

wizard_credentials() {
	local email password invite
	email="$(wizard_field "$work/request" '@.email')" || wizard_fail invalid_request
	password="$(wizard_field "$work/request" '@.password')" || wizard_fail invalid_request
	invite="$(wizard_field "$work/request" '@.invite_code')"
	[ "${#email}" -ge 5 ] && [ "${#email}" -le 254 ] && [ "${#password}" -ge 1 ] && [ "${#password}" -le 128 ] &&
		[ "${#invite}" -le 128 ] || wizard_fail invalid_request
	case "$email$password$invite" in *[[:cntrl:]]*) wizard_fail invalid_request ;; esac
	json_init
	json_add_string email "$email"
	json_add_string password "$password"
	[ -z "$invite" ] || json_add_string invite_code "$invite"
	json_dump > "$work/payload" || wizard_fail invalid_request
	json_cleanup
}

wizard_auth() {
	local action="$1" handle directory rpc_session
	rpc_session="$(wizard_rpc_session)" || rpc_session=''
	wizard_credentials
	wizard_cloud "$action" "$work/payload" '' "$work/cookie-raw" || wizard_fail transport_unavailable
	rm -f "$work/payload" "$work/request"
	case "$action:$cloud_status" in register:201 | login:200) ;; *) wizard_cloud_error ;; esac
	wizard_cookie "$work/cookie-raw" "$work/cookie" || wizard_fail server_unavailable
	if [ "$action" = register ]; then
		wizard_cloud logout "$work/empty" "$work/cookie" '' || :
		wizard_reply registered
		return
	fi
	handle="$(wizard_uuid | tr -d '-')"
	[ "${#handle}" -eq 32 ] || wizard_fail server_unavailable
	case "$handle" in *[!0-9a-f]*) wizard_fail server_unavailable ;; esac
	directory="$wizard_root/session-$handle"
	mkdir -m 700 "$directory" && mv "$work/cookie" "$directory/cookie" || wizard_fail server_unavailable
	if [ -n "$rpc_session" ]; then
		printf '%s\n' "$rpc_session" > "$directory/luci-session" || wizard_fail server_unavailable
	else
		printf '%s\n' "$(( $(wizard_uptime) + 600 ))" > "$directory/expiry" || wizard_fail server_unavailable
	fi
	wizard_reply authenticated handle "$handle"
}

wizard_match_identity() {
	local requested="$1" configured saved
	read_device_identity
	[ "$status_identity_state" != unavailable ] || wizard_fail device_not_ready
	saved="$(printf '%s' "$status_device_id" | tr 'A-F' 'a-f')"
	configured="$(wizard_get device_id | tr 'A-F' 'a-f')"
	[ -z "$configured" ] || valid_device_id "$configured" || wizard_fail device_mismatch
	[ -z "$requested" ] || valid_device_id "$requested" || wizard_fail invalid_request
	requested="$(printf '%s' "$requested" | tr 'A-F' 'a-f')"
	[ -z "$saved" ] || [ -z "$configured" ] || [ "$saved" = "$configured" ] || wizard_fail device_mismatch
	selected_device="${saved:-$configured}"
	[ -z "$selected_device" ] || [ -z "$requested" ] || [ "$selected_device" = "$requested" ] || wizard_fail device_mismatch
	selected_device="${selected_device:-$requested}"
	if [ -z "$saved" ] && pidof 51ddns-agent >/dev/null 2>&1; then
		wizard_fail device_not_ready
	fi
}

wizard_installation() {
	local file="$wizard_identity/install.id" fresh
	[ ! -L "$wizard_identity" ] && [ ! -L "$file" ] || wizard_fail device_not_ready
	if [ ! -e "$file" ]; then
		if [ ! -e "$wizard_identity" ]; then
			mkdir -m 700 "$wizard_identity" && chown ddns51:ddns51 "$wizard_identity" || wizard_fail config_write_failed
		fi
		[ -d "$wizard_identity" ] && [ ! -L "$wizard_identity" ] || wizard_fail config_write_failed
		fresh="$(wizard_uuid)"
		valid_device_id "$fresh" || wizard_fail config_write_failed
		install_stage="$(mktemp "$wizard_identity/.wizard-install-XXXXXX")" || wizard_fail config_write_failed
		printf '%s\n' "$fresh" > "$install_stage" && chown ddns51:ddns51 "$install_stage" &&
			chmod 600 "$install_stage" || wizard_fail config_write_failed
		ln "$install_stage" "$file" 2> /dev/null || [ -f "$file" ] || wizard_fail config_write_failed
		rm -f "$install_stage"
		install_stage=''
	fi
	[ -f "$file" ] && [ ! -L "$file" ] || wizard_fail device_not_ready
	installation="$(cat "$file" 2> /dev/null)"
	valid_device_id "$installation" || wizard_fail device_not_ready
}

wizard_clear_replacement() {
	rm -f "$session/replace-from" "$session/replace-config" "$session/replace-offer" || wizard_fail config_write_failed
}

wizard_bind() {
	local device name token requested plan from='' hint='' completed_replacement=0 previous
	requested="$(wizard_field "$work/request" '@.device_id' | tr 'A-F' 'a-f')"
	plan="$(wizard_field "$work/request" '@.plan_id' | tr 'A-F' 'a-f')"
	[ -z "$plan" ] || valid_device_id "$plan" || wizard_fail invalid_request
	wizard_match_identity "$requested"
	wizard_installation
	if [ "$action" = replace ]; then
		[ "$status_identity_state" = saved ] &&
			[ "$requested" = "$selected_device" ] &&
			wizard_own_file "$session/replace-offer" &&
			[ "$(cat "$session/replace-offer")" = "$selected_device" ] || wizard_fail device_mismatch
		[ ! -e "$session/written" ] || wizard_fail device_mismatch
		from="$selected_device"
		selected_device=''
	elif [ -e "$session/replace-from" ] || [ -L "$session/replace-from" ]; then
		# Older versions retained replacement metadata after writing the new identity.
		wizard_own_file "$session/replace-from" && wizard_own_file "$session/replace-config" &&
			wizard_own_file "$session/bound" && wizard_own_file "$session/written" &&
			wizard_own_file "$session/device-id" &&
			[ ! -e "$session/pending-token" ] && [ ! -L "$session/pending-token" ] ||
			wizard_fail device_mismatch
		previous="$(cat "$session/replace-from")"
		valid_device_id "$previous" && [ "$previous" != "$selected_device" ] &&
			[ "$status_identity_state" = saved ] && [ "$requested" = "$selected_device" ] &&
			[ "$(wizard_get device_id | tr 'A-F' 'a-f')" = "$selected_device" ] &&
			[ "$(cat "$session/device-id")" = "$selected_device" ] ||
			wizard_fail device_mismatch
		completed_replacement=1
	fi
	if [ -s "$session/device-id" ]; then
		[ -z "$selected_device" ] || [ "$(cat "$session/device-id")" = "$selected_device" ] || wizard_fail device_mismatch
		selected_device="$(cat "$session/device-id")"
	fi
	json_init
	json_add_string installation_id "$installation"
	[ -z "$selected_device" ] || json_add_string device_id "$selected_device"
	[ -z "$plan" ] || json_add_string plan_id "$plan"
	json_dump > "$work/payload" || wizard_fail invalid_request
	json_cleanup
	wizard_cloud bind "$work/payload" "$session/cookie" "$work/cookie-raw" || wizard_fail transport_unavailable
	case "$cloud_status" in
	200 | 201) wizard_renew_cookie "$session/cookie" ;;
	*)
		if [ "$action" = bind ] && [ "$status_identity_state" = saved ] &&
			[ "$(wizard_field "$work/response" '@.error.code')" = router_setup_device_unavailable ]; then
			printf '%s\n' "$selected_device" > "$session/replace-offer" || wizard_fail config_write_failed
			hint="$(wizard_owner_hint "$selected_device")" || hint=''
			wizard_reply error code device_unavailable owner_email_hint "$hint"
			return
		fi
		wizard_cloud_error
		;;
	esac
	[ -z "$plan" ] || [ "$(wizard_field "$work/response" '@.plan_id')" = "$plan" ] || wizard_fail plan_unavailable
	device="$(wizard_field "$work/response" '@.device_id')"
	name="$(wizard_field "$work/response" '@.device_name')"
	token="$(wizard_field "$work/response" '@.account_token')"
	valid_device_id "$device" && [ "${#name}" -le 256 ] || wizard_fail server_unavailable
	case "$token" in 51d_*[!A-Za-z0-9_-]* | 51d_) wizard_fail server_unavailable ;; 51d_*) ;; *) wizard_fail server_unavailable ;; esac
	[ "${#token}" -ge 16 ] && [ "${#token}" -le 128 ] || wizard_fail server_unavailable
	device="$(printf '%s' "$device" | tr 'A-F' 'a-f')"
	[ -z "$selected_device" ] || [ "$selected_device" = "$device" ] || wizard_fail device_mismatch
	[ "$from" != "$device" ] || wizard_fail device_mismatch
	[ "$completed_replacement" = 0 ] || wizard_clear_replacement
	rm -f "$session/bound" "$session/written"
	if [ -n "$from" ]; then
		printf '%s\n' "$from" > "$session/replace-from" &&
			printf '%s\n' "$config_before" > "$session/replace-config" || wizard_fail config_write_failed
	fi
	printf '%s\n' "$device" > "$session/device-id" && printf '%s\n' "$name" > "$session/device-name" &&
		printf '%s\n' "$installation" > "$session/installation-id" && printf '%s\n' "$token" > "$session/pending-token" &&
		: > "$session/bound" || wizard_fail config_write_failed
	wizard_reply bound device_id "$device" device_name "$name"
}

wizard_pending_clean() {
	[ ! -L /tmp/.uci ] && [ ! -L /tmp/.uci/51ddns ] && [ ! -s /tmp/.uci/51ddns ]
}

wizard_other_config() {
	uci -q export "$1" > "$work/export" 2>/dev/null || return 1
	awk -v permitted="$2" '
		$1 == "config" { main = ($2 == "agent" && $3 == "\047main\047") }
		main && $1 == "option" && index(permitted, " " $2 " ") { next }
		{ print }' "$work/export"
}

wizard_replace_config() {
	config_stage="$(mktemp /etc/config/.51ddns-wizard-XXXXXX)" || return 1
	cat "$1" > "$config_stage" && chmod 600 "$config_stage" || return 1
	wizard_pending_clean && wizard_own_file "$wizard_config" && cmp -s "$wizard_config" "$2" || return 1
	mv -f "$config_stage" "$wizard_config" || return 1
	config_stage=''
}

wizard_prepare_config() {
	local permitted="$1"
	shift
	wizard_own_file "$wizard_config" || wizard_fail config_write_failed
	exec 8< "$wizard_config" || wizard_fail config_write_failed
	flock -n 8 && wizard_pending_clean || wizard_fail pending_config_changes
	mkdir "$work/original" "$work/config" "$work/delta" &&
		cp "$wizard_config" "$original" && cp "$original" "$candidate" || wizard_fail config_write_failed
	[ "$(sha256sum "$original" | cut -d ' ' -f 1)" = "$config_before" ] || wizard_fail pending_config_changes
	uci -q -c "$work/config" -t "$work/delta" batch < "$work/changes" >/dev/null 2>&1 || wizard_fail config_write_failed
	while [ "$#" -ge 2 ]; do
		[ "$(uci -q -c "$work/config" -t "$work/delta" get "51ddns.main.$1" 2>/dev/null)" = "$2" ] || wizard_fail config_write_failed
		shift 2
	done
	wizard_other_config "$original" "$permitted" > "$work/other-before" &&
		wizard_other_config "$candidate" "$permitted" > "$work/other-after" &&
		cmp -s "$work/other-before" "$work/other-after" || wizard_fail pending_config_changes
}

wizard_apply_config() {
	local original="$work/original/51ddns" candidate="$work/config/51ddns"
	wizard_prepare_config "$@"
	# Stage on the same filesystem. The original package and all pending deltas remain untouched until rename.
	wizard_replace_config "$candidate" "$original" || wizard_fail pending_config_changes
	exec 8<&-
	if ! /etc/init.d/51ddns-agent restart >/dev/null 2>&1; then
		# A competing edit takes precedence over restoring this request's snapshot.
		exec 8< "$wizard_config" || wizard_fail agent_restart_failed
		if flock -n 8 && wizard_replace_config "$original" "$candidate"; then
			exec 8<&-
			/etc/init.d/51ddns-agent restart >/dev/null 2>&1 || :
		fi
		wizard_fail agent_restart_failed
	fi
}

wizard_service() { /etc/init.d/51ddns-agent "$1" >/dev/null 2>&1; }
wizard_running() { pidof 51ddns-agent >/dev/null 2>&1; }

wizard_wait_agent() {
	local wanted="$1" i=0
	while [ "$i" -lt 12 ]; do
		if wizard_running; then
			[ "$wanted" != running ] || return 0
		else
			[ "$wanted" != stopped ] || return 0
		fi
		i=$((i + 1))
		sleep 1
	done
	return 1
}

wizard_restore_device_file() {
	local name="$1" stage
	stage="$(mktemp "$wizard_identity/.wizard-restore-XXXXXX")" || return 1
	if cp -p "$work/saved-$name" "$stage" && mv -f "$stage" "$wizard_identity/device.$name"; then
		return 0
	fi
	rm -f "$stage"
	return 1
}

wizard_restore_replacement() {
	local current saved
	wizard_pending_clean || return 1
	if cmp -s "$wizard_config" "$candidate"; then
		current="$candidate"
	elif cmp -s "$wizard_config" "$bridge"; then
		current="$bridge"
	elif cmp -s "$wizard_config" "$original"; then
		current="$original"
	else
		return 1
	fi
	[ ! -L "$wizard_identity/device.id" ] && [ ! -L "$wizard_identity/device.token" ] || return 1
	if [ -e "$wizard_identity/device.id" ]; then
		saved="$(cat "$wizard_identity/device.id")" || return 1
		[ "$saved" = "$device" ] || cmp -s "$wizard_identity/device.id" "$work/saved-id" || return 1
	fi
	if [ -e "$wizard_identity/device.token" ]; then
		saved="$(cat "$wizard_identity/device.token")" || return 1
		[ "$saved" = "$token" ] || cmp -s "$wizard_identity/device.token" "$work/saved-token" || return 1
	fi
	wizard_service stop && wizard_wait_agent stopped &&
		rm -f "$wizard_identity/device.id" && sync || return 1
	if [ "$current" != "$bridge" ]; then
		wizard_replace_config "$bridge" "$current" && sync || return 1
	fi
	wizard_restore_device_file token && wizard_restore_device_file id && sync || return 1
	if ! cmp -s "$original" "$bridge"; then
		wizard_replace_config "$original" "$bridge" && sync || return 1
	fi
	[ "$was_running" = 0 ] || { wizard_service start && wizard_wait_agent running; }
}

wizard_apply_replacement() {
	local device="$1" token="$2" from="$3" configured previous was_running=0
	local original="$work/original/51ddns" candidate="$work/config/51ddns" bridge="$work/bridge/51ddns"
	wizard_match_identity "$from"
	[ "$status_identity_state" = saved ] && [ "$selected_device" = "$from" ] || wizard_fail device_mismatch
	[ -d "$wizard_identity" ] && [ ! -L "$wizard_identity" ] &&
		[ -f "$wizard_identity/device.token" ] && [ ! -L "$wizard_identity/device.token" ] ||
		wizard_fail device_not_ready
	previous="$(wizard_get account_token)"
	[ -n "$previous" ] && [ "$(cat "$wizard_identity/device.token")" = "$previous" ] || wizard_fail device_mismatch
	configured="$(wizard_get device_id)"
	wizard_prepare_config ' account_token device_id enabled router_web ' \
		account_token "$token" device_id "$device" enabled 1 router_web 0
	mkdir "$work/bridge" "$work/bridge-delta" &&
		cp -p "$original" "$bridge" &&
		cp -p "$wizard_identity/device.id" "$work/saved-id" &&
		cp -p "$wizard_identity/device.token" "$work/saved-token" || wizard_fail config_write_failed
	# Keep a committed, explicit device ID on both sides of the handover.
	# If power is lost with no saved ID, the stock Agent re-verifies the committed one.
	if [ -z "$configured" ]; then
		printf "set 51ddns.main.device_id='%s'\ncommit 51ddns\n" "$from" |
			uci -q -c "$work/bridge" -t "$work/bridge-delta" batch >/dev/null 2>&1 ||
			wizard_fail config_write_failed
	fi
	wizard_running && was_running=1
	if ! wizard_service stop || ! wizard_wait_agent stopped; then
		[ "$was_running" = 0 ] || wizard_service start || :
		wizard_fail agent_restart_failed
	fi
	if ! { wizard_replace_config "$bridge" "$original" && sync &&
		cmp -s "$wizard_identity/device.id" "$work/saved-id" &&
		cmp -s "$wizard_identity/device.token" "$work/saved-token" &&
		! wizard_running && rm -f "$wizard_identity/device.id" && sync &&
		wizard_replace_config "$candidate" "$bridge" && sync &&
		wizard_service start && wizard_wait_agent running &&
		[ "$(cat "$wizard_identity/device.id")" = "$device" ] &&
		[ "$(cat "$wizard_identity/device.token")" = "$token" ]; }; then
		wizard_restore_replacement || wizard_fail identity_restore_failed
		wizard_fail agent_restart_failed
	fi
	exec 8<&-
}

wizard_write() {
	local device token bound_installation from='' already_applied=0
	[ -f "$session/bound" ] || wizard_fail bind_required
	device="$(cat "$session/device-id")"
	valid_device_id "$device" || wizard_fail bind_required
	if [ -f "$session/written" ]; then
		[ "$(wizard_get device_id | tr 'A-F' 'a-f')" = "$device" ] && [ -n "$(wizard_get account_token)" ] || wizard_fail device_mismatch
		wizard_reply written device_id "$device"
		return
	fi
	wizard_own_file "$session/pending-token" || wizard_fail bind_required
	token="$(cat "$session/pending-token")"
	bound_installation="$(cat "$session/installation-id")"
	[ -f "$wizard_identity/install.id" ] && [ ! -L "$wizard_identity/install.id" ] &&
		[ "$bound_installation" = "$(cat "$wizard_identity/install.id")" ] || wizard_fail device_installation_mismatch
	if [ -e "$session/replace-from" ]; then
		wizard_own_file "$session/replace-from" && wizard_own_file "$session/replace-config" ||
			wizard_fail pending_config_changes
		from="$(cat "$session/replace-from")"
		valid_device_id "$from" && [ "$from" != "$device" ] || wizard_fail device_mismatch
		read_device_identity
		if [ "$status_identity_state" = saved ] && [ "$status_device_id" = "$device" ] &&
			[ "$(wizard_get device_id)" = "$device" ] && [ "$(wizard_get account_token)" = "$token" ] &&
			[ "$(wizard_get enabled)" = 1 ] && wizard_running; then
			already_applied=1
		else
			[ "$(cat "$session/replace-config")" = "$config_before" ] || wizard_fail pending_config_changes
		fi
	else
		wizard_match_identity "$device"
	fi
	/usr/bin/51ddns-agent verify-identity --device-id "$device" --control-api-url "$wizard_api" \
		< "$session/pending-token" >/dev/null 2>&1 || wizard_fail device_unavailable
	{
		printf "set 51ddns.main.account_token='%s'\nset 51ddns.main.device_id='%s'\nset 51ddns.main.enabled='1'\n" "$token" "$device"
		[ -z "$from" ] || printf "set 51ddns.main.router_web='0'\n"
		printf 'commit 51ddns\n'
	} > "$work/changes" || wizard_fail config_write_failed
	if [ "$already_applied" = 1 ]; then
		:
	elif [ -n "$from" ]; then
		wizard_apply_replacement "$device" "$token" "$from"
	else
		wizard_apply_config ' account_token device_id enabled ' account_token "$token" device_id "$device" enabled 1
	fi
	[ "$(wizard_get account_token)" = "$token" ] && [ "$(wizard_get device_id)" = "$device" ] &&
		[ "$(wizard_get enabled)" = 1 ] || wizard_fail config_write_failed
	: > "$session/written" && rm -f "$session/pending-token" || wizard_fail config_write_failed
	[ -z "$from" ] || wizard_clear_replacement
	wizard_reply written device_id "$device"
}

wizard_require_bound() {
	read_device_identity
	[ "$status_identity_state" = saved ] && [ -n "$(wizard_get account_token)" ] || wizard_fail device_not_ready
	wizard_match_identity "$status_device_id"
}

wizard_configure() {
	[ -f "$session/written" ] && wizard_own_file "$session/device-id" || wizard_fail bind_required
	wizard_require_bound
	[ "$(cat "$session/device-id")" = "$selected_device" ] || wizard_fail device_mismatch
	if [ "$(wizard_get router_web)" != 1 ]; then
		printf "set 51ddns.main.router_web='1'\ncommit 51ddns\n" > "$work/changes" || wizard_fail config_write_failed
		wizard_apply_config ' router_web ' router_web 1
		[ "$(wizard_get router_web)" = 1 ] || wizard_fail config_write_failed
	fi
	wizard_reply configured
}

wizard_settings() {
	local enabled router_web target permitted=' '
	enabled="$(wizard_field "$work/request" '@.enabled')"
	router_web="$(wizard_field "$work/request" '@.router_web')"
	target="$(wizard_field "$work/request" '@.router_web_target')"
	case "$enabled" in '' | 0 | 1) ;; *) wizard_fail invalid_request ;; esac
	case "$router_web" in '' | 0 | 1) ;; *) wizard_fail invalid_request ;; esac
	[ -n "$enabled$router_web" ] || wizard_fail invalid_request
	[ -n "$router_web" ] || [ -z "$target" ] || wizard_fail invalid_request
	valid_router_web_target "$target" || wizard_fail invalid_request
	[ "$router_web" != 1 ] || wizard_require_bound
	set --
	{
		if [ -n "$enabled" ]; then
			printf "set 51ddns.main.enabled='%s'\n" "$enabled"
			permitted="${permitted}enabled "
			set -- "$@" enabled "$enabled"
		fi
		if [ -n "$router_web" ]; then
			printf "set 51ddns.main.router_web='%s'\nset 51ddns.main.router_web_target='%s'\n" "$router_web" "$target"
			permitted="${permitted}router_web router_web_target "
			set -- "$@" router_web "$router_web" router_web_target "$target"
		fi
		printf '%s\n' 'commit 51ddns'
	} > "$work/changes" || wizard_fail config_write_failed
	wizard_apply_config "$permitted" "$@"
	[ -z "$enabled" ] || [ "$(wizard_get enabled)" = "$enabled" ] || wizard_fail config_write_failed
	if [ -n "$router_web" ]; then
		[ "$(wizard_get router_web)" = "$router_web" ] && [ "$(wizard_get router_web_target)" = "$target" ] || wizard_fail config_write_failed
	fi
	wizard_reply saved
}

wizard_call() (
	umask 077
	export LC_ALL=C
	local action handle session session_email work='' install_stage='' config_stage='' config_before
	if [ ! -e "$wizard_root" ] && [ ! -L "$wizard_root" ]; then
		mkdir -m 700 "$wizard_root" 2> /dev/null || :
	fi
	wizard_own_dir "$wizard_root" || wizard_fail config_write_failed
	work="$(mktemp -d "$wizard_root/request-XXXXXX")" || wizard_fail config_write_failed
	trap 'rm -rf "$work"; [ -z "$install_stage" ] || rm -f "$install_stage"; [ -z "$config_stage" ] || rm -f "$config_stage"' EXIT
	trap 'exit 1' HUP INT TERM
	head -c 16385 > "$work/request" || wizard_fail invalid_request
	[ "$(wc -c < "$work/request")" -le 16384 ] || wizard_fail invalid_request
	: > "$work/empty"
	action="${1:-$(wizard_field "$work/request" '@.action')}"
	if [ "$action" = catalog ]; then
		wizard_catalog
		return
	fi
	exec 9> "$wizard_root/lock" || wizard_fail busy
	flock -n 9 || wizard_fail busy
	wizard_session_gc
	case "$action" in
	register | login | plans | bind | replace | write)
		case "$(wizard_get control_url)" in '' | "$wizard_api" | "$wizard_api/") ;; *) wizard_fail unsupported_control_url ;; esac
		;;
	esac
	case "$action" in
	register | login) wizard_auth "$action"; return ;;
	resume)
		handle="$(wizard_field "$work/request" '@.handle')"
		case "$handle" in *[!0-9a-f]*) wizard_reply signed_out; return ;; esac
		[ "${#handle}" -eq 32 ] || { wizard_reply signed_out; return; }
		session="$wizard_root/session-$handle"
		if ! wizard_session_alive "$session" || ! wizard_session_matches_rpc; then
			wizard_reply signed_out
			return
		fi
		case "$(wizard_get control_url)" in '' | "$wizard_api" | "$wizard_api/") ;; *) wizard_fail unsupported_control_url ;; esac
		wizard_resume
		return
		;;
	plans | bind | replace | write | configure | logout)
		handle="$(wizard_field "$work/request" '@.handle')"
		case "$handle" in *[!0-9a-f]*) wizard_fail invalid_request ;; esac
		[ "${#handle}" -eq 32 ] || wizard_fail invalid_request
		session="$wizard_root/session-$handle"
		if [ -e "$session/luci-session" ] || [ -L "$session/luci-session" ]; then
			wizard_session_matches_rpc || wizard_fail session_expired
		fi
		if [ "$action" = logout ]; then
			if wizard_session_alive "$session"; then
				wizard_cloud logout "$work/empty" "$session/cookie" '' || :
				wizard_session_remove "$session" >/dev/null 2>&1 || wizard_fail config_write_failed
			fi
			wizard_reply signed_out
			return
		fi
		wizard_session_alive "$session" || wizard_fail session_expired
		if [ "$action" = plans ]; then wizard_plans; return; fi
		;;
	settings) ;;
	*) wizard_fail invalid_request ;;
	esac
	[ -f "$wizard_config" ] && [ ! -L "$wizard_config" ] && wizard_pending_clean || wizard_fail pending_config_changes
	case "$action" in
	write | configure) wizard_verify_session || wizard_fail session_expired ;;
	esac
	config_before="$(sha256sum "$wizard_config" | cut -d ' ' -f 1)"
	case "$action" in
	bind | replace) wizard_bind ;;
	write) wizard_write ;;
	configure) wizard_configure ;;
	settings) wizard_settings ;;
	esac
)
