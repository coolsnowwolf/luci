# Client connection rates

`luci.client-rates get` accepts up to 1024 IP addresses and returns cached upload
and download bytes/second for each address. It reads `NETLINK_NETFILTER` connection
counters; it never installs packet-filter rules or resets kernel counters.

On QSDK, ECM's NSS/SFE/PPE statistics synchronization updates these conntrack
counters. NSS IPv4/IPv6 synchronization is normally once per second. This code
samples at two-second intervals and computes a rolling average over the last
three valid samples (about six seconds), weighted by actual elapsed time. The
window grows gradually after the initial baseline; invalid samples clear it.
The homepage refreshes only the rate cells every two seconds, independently of
the slower lease/status polling. The reader closes
the netlink socket and frees its cache after 30 seconds without requests.

The first complete dump establishes a baseline. A second sample produces rates.
Original-source bytes are upload; reply-source bytes are download, including
DNAT. The reverse direction is assigned accordingly. Destroy notifications
capture final counters for short flows. A bounded per-flow cache prevents whole
connection lifetimes being counted again at every poll. Interrupted dumps,
receive overruns and limits invalidate the sample instead of fabricating a rate.

The accounting sysctl must already be enabled and conntrack netlink available.
The reader does not change these settings. Unsupported or warming-up values are
shown as `-`. Inactive supported clients show zero. This is routed/conntracked
traffic, not a physical port meter: pure layer-2 switched traffic and traffic
which never appears in conntrack are outside its scope. Proxies terminating on
the router are measured on their client-side connections. Bytes reflect IP
accounting, not Ethernet wire overhead. The DHCP table combines known addresses
for the same MAC, including IPv6 addresses from host hints, and normalizes them
to avoid duplicates. DUID/IAID remain in the lease objects for static reservations.

## Regression checks

Run `node tests/traffic-ui.js` from this package directory. It exercises address
normalization, IPv4/IPv6 aggregation, direction, sorting keys and warming-up UI.

Build `tests/traffic.c` with the OpenWrt target compiler, the staging include/lib
paths, and `-lubus -lubox`, then execute the binary on a compatible target. It
constructs real netlink attribute layouts for IPv4, IPv6, DNAT, counter resets,
short-lived flows, a delayed dump record after destroy, baseline/rate calculation
rolling-window expiry, unequal sampling intervals, invalid-window reset and idle cleanup. Test programs are not included in the installed package.

The integration check should compare conntrack byte deltas with ECM connection
statistics while the matching connection is accelerated, then check the real
homepage with traffic. Do not infer accelerated accounting solely from a package
build or a nonzero interface counter.
