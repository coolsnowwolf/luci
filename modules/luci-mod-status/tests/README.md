The overview combines DHCPv4, DHCPv6 and resolved `br-lan` ARP entries by MAC.
IPv6 leases without a MAC can join a client only when their addresses have an
unambiguous MAC mapping in host hints or another lease. Hostnames alone never
merge devices. DUID/IAID identify otherwise unknown lease records and preserve
IPv6 reservation actions.

`luci-client-history` samples leases and ARP every ten seconds without requiring
an open browser. It atomically checkpoints discovered records in
`/tmp/luci-client-history.json`. Records are retained after lease/ARP expiry and
collector/rpcd restarts; a new boot clears them. Collection starts when the
service is installed/enabled, so earlier expired records cannot be reconstructed.
Historical addresses are dimmed and excluded from live rates and reservation
buttons. Totals remain the existing per-MAC conntrack accounting totals.

Run `ucode client-history.uc` on a target with the installed
`luci.client_history` module. The tests cover LAN filtering, expiry, collector
restart, IP reassignment, changing IPv6 addresses and boot-ID reset without
rebooting the device. Run the existing frontend tests with
`node libs/rpcd-mod-luci/tests/traffic-ui.js` from the LuCI repository.

For unnamed clients in the resolved LAN ARP table, the collector attempts DNS
PTR lookup, then unicast NetBIOS NBSTAT (UDP 137) when DNS has no answer.
Positive and negative results are cached for five minutes, keyed by MAC and IP.
Each pass considers at most 32 due addresses; DNS and NetBIOS each have a
one-second batch wait budget. Names are retained with the boot-local history;
DHCP names take precedence. Devices without PTR or NetBIOS service keep their
existing label. No subnet-wide or broadcast scan is performed.

Run `ucode client-names.uc` with the installed `luci.client_history`,
`luci.client_names` and `ucode-mod-socket` modules. It checks positive/negative
caching, retry timing, address reuse, DHCP priority, boot reset and malformed
NBSTAT responses. For a live check, compare `netbios_names([ip])` with a known
NetBIOS responder; an unanswered query is not evidence of an offline client.

Channel analysis scans each band tab on first activation, using iwinfo for
mtwifi/mt_dbdc/ralink radios. It does not start a repeating scan poll or stop
LuCI's global poller. The refresh button is enabled immediately on completion or failure;
requests are coalesced per radio and serialized across radios. Run
`node modules/luci-mod-status/tests/channel-analysis.js` from the LuCI root.
