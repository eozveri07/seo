import { BlockList, isIP } from 'node:net';

/**
 * Webhook isteklerinin gidemeyeceği dahili/özel adres aralıkları (SSRF
 * koruması). `BlockList`, IPv4 aralıklarını IPv4-mapped IPv6 biçimleri
 * (`::ffff:127.0.0.1`, `::ffff:7f00:1`) için de eşleştirir.
 */
const blockedAddresses = new BlockList();
// IPv4: "this network" (0.0.0.0 dahil), loopback, RFC1918, CGNAT, link-local.
blockedAddresses.addSubnet('0.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
blockedAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('100.64.0.0', 10, 'ipv4');
blockedAddresses.addSubnet('169.254.0.0', 16, 'ipv4');
// IPv6: unspecified, loopback, unique-local, link-local.
blockedAddresses.addAddress('::', 'ipv6');
blockedAddresses.addAddress('::1', 'ipv6');
blockedAddresses.addSubnet('fc00::', 7, 'ipv6');
blockedAddresses.addSubnet('fe80::', 10, 'ipv6');

/** `address` literal bir IP ise ve engelli aralıktaysa `true`. */
export function isBlockedIpAddress(address: string): boolean {
  const bare = stripBrackets(address);
  const family = isIP(bare);
  if (family === 0) return false;
  return blockedAddresses.check(bare, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * URL host'u `localhost` (ya da `*.localhost`) veya engelli aralıkta
 * literal bir IP ise `true`. DNS çözümlemesi yapmaz; bu kontrol
 * `WebhookClient` içinde gönderimden hemen önce yapılır.
 */
export function isBlockedWebhookHostname(hostname: string): boolean {
  const host = stripBrackets(hostname).toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  return isBlockedIpAddress(host);
}

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}
