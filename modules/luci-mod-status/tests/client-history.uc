// Run with ucode after installing luci.client_history on the test target.
import { arp_leases, update_history } from 'luci.client_history';
function check(value, message) {
	if (!value) die(message + '\n');
};
const arp = '192.168.0.2 0x1 0x2 aa:bb:cc:dd:ee:ff * br-lan\n' +
	'192.168.0.3 0x1 0x0 00:11:22:33:44:66 * br-lan\n' +
	'192.168.9.1 0x1 0x2 00:11:22:33:44:77 * eth1\n';
let first = update_history({}, {
	dhcp_leases: arp_leases(arp),
	dhcp6_leases: [{ macaddr: 'aa:bb:cc:dd:ee:ff', duid: 'uuid', iaid: '1', ip6addrs: ['2001:db8::2/128'] }]
}, 'boot-a');
check(length(first.dhcp_leases) == 1, 'filter non-LAN and unresolved ARP');
let absent = update_history(first, {}, 'boot-a');
check(length(absent.dhcp_leases) == 1 && length(absent.dhcp6_leases) == 1, 'retain expired DHCP and ARP');
let restored = update_history(json(sprintf('%J', absent)), {}, 'boot-a');
check(sprintf('%J', restored) == sprintf('%J', absent), 'restore after collector restart');
let updated = update_history(restored, {
	dhcp_leases: [{ macaddr: '00:11:22:33:44:66', ipaddr: '192.168.0.2', interface: 'br-lan' }],
	dhcp6_leases: [{ macaddr: 'AA:BB:CC:DD:EE:FF', duid: 'uuid', iaid: '1', ip6addrs: ['2001:db8::3/128'] }]
}, 'boot-a');
check(length(updated.dhcp_leases) == 2, 'preserve former owner after address reuse');
check(length(updated.dhcp6_leases) == 1 && length(updated.dhcp6_leases[0].ip6addrs) == 2, 'retain IPv6 address changes');
let repeat = update_history(updated, { dhcp_leases: arp_leases(arp) }, 'boot-a');
check(length(repeat.dhcp_leases) == 2, 'deduplicate repeated discoveries');
let rebooted = update_history(updated, {}, 'boot-b');
check(!length(rebooted.dhcp_leases) && !length(rebooted.dhcp6_leases), 'new boot resets history');
check(!length(update_history('invalid', {}, 'boot-a').dhcp_leases), 'recover invalid state');
print('client history: LAN filtering, expiry, restart, reassignment, IPv6 changes and boot reset passed\n');
