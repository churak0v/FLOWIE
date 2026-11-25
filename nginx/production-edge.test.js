import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('./production-edge.conf.template', import.meta.url), 'utf8');

function blocks(source, directive) {
  const result = [];
  const pattern = new RegExp(`^\\s*${directive}(?=\\s|\\{)\\s*[^;{]*\\{`, 'gm');
  for (const match of source.matchAll(pattern)) {
    const open = source.indexOf('{', match.index);
    let depth = 1;
    let end = open + 1;
    while (depth && end < source.length) {
      if (source[end] === '{') depth += 1;
      if (source[end] === '}') depth -= 1;
      end += 1;
    }
    assert.equal(depth, 0, `unclosed ${directive} block`);
    result.push(source.slice(match.index, end));
  }
  return result;
}

function directiveValue(source, directive) {
  return source.match(new RegExp(`\\b${directive}\\s+([^;]+);`))?.[1]?.trim() || null;
}

test('every virtual server uses Docker runtime DNS and the same upstream variables', () => {
  const servers = blocks(config, 'server');
  assert.equal(servers.length, 3);

  for (const server of servers) {
    assert.equal(directiveValue(server, 'resolver'), '127.0.0.11 ipv6=off valid=1s');
    assert.match(server, /set \$flowie_api_host api:3001;/);
    assert.match(server, /set \$flowie_web_host web:8080;/);
    assert.match(server, /set \$flowie_admin_host admin:8080;/);
  }
});

test('proxy route snapshot preserves each upstream boundary', () => {
  const snapshot = blocks(config, 'server').map((server) => ({
    serverName: directiveValue(server, 'server_name'),
    routes: blocks(server, 'location').map((location) => ({
      location: location.match(/\blocation\s+([^\{]+)\{/)?.[1]?.trim(),
      upstream: directiveValue(location, 'proxy_pass'),
    })).filter((route) => route.upstream),
  }));

  assert.deepEqual(snapshot, [
    { serverName: '${FLOWIE_DOMAIN} ${FLOWIE_ADMIN_DOMAIN}', routes: [] },
    {
      serverName: '${FLOWIE_DOMAIN}',
      routes: [
        { location: '/api/socket.io/', upstream: 'http://$flowie_api_host' },
        { location: '/api/', upstream: 'http://$flowie_api_host' },
        { location: '/uploads/', upstream: 'http://$flowie_api_host' },
        { location: '= /', upstream: 'http://$flowie_api_host' },
        { location: '= /mothers-day', upstream: 'http://$flowie_api_host' },
        { location: '= /care', upstream: 'http://$flowie_api_host' },
        { location: '= /catalog', upstream: 'http://$flowie_api_host' },
        { location: '= /shop', upstream: 'http://$flowie_api_host' },
        { location: '^~ /product/', upstream: 'http://$flowie_api_host' },
        { location: '= /llms.txt', upstream: 'http://$flowie_api_host' },
        { location: '= /robots.txt', upstream: 'http://$flowie_api_host' },
        { location: '= /sitemap.xml', upstream: 'http://$flowie_api_host' },
        { location: '/', upstream: 'http://$flowie_web_host' },
      ],
    },
    {
      serverName: '${FLOWIE_ADMIN_DOMAIN}',
      routes: [
        { location: '/api/socket.io/', upstream: 'http://$flowie_api_host' },
        { location: '/api/', upstream: 'http://$flowie_api_host' },
        { location: '/uploads/', upstream: 'http://$flowie_api_host' },
        { location: '/', upstream: 'http://$flowie_admin_host' },
      ],
    },
  ]);
  assert.doesNotMatch(config, /proxy_pass http:\/\/(?:api:3001|web:8080|admin:8080)/);
});
