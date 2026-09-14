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
