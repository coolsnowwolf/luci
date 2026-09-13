/* SPDX-License-Identifier: Apache-2.0 */
#include <assert.h>
#include "../src/webprobe.c"

void rpc_luci_dhcp4_clients(void (*add)(const struct in_addr *, const unsigned char *)) {}

static struct web_client *add(const char *ip, const unsigned char *mac)
{
	struct in_addr address;
	struct web_client *client;
	assert(inet_pton(AF_INET, ip, &address) == 1);
	web_add_client(&address, mac);
	return avl_find_element(&web_clients, &address, client, avl);
}

int main(void)
{
	unsigned char mac[6] = {2, 1, 2, 3, 4, 5}, other[6] = {2, 6, 7, 8, 9, 10};
	uloop_init();
	avl_init(&web_clients, web_compare, false, NULL);
	for (int i = 0; i < WEB_CONCURRENCY; i++) web_jobs[i].fd.fd = -1;
	web_pump.cb = web_run;
	web_inventory.cb = web_refresh;
	assert(!add("127.0.0.1", mac));
	assert(!add("0.0.0.0", mac));
	assert(!add("224.0.0.1", mac));
	struct web_client *c = add("192.0.2.1", mac);
	assert(c && web_clients.count == 1 && !c->ready);
	assert(add("192.0.2.1", mac) == c && web_clients.count == 1);
	/* Publish only a complete round, with exact port-to-bit correspondence. */
	c->scanning = true;
	c->next_port = c->pending = WEB_PORT_COUNT;
	for (int i = 0; i < WEB_PORT_COUNT; i++) {
		web_jobs[0].client = c;
		web_jobs[0].port = i;
		web_finish(&web_jobs[0], i == 0 || i == 5);
		assert(c->ready == (i == WEB_PORT_COUNT - 1));
	}
	assert(c->open_ports == 33 && c->next_scan > web_now());
	/* Refresh failure must remove links which succeeded in a previous round. */
	c->scanning = true; c->checking = 0; c->pending = 1;
	web_jobs[0].client = c;
	web_jobs[0].timeout.cb = web_timeout;
	web_timeout(&web_jobs[0].timeout);
	assert(c->open_ports == 0 && c->ready);
	/* IP reassignment invalidates cached results and closes pending sockets. */
	c->open_ports = 15;
	web_jobs[0].client = c;
	web_jobs[0].fd.fd = socket(AF_INET, SOCK_STREAM, 0);
	int fd = web_jobs[0].fd.fd;
	add("192.0.2.1", other);
	assert(!c->ready && !c->open_ports && !web_jobs[0].client);
	assert(close(fd) == -1 && errno == EBADF);
	/* A lease disappearing removes its cached entry and pending jobs. */
	web_refresh(&web_inventory);
	assert(!web_clients.count);
	uloop_timeout_cancel(&web_inventory);
	uloop_timeout_cancel(&web_pump);
	uloop_done();
	puts("webprobe: bounded targets, round publication, timeout, IP reassignment and lease removal passed");
	return 0;
}
