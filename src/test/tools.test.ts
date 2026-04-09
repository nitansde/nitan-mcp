import test from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Logger } from '../util/logger.js';
import { registerAllTools } from '../tools/registry.js';
import { SiteState } from '../site/state.js';
import { registerListNotifications } from '../tools/builtin/list_notifications.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createSiteState() {
  const logger = new Logger('silent');
  return new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });
}

function expectSearchOutput(text: string) {
  assert.match(text, /hello-world/);
  assert.match(text, /Hello World/);
}

test('registers built-in tools', async () => {
  const logger = new Logger('silent');
  const siteState = createSiteState();
  const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: { listChanged: false } } });
  await registerAllTools(server as any, siteState, logger, { toolsMode: 'discourse_api_only' });
  assert.ok(true);
});

function expectedRegisteredToolNames(hideSelectSite = false) {
  const names = [
    'discourse_search',
    'discourse_read_topic',
    'discourse_get_user_activity',
    'discourse_list_hot_topics',
    'discourse_list_notifications',
    'discourse_list_top_topics',
    'discourse_list_excellent_topics',
    'discourse_list_funny_topics',
  ];

  return hideSelectSite ? names : ['discourse_select_site', ...names];
}

test('built-in tool set contains only read operations', async () => {
  const logger = new Logger('silent');
  const siteState = createSiteState();
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = { registerTool(name: string, _meta: any, handler: Function) { tools[name] = { handler }; } };
  await registerAllTools(fakeServer, siteState, logger, { toolsMode: 'discourse_api_only' } as any);
  assert.deepEqual(Object.keys(tools).sort(), expectedRegisteredToolNames(false).sort());
});

async function readFixture(name: string) {
  const p = path.resolve(__dirname, '../../fixtures/try', name);
  try {
    const data = await readFile(p, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

test('fixtures manifest exists or sync script can be run', async () => {
  const manifest = await readFixture('manifest.json');
  assert.ok(manifest === null || typeof manifest === 'object');
});

test('select-site then search flow works with mocked HTTP', async () => {
  const logger = new Logger('silent');
  const siteState = createSiteState();
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = { registerTool(name: string, _meta: any, handler: Function) { tools[name] = { handler }; } };
    await registerAllTools(fakeServer, siteState, logger, { toolsMode: 'discourse_api_only' });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/about.json')) return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/search.json')) return new Response(JSON.stringify({ topics: [{ id: 123, title: 'Hello World', slug: 'hello-world' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const selectRes = await tools['discourse_select_site'].handler({ site: 'https://example.com' }, {});
    assert.equal(selectRes?.isError, undefined);
    const searchRes = await tools['discourse_search'].handler({ query: 'hello' }, {});
    const text = String(searchRes?.content?.[0]?.text || '');
    expectSearchOutput(text);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('tethered mode hides select_site and allows search without selection', async () => {
  const logger = new Logger('silent');
  const siteState = createSiteState();
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = { registerTool(name: string, _meta: any, handler: Function) { tools[name] = { handler }; } };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/about.json')) return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/search.json')) return new Response(JSON.stringify({ topics: [{ id: 123, title: 'Hello World', slug: 'hello-world' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);
    await registerAllTools(fakeServer, siteState, logger, { toolsMode: 'discourse_api_only', hideSelectSite: true } as any);
    assert.ok(!('discourse_select_site' in tools));
    const searchRes = await tools['discourse_search'].handler({ query: 'hello' }, {});
    const text = String(searchRes?.content?.[0]?.text || '');
    expectSearchOutput(text);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('default-search prefix is applied to queries', async () => {
  const logger = new Logger('silent');
  const siteState = createSiteState();
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = { registerTool(name: string, _meta: any, handler: Function) { tools[name] = { handler }; } };

  let lastUrl: string | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    lastUrl = url;
    if (url.endsWith('/about.json')) return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/search.json')) return new Response(JSON.stringify({ topics: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);
    await registerAllTools(fakeServer, siteState, logger, { toolsMode: 'discourse_api_only', defaultSearchPrefix: 'tag:ai order:latest-post' } as any);
    await tools['discourse_search'].handler({ query: 'hello world' }, {});
    assert.ok(lastUrl && lastUrl.includes('/search.json?'));
    const qs = lastUrl!.split('?')[1] || '';
    const params = new URLSearchParams(qs);
    assert.equal(params.get('expanded'), 'true');
    assert.equal(params.get('q'), 'tag:ai order:latest-post hello world');
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('notifications tool reports Cloudflare challenge instead of not logged in', async () => {
  const logger = new Logger('silent');
  const fakeServerTools: Record<string, { handler: Function }> = {};
  const fakeServer: any = {
    registerTool(name: string, _meta: any, handler: Function) {
      fakeServerTools[name] = { handler };
    },
  };
  const fakeSiteState: any = {
    ensureSelectedSite() {
      return {
        base: 'https://www.uscardforum.com',
        client: {
          async get() {
            throw {
              status: 403,
              message: 'HTTP 403 Forbidden',
              body: '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>Cloudflare challenge</body></html>',
            };
          },
        },
      };
    },
  };

  registerListNotifications(fakeServer, { siteState: fakeSiteState, maxReadLength: 50000 } as any, { toolsMode: 'discourse_api_only' });

  const result = await fakeServerTools['discourse_list_notifications'].handler({ limit: 5, unread_only: false }, {});
  const text = String(result?.content?.[0]?.text || '');

  assert.equal(result?.isError, true);
  assert.match(text, /Cloudflare challenge blocked the request/);
  assert.doesNotMatch(text, /User is not logged in/);
});
