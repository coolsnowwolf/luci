import { reverse_names } from 'luci.client_history';
import { nbstat_name, netbios_names } from 'luci.client_names';
function check(v, message) { if (!v) die(message + '\n'); };
let calls = 0;
const mac = '00:0C:29:D2:60:68', ip = '192.168.0.104';
function active() { return [{macaddr:mac,ipaddr:ip}]; };
let leases = active();
let cache = reverse_names({}, {}, leases, 'boot', 10, function(ips) {
	calls++; return {[ip]:'lean-esx.lan.'};
});
check(leases[0].hostname == 'lean-esx.lan', 'PTR name normalized');
let previous = {boot_id:'boot',reverse_dns:cache};
leases = active();
reverse_names(previous, {}, leases, 'boot', 20, function() { die('cache missed'); });
check(leases[0].hostname == 'lean-esx.lan', 'cached hostname restored');
reverse_names(previous, {}, active(), 'boot', 310, function() { calls++; return {}; });
check(calls == 2, 'refresh after five minutes');
leases = [{macaddr:'00:11:22:33:44:55',ipaddr:ip}];
let miss = reverse_names(previous, {}, leases, 'boot', 20, function() {calls++; return {};});
check(!leases[0].hostname && calls == 3, 'address reuse does not inherit name');
reverse_names({boot_id:'boot',reverse_dns:miss}, {}, leases, 'boot', 21, function() {die('negative cache missed');});
reverse_names(previous, {dhcp_leases:[{macaddr:mac,hostname:'dhcp-name'}]}, active(), 'boot', 999, function() {die('queried named DHCP client');});
reverse_names(previous, {}, active(), 'reboot', 1, function() {calls++;return {};});
check(calls == 4, 'boot resets cache');
// RFC 1002 response: skip group name and prefer the workstation name.
const records = 'WORKGROUP      \x00' + chr(0x80) + '\x00' + 'LEAN-ESX       \x20\x00\x00' + 'LEAN-ESX       \x00\x00\x00';
const packet = '\x12\x34' + chr(0x84) + '\x00\x00\x00\x00\x01\x00\x00\x00\x00' +
	'\x20CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\x00' +
	'\x00\x21\x00\x01\x00\x00\x00\x00\x00\x37\x03' + records;
check(nbstat_name(packet,0x1234) == 'LEAN-ESX', 'NBSTAT hostname');
check(!nbstat_name(packet,0x5678), 'transaction mismatch');
for (let i=0;i<length(packet);i++)
	check(!nbstat_name(substr(packet,0,i),0x1234), 'truncated response accepted');
check(!nbstat_name('\x12\x34' + chr(0x84) + '\x00\x00\x00\x00\x01\x00\x00\x00\x00' + chr(0xc0) + '',0x1234), 'truncated pointer');
print('client names: cache, retry, ownership, DHCP priority, reboot and NBSTAT validation passed\n');
