import test from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Logger } from '../util/logger.js';
import { registerAllTools } from '../tools/registry.js';
import { SiteState } from '../site/state.js';
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
  await registerAllTools(server as any, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' });
  assert.ok(true);
});

test('registers write-enabled tools when allowWrites=true', async () => {
  const logger = new Logger('silent');
  const siteState = createSiteState();
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = { registerTool(name: string, _meta: any, handler: Function) { tools[name] = { handler }; } };
  await registerAllTools(fakeServer, siteState, logger, { allowWrites: true, toolsMode: 'discourse_api_only' } as any);
  assert.ok('discourse_create_post' in tools);
  assert.ok('discourse_create_category' in tools);
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
  await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' });

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
    await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only', hideSelectSite: true } as any);
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
    await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only', defaultSearchPrefix: 'tag:ai order:latest-post' } as any);
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
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString();

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
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});
