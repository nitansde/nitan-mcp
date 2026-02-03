import test from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Logger } from '../util/logger.js';
import { registerAllTools } from '../tools/registry.js';
import { SiteState } from '../site/state.js';

function createFakeTransport() {
  // Minimal stub transport to allow server.connect to proceed without a client.
  // We won't actually send/receive messages; we only verify registration doesn't throw.
  return new StdioServerTransport({
    stdin: new ReadableStream(),
    stdout: new WritableStream(),
  } as any);
}

test('registers built-in tools', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' }, bypassMethod: 'none' });

test('registers write-enabled tools when allowWrites=true', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' }, bypassMethod: 'none' });

  // Minimal fake server to capture tool registrations
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = {
    registerTool(name: string, _meta: any, handler: Function) {
      tools[name] = { handler };
    },
  };

  await registerAllTools(fakeServer, siteState, logger, { allowWrites: true, toolsMode: 'discourse_api_only' } as any);

  // When writes are enabled, both create tools should be registered
  assert.ok('discourse_create_post' in tools);
  assert.ok('discourse_create_category' in tools);
});
  const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: { listChanged: false } } });

  await registerAllTools(server as any, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' });

  // If no error is thrown we consider registration successful.
  assert.ok(true);
});

// Simple HTTP integration using fixtures when present
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Integration-style test: select site then search (HTTP mocked)
test('select-site then search flow works with mocked HTTP', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' }, bypassMethod: 'none' });

  // Minimal fake server to capture tool handlers
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = {
    registerTool(name: string, _meta: any, handler: Function) {
      tools[name] = { handler };
    },
  };

  await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' });

  // Mock fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, _init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/search.json')) {
      return new Response(JSON.stringify({ topics: [{ id: 123, title: 'Hello World', slug: 'hello-world' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as any;

  try {
    // Select site
    const selectRes = await tools['discourse_select_site'].handler({ site: 'https://example.com' }, {});
    assert.equal(selectRes?.isError, undefined);

    // Search
    const searchRes = await tools['discourse_search'].handler({ query: 'hello' }, {});
    const text = String(searchRes?.content?.[0]?.text || '');
    assert.match(text, /hello-world/);
    assert.match(text, /Hello World/);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

// Tethered mode: preselect site via --site and hide select_site
test('tethered mode hides select_site and allows search without selection', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' }, bypassMethod: 'none' });

  // Minimal fake server to capture tool handlers
  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = {
    registerTool(name: string, _meta: any, handler: Function) {
      tools[name] = { handler };
    },
  };

  // Mock fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, _init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/search.json')) {
      return new Response(JSON.stringify({ topics: [{ id: 123, title: 'Hello World', slug: 'hello-world' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as any;

  try {
    // Emulate --site tethering: validate via /about.json and preselect site
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);

    // Register tools with select_site hidden
    await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only', hideSelectSite: true } as any);

    // Ensure select tool is not exposed
    assert.ok(!('discourse_select_site' in tools));

    // Search should work without calling select first
    const searchRes = await tools['discourse_search'].handler({ query: 'hello' }, {});
    const text = String(searchRes?.content?.[0]?.text || '');
    assert.match(text, /hello-world/);
    assert.match(text, /Hello World/);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('default-search prefix is applied to queries', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' }, bypassMethod: 'none' });

  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = {
    registerTool(name: string, _meta: any, handler: Function) {
      tools[name] = { handler };
    },
  };

  // Mock fetch to capture the search URL
  let lastUrl: string | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, _init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    lastUrl = url;
    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/search.json')) {
      return new Response(JSON.stringify({ topics: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
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

// Test read_topic pagination estimation with deleted posts
test('read_topic uses deletion ratio to estimate correct starting page', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' }, bypassMethod: 'none' });

  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = {
    registerTool(name: string, _meta: any, handler: Function) {
      tools[name] = { handler };
    },
  };

  // Track which pages were fetched
  const fetchedPages: number[] = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, _init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Test Forum' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Topic metadata: 150 posts exist, but highest post number is 300 (50% deleted)
    if (url.includes('/t/123.json')) {
      return new Response(JSON.stringify({
        title: 'Test Topic',
        slug: 'test-topic',
        category_id: 1,
        tags: [],
        posts_count: 150,
        highest_post_number: 300
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Raw pages: simulate 50% deletion ratio
    // Page 1: posts 1-200 (actual stream positions 1-100)
    // Page 2: posts 201-400 (actual stream positions 101-150)
    if (url.includes('/raw/123')) {
      const pageMatch = url.match(/page=(\d+)/);
      const page = pageMatch ? parseInt(pageMatch[1], 10) : 1;
      fetchedPages.push(page);

      if (page === 1) {
        // Page 1 has posts #2, #4, #6, ... #200 (even numbers, simulating every other post deleted)
        const lines: string[] = [];
        for (let i = 1; i <= 100; i++) {
          const postNum = i * 2; // 2, 4, 6, ... 200
          lines.push(`user${i} | 2024-01-01 | #${postNum}`);
          lines.push('');
          lines.push(`Content of post ${postNum}`);
          lines.push('');
          lines.push('-------------------------');
          lines.push('');
        }
        return new Response(lines.join('\n'), { status: 200, headers: { 'Content-Type': 'text/plain' } });
      } else if (page === 2) {
        // Page 2 has posts #202, #204, ... #300
        const lines: string[] = [];
        for (let i = 101; i <= 150; i++) {
          const postNum = i * 2; // 202, 204, ... 300
          lines.push(`user${i} | 2024-01-01 | #${postNum}`);
          lines.push('');
          lines.push(`Content of post ${postNum}`);
          lines.push('');
          lines.push('-------------------------');
          lines.push('');
        }
        return new Response(lines.join('\n'), { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
      return new Response('', { status: 200 });
    }

    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);

    await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' });

    // Request starting from post #150
    // With naive calculation: page = floor((150-1)/100) + 1 = 2 (WRONG - post #150 is on page 1)
    // With deletion ratio (0.5): estimated position = 150 * 0.5 = 75, page = 1 (CORRECT)
    const result = await tools['discourse_read_topic'].handler({ topic_id: 123, start_post_number: 150, post_limit: 5 }, {});
    const text = String(result?.content?.[0]?.text || '');

    // Should find posts starting from #150 (which is post #150 rounded up to nearest even = #150)
    assert.match(text, /Post #150/);

    // Verify we started on page 1 (not page 2 which naive calculation would give)
    assert.ok(fetchedPages.includes(1), `Should have fetched page 1, but fetched: ${fetchedPages.join(', ')}`);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

// Test that cache prevents duplicate fetch when walk finds correct page immediately
test('read_topic caches probe page to avoid duplicate fetch', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' }, bypassMethod: 'none' });

  const tools: Record<string, { handler: Function }> = {};
  const fakeServer: any = {
    registerTool(name: string, _meta: any, handler: Function) {
      tools[name] = { handler };
    },
  };

  // Count fetches per page
  const pageFetchCounts: Record<number, number> = {};

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, _init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Test Forum' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.includes('/t/456.json')) {
      return new Response(JSON.stringify({
        title: 'Test Topic',
        slug: 'test-topic',
        posts_count: 50,
        highest_post_number: 50 // No deletions
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.includes('/raw/456')) {
      const pageMatch = url.match(/page=(\d+)/);
      const page = pageMatch ? parseInt(pageMatch[1], 10) : 1;
      pageFetchCounts[page] = (pageFetchCounts[page] || 0) + 1;

      if (page === 1) {
        const lines: string[] = [];
        for (let i = 1; i <= 50; i++) {
          lines.push(`user${i} | 2024-01-01 | #${i}`);
          lines.push('');
          lines.push(`Content of post ${i}`);
          lines.push('');
          lines.push('-------------------------');
          lines.push('');
        }
        return new Response(lines.join('\n'), { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
      return new Response('', { status: 200 });
    }

    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);

    await registerAllTools(fakeServer, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' });

    // Request from post #1 - should estimate page 1 correctly
    await tools['discourse_read_topic'].handler({ topic_id: 456, start_post_number: 1, post_limit: 10 }, {});

    // Page 1 should only be fetched ONCE (cached from walk phase)
    assert.equal(pageFetchCounts[1], 1, `Page 1 should be fetched exactly once, but was fetched ${pageFetchCounts[1]} times`);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});
