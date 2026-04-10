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
    '美卡_搜索',
    'discourse_read_topic',
    '美卡_读帖',
    'discourse_get_user_activity',
    '美卡_用户动态',
    'discourse_list_hot_topics',
    '美卡_热帖',
    'discourse_list_notifications',
    '美卡_通知',
    'discourse_list_top_topics',
    '美卡_热榜',
    'discourse_list_excellent_topics',
    '美卡_精华',
    'discourse_list_funny_topics',
    '美卡_搞笑',
    'discourse_get_trust_level_progress',
    '美卡_等级进度',
  ];

  return hideSelectSite ? names : ['discourse_select_site', '美卡_选站', ...names];
}

test('site state prefers API auth over login credentials when both are configured', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({
    logger,
    timeoutMs: 5000,
    defaultAuth: { type: 'none' },
    authOverrides: [{
      site: 'https://example.com',
      user_api_key: 'demo-key',
      user_api_client_id: 'demo-client',
      username: 'demo-user',
      password: 'demo-pass',
    }],
  });

  try {
    const { client } = siteState.buildClientForSite('https://example.com');
    assert.deepEqual((client as any).opts.auth, { type: 'user_api_key', key: 'demo-key', client_id: 'demo-client' });
    assert.equal((client as any).opts.loginCredentials, undefined);
    assert.equal(siteState.hasAuthForSite('https://example.com'), true);
    assert.equal(siteState.hasLoginForSite('https://example.com'), true);
    assert.equal(siteState.hasAuthenticationConfiguredForSite('https://example.com'), true);
  } finally {
    await siteState.dispose();
  }
});

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
    hasAuthenticationConfiguredForSite() {
      return true;
    },
  };

  registerListNotifications(fakeServer, { siteState: fakeSiteState, maxReadLength: 50000 } as any, { toolsMode: 'discourse_api_only' });

  const result = await fakeServerTools['discourse_list_notifications'].handler({ limit: 5, unread_only: false }, {});
  const text = String(result?.content?.[0]?.text || '');

  assert.equal(result?.isError, true);
  assert.match(text, /Cloudflare challenge blocked the request/);
  assert.doesNotMatch(text, /User is not logged in/);
});

test('trust-level tool uses directory_items.json and reports TL3 progress from merged stats', async () => {
  const logger = new Logger('silent');
  const siteState = createSiteState();
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = { registerTool(name: string, _meta: any, handler: Function) { tools[name] = { handler }; } };

  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    requestedUrls.push(url);

    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse', stats: { posts_30_days: 1200, topics_30_days: 120 } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/u/uscreditcardguide/summary.json')) {
      return new Response(JSON.stringify({
        users: [{ trust_level: 1 }],
        user_summary: { likes_given: 12, likes_received: 8, posts_count: 9, topics_entered: 40, posts_read_count: 1200 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/directory_items.json?')) {
      return new Response(JSON.stringify({
        directory_items: [{
          user: { username: 'uscreditcardguide', trust_level: 2 },
          days_visited: 55,
          likes_given: 31,
          likes_received: 25,
          post_count: 14,
          topics_entered: 45,
          posts_read: 1400,
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);
    await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only', hideSelectSite: true } as any);

    const result = await tools['discourse_get_trust_level_progress'].handler({ username: 'uscreditcardguide' }, {});
    const text = String(result?.content?.[0]?.text || '');

    assert.match(text, /Current Trust Level: 2 \(Member\)/);
    assert.match(text, /Progress toward TL3/);
    assert.match(text, /Days Visited: 55 \/ 50/);
    assert.match(text, /Posts Read: 1400 \/ 300/);
    assert.ok(requestedUrls.some((url) => url.includes('/directory_items.json?period=quarterly&order=days_visited&name=uscreditcardguide')));
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('trust-level tool falls back to summary trust level when directory data is missing', async () => {
  const logger = new Logger('silent');
  const siteState = createSiteState();
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = { registerTool(name: string, _meta: any, handler: Function) { tools[name] = { handler }; } };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse', stats: { posts_30_days: 1200, topics_30_days: 120 } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/u/example/summary.json')) {
      return new Response(JSON.stringify({
        users: [{ trust_level: 1 }],
        user_summary: { days_visited: 10, likes_given: 0, likes_received: 0, posts_count: 2, topics_entered: 10, posts_read_count: 80, time_read: 1200 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/directory_items.json?')) {
      return new Response(JSON.stringify({ directory_items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);
    await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only', hideSelectSite: true } as any);

    const result = await tools['discourse_get_trust_level_progress'].handler({ username: 'example' }, {});
    const text = String(result?.content?.[0]?.text || '');

    assert.match(text, /Current Trust Level: 1 \(Basic\)/);
    assert.match(text, /Progress toward TL2/);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('trust-level tool ignores non-exact directory rows instead of using the first result', async () => {
  const logger = new Logger('silent');
  const siteState = createSiteState();
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = { registerTool(name: string, _meta: any, handler: Function) { tools[name] = { handler }; } };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse', stats: { posts_30_days: 1200, topics_30_days: 120 } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/u/example/summary.json')) {
      return new Response(JSON.stringify({
        users: [{ trust_level: 1 }],
        user_summary: { days_visited: 10, likes_given: 0, likes_received: 0, posts_count: 2, topics_entered: 10, posts_read_count: 80, time_read: 1200 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/directory_items.json?')) {
      return new Response(JSON.stringify({
        directory_items: [{
          user: { username: 'someoneelse', trust_level: 2 },
          days_visited: 99,
          likes_given: 99,
          likes_received: 99,
          post_count: 99,
          topics_entered: 99,
          posts_read: 9999,
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);
    await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only', hideSelectSite: true } as any);

    const result = await tools['discourse_get_trust_level_progress'].handler({ username: 'example' }, {});
    const text = String(result?.content?.[0]?.text || '');

    assert.match(text, /Current Trust Level: 1 \(Basic\)/);
    assert.match(text, /Days Visited: 10 \/ 15/);
    assert.doesNotMatch(text, /99 \/ 15/);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('trust-level tool shows TL4 as highest level instead of TL3 retention', async () => {
  const logger = new Logger('silent');
  const siteState = createSiteState();
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = { registerTool(name: string, _meta: any, handler: Function) { tools[name] = { handler }; } };

  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    requestedUrls.push(url);

    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse', stats: { posts_30_days: 1200, topics_30_days: 120 } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/u/leader/summary.json')) {
      return new Response(JSON.stringify({
        users: [{ trust_level: 4 }],
        user_summary: { days_visited: 100, likes_given: 50, likes_received: 100, posts_count: 100, topics_entered: 1000, posts_read_count: 5000, time_read: 10000 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/directory_items.json?')) {
      return new Response(JSON.stringify({ directory_items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);
    await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only', hideSelectSite: true } as any);

    const result = await tools['discourse_get_trust_level_progress'].handler({ username: 'leader' }, {});
    const text = String(result?.content?.[0]?.text || '');

    assert.match(text, /Current Trust Level: 4 \(Leader\)/);
    assert.match(text, /Highest trust level reached/);
    assert.doesNotMatch(text, /Progress toward TL3/);
    assert.deepEqual(requestedUrls, [
      'https://example.com/about.json',
      'https://example.com/u/leader/summary.json',
    ]);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('notifications tool prompts auth setup when neither API key nor login credentials are configured', async () => {
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
            throw new Error('should not request network without auth config');
          },
        },
      };
    },
    hasAuthenticationConfiguredForSite() {
      return false;
    },
  };

  registerListNotifications(fakeServer, { siteState: fakeSiteState, maxReadLength: 50000 } as any, { toolsMode: 'discourse_api_only' });

  const result = await fakeServerTools['discourse_list_notifications'].handler({ limit: 5, unread_only: false }, {});
  const text = String(result?.content?.[0]?.text || '');

  assert.equal(result?.isError, true);
  assert.match(text, /Set up an API key or provide NITAN_USERNAME\/NITAN_PASSWORD/);
});
