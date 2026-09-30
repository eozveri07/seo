import {
  isBlockedIpAddress,
  isBlockedWebhookHostname,
} from './webhook-address-guard';

describe('isBlockedIpAddress', () => {
  it.each([
    ['loopback', '127.0.0.1'],
    ['loopback (aralık sonu)', '127.255.255.254'],
    ['IPv6 loopback', '::1'],
    ['link-local', '169.254.169.254'],
    ['IPv6 link-local', 'fe80::abcd'],
    ['unspecified', '0.0.0.0'],
    ['IPv6 unspecified', '::'],
    ['RFC1918 10/8', '10.255.0.1'],
    ['RFC1918 172.16/12 başı', '172.16.0.1'],
    ['RFC1918 172.16/12 sonu', '172.31.255.255'],
    ['RFC1918 192.168/16', '192.168.0.1'],
    ['CGNAT', '100.64.0.1'],
    ['CGNAT sonu', '100.127.255.255'],
    ['IPv6 unique-local fc00', 'fc00::1'],
    ['IPv6 unique-local fd00', 'fd00::1'],
    ['IPv4-mapped loopback', '::ffff:127.0.0.1'],
    ['IPv4-mapped hex', '::ffff:a9fe:a9fe'],
    ['IPv4-mapped RFC1918', '::ffff:192.168.1.1'],
    ['köşeli parantezli IPv6', '[::1]'],
  ])('%s (%s) engellenir', (_label, address) => {
    expect(isBlockedIpAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '162.159.128.233',
    '172.32.0.1',
    '100.128.0.1',
    '2606:4700::6810:84e5',
    '::ffff:8.8.8.8',
    'discord.com',
  ])('%s engellenmez', (address) => {
    expect(isBlockedIpAddress(address)).toBe(false);
  });
});

describe('isBlockedWebhookHostname', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    'localhost.',
    'api.localhost',
    '10.0.0.5',
  ])('%s engellenir', (host) => {
    expect(isBlockedWebhookHostname(host)).toBe(true);
  });

  it.each(['discord.com', 'hooks.slack.com', 'localhost.example.com'])(
    '%s engellenmez',
    (host) => {
      expect(isBlockedWebhookHostname(host)).toBe(false);
    },
  );
});
