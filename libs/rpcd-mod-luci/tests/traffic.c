/* SPDX-License-Identifier: Apache-2.0 */
#include <assert.h>
#include "../src/traffic.c"

static void put(struct nlmsghdr *msg, int type, const void *data, size_t len)
{
	struct nlattr *a = (void *)((char *)msg + NLMSG_ALIGN(msg->nlmsg_len));
	a->nla_type = type;
	a->nla_len = NLA_HDRLEN + len;
	memcpy((char *)a + NLA_HDRLEN, data, len);
	msg->nlmsg_len = NLMSG_ALIGN(msg->nlmsg_len) + NLA_ALIGN(a->nla_len);
}

static struct nlattr *begin(struct nlmsghdr *msg, int type)
{
	struct nlattr *a = (void *)((char *)msg + NLMSG_ALIGN(msg->nlmsg_len));
	a->nla_type = type | NLA_F_NESTED;
	a->nla_len = NLA_HDRLEN;
	msg->nlmsg_len += NLA_HDRLEN;
	return a;
}

static void end(struct nlmsghdr *msg, struct nlattr *a)
{
	a->nla_len = (char *)msg + msg->nlmsg_len - (char *)a;
}

static void tuple(struct nlmsghdr *msg, int type, const char *src, const char *dst)
{
	struct address a;
	struct nlattr *t = begin(msg, type), *ip = begin(msg, CTA_TUPLE_IP);
	parse_address(src, &a);
	put(msg, a.family == AF_INET ? CTA_IP_V4_SRC : CTA_IP_V6_SRC, a.bytes, a.family == AF_INET ? 4 : 16);
	parse_address(dst, &a);
	put(msg, a.family == AF_INET ? CTA_IP_V4_DST : CTA_IP_V6_DST, a.bytes, a.family == AF_INET ? 4 : 16);
	end(msg, ip);
	struct nlattr *proto = begin(msg, CTA_TUPLE_PROTO);
	uint8_t num = 6;
	uint16_t port = htons(1234);
	put(msg, CTA_PROTO_NUM, &num, 1);
	put(msg, CTA_PROTO_SRC_PORT, &port, 2);
	put(msg, CTA_PROTO_DST_PORT, &port, 2);
	end(msg, proto);
	end(msg, t);
}

static void counters(struct nlmsghdr *msg, int type, uint64_t bytes)
{
	unsigned char b[8];
	for (int i = 7; i >= 0; i--) { b[i] = bytes & 255; bytes >>= 8; }
	struct nlattr *a = begin(msg, type);
	put(msg, CTA_COUNTERS_BYTES, b, 8);
	end(msg, a);
}

static void feed(int family, const char *src, const char *dst, const char *reply_src,
                 uint32_t id, uint64_t up, uint64_t down, bool dead)
{
	char buffer[2048] = {0};
	struct nlmsghdr *msg = (void *)buffer;
	struct nfgenmsg *nf = NLMSG_DATA(msg);
	msg->nlmsg_len = NLMSG_LENGTH(sizeof(*nf));
	msg->nlmsg_type = (NFNL_SUBSYS_CTNETLINK << 8) | (dead ? IPCTNL_MSG_CT_DELETE : IPCTNL_MSG_CT_NEW);
	nf->nfgen_family = family;
	tuple(msg, CTA_TUPLE_ORIG, src, dst);
	tuple(msg, CTA_TUPLE_REPLY, reply_src, src);
	put(msg, CTA_ID, &id, 4);
	counters(msg, CTA_COUNTERS_ORIG, up);
	counters(msg, CTA_COUNTERS_REPLY, down);
	assert(process_flow(msg));
}

static struct client *client(const char *ip)
{
	struct client *c = calloc(1, sizeof(*c));
	assert(parse_address(ip, &c->address));
	c->avl.key = &c->address;
	avl_insert(&clients, &c->avl);
	return c;
}

int main(void)
{
	avl_init(&clients, address_cmp, false, NULL);
	avl_init(&flows, flow_cmp, false, NULL);
	struct client *a = client("192.168.0.100"), *b = client("192.168.0.101"), *v6 = client("fd00::2");
	feed(AF_INET, "192.168.0.100", "8.8.8.8", "8.8.8.8", 1, 1000, 2000, false);
	assert(a->bytes[0] == 0 && a->bytes[1] == 0); /* First sample is a baseline. */
	finish_dump();
	assert(a->warm && !a->ready);
	generation++;
	feed(AF_INET, "192.168.0.100", "8.8.8.8", "8.8.8.8", 1, 3000, 7000, false);
	assert(a->bytes[0] == 2000 && a->bytes[1] == 5000);
	/* DNAT: original packets are downloads to reply.src, replies are uploads. */
	feed(AF_INET, "8.8.4.4", "203.0.113.1", "192.168.0.101", 2, 10000, 100, false);
	assert(b->bytes[0] == 100 && b->bytes[1] == 10000);
	feed(AF_INET6, "fd00::2", "2001:db8::1", "2001:db8::1", 3, 500, 1000, false);
	assert(v6->bytes[0] == 500 && v6->bytes[1] == 1000);
	/* Destroy notifications include the final bytes of short-lived flows. */
	feed(AF_INET, "192.168.0.100", "1.1.1.1", "1.1.1.1", 4, 80, 200, true);
	assert(a->bytes[0] == 2080 && a->bytes[1] == 5200);
	feed(AF_INET, "192.168.0.100", "1.1.1.1", "1.1.1.1", 4, 80, 200, false);
	assert(a->bytes[0] == 2080 && a->bytes[1] == 5200); /* Late dump after destroy. */
	feed(AF_INET, "192.168.0.100", "8.8.8.8", "8.8.8.8", 1, 20, 30, false);
	assert(a->bytes[0] == 2080 && a->bytes[1] == 5200); /* Reset cannot underflow. */
	sampled = now_ms() - 2000;
	finish_dump();
	assert(a->ready && a->rate[0] >= 1035 && a->rate[0] <= 1040);
	assert(a->rate[1] >= 2590 && a->rate[1] <= 2600);
	/* A burst must stay in the rolling window, even across two quiet samples. */
	struct client rolling = { .ready = true, .bytes = {6000, 12000} };
	update_rate(&rolling, 2000);
	assert(rolling.rate[0] == 3000 && rolling.rate[1] == 6000);
	update_rate(&rolling, 2000);
	update_rate(&rolling, 2000);
	assert(rolling.rate[0] == 1000 && rolling.rate[1] == 2000);
	update_rate(&rolling, 2000);
	assert(rolling.rate[0] == 0 && rolling.rate[1] == 0);
	/* Unequal intervals use sum(bytes) / sum(time), not mean(rate). */
	rolling.bytes[0] = 12000;
	update_rate(&rolling, 4000);
	assert(rolling.rate[0] == 1500);
	rolling.ready = false;
	update_rate(&rolling, 2000);
	assert(rolling.rate[0] == 0 && rolling.duration[0] == 0);
	rolling.ready = true;
	rolling.bytes[0] = 2000;
	update_rate(&rolling, 2000);
	assert(rolling.rate[0] == 1000);

	reset_sampler("test_overrun");
	assert(!a->ready && !a->warm && flows.count == 0);
	last_request = now_ms() - IDLE_MS - 1;
	sample_timer(&timer);
	assert(ct_fd.fd == -1 && clients.count == 0 && flows.count == 0);
	puts("traffic: NAT, IPv6, baseline, short flows, reset, rolling window and rate checks passed");
	return 0;
}
