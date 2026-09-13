# DHCP client web links

The `luci.client-web get` RPC returns cached TCP reachability for current DHCPv4
leases, keyed by IPv4 address and tagged with the client's MAC. It accepts no
scan targets or ports from the caller. No scanning is triggered by reading it.

The collector starts five seconds after rpcd loads, refreshes the lease inventory
every 30 seconds, and checks each client again five minutes after its previous
round completes. At most two nonblocking TCP connects run concurrently, with
a 750 ms timeout each and a 250 ms delay between queue refills. Idle queues
sleep until the next scheduled probe. Earliest-due clients are scheduled first so large lease
lists cannot starve later addresses. The cache holds at most 1024 clients, is
kept in memory only, and is cleared on lease removal or MAC reassignment. Results
are published after the entire round completes; links from unsuccessful rounds
are removed and results older than ten minutes are not exposed as open ports.

The frontend uses exactly one link, in this order:

- HTTP: 80, 8080, 5666
- HTTPS: 443, 4430, 5667

Default ports are omitted from URLs. Links display only the underlined IP address, with the full URL in the link target
and open in a new tab with `noopener noreferrer`. Unknown or unavailable clients
remain plain text. Results with a different MAC from the displayed lease are
ignored. The regular overview refresh reads the cache without blocking on scans.

An open TCP port is a reachability result, not an HTTP response or TLS certificate
validation. The protocol is selected by the fixed port mapping above. No HTTP
requests or TLS handshakes are sent by the scanner.

Compile `webprobe.c` as a standalone target-native test with the staging headers
and libraries (`-lubus -lubox`). It covers target validation, deduplication,
complete-round publication, timeout results, MAC changes and lease removal.
`traffic-ui.js` also checks URL priority, schemes, ports and stale-MAC rejection.
On a live router, compare the cached port list with TCP reachability and verify
the single rendered IP link, URL, target and continued status polling.
