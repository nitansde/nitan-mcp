import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthorizationUrl, generateClientId, getBrowserOpenCommand, parseGenerateUserApiKeyArgs, resolveAuthLaunchMode } from '../user-api-key-generator.js';

test('generateClientId returns unique nitan-mcp UUID values', () => {
  const first = generateClientId();
  const second = generateClientId();

  assert.match(first, /^nitan-mcp-[0-9a-f-]{36}$/);
  assert.match(second, /^nitan-mcp-[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
});

test('resolveAuthLaunchMode defaults to url and accepts browser', () => {
  assert.equal(resolveAuthLaunchMode(undefined), 'url');
  assert.equal(resolveAuthLaunchMode('url'), 'url');
  assert.equal(resolveAuthLaunchMode('browser'), 'browser');
  assert.throws(() => resolveAuthLaunchMode('popup'), /Invalid --auth-mode value/);
});

test('getBrowserOpenCommand chooses platform-specific open command', () => {
  assert.deepEqual(getBrowserOpenCommand('https://example.com', 'darwin'), {
    command: 'open',
    args: ['https://example.com'],
  });
  assert.deepEqual(getBrowserOpenCommand('https://example.com', 'win32'), {
    command: 'cmd',
    args: ['/c', 'start', '', 'https://example.com'],
  });
  assert.deepEqual(getBrowserOpenCommand('https://example.com', 'linux'), {
    command: 'xdg-open',
    args: ['https://example.com'],
  });
});

test('buildAuthorizationUrl uses provided client_id consistently', () => {
  const url = new URL(buildAuthorizationUrl({
    site: 'https://www.uscardforum.com',
    clientId: 'nitan-mcp-test-id',
    nonce: '12345',
    scopes: 'read',
  }, 'PUBLIC_KEY'));

  assert.equal(url.origin, 'https://www.uscardforum.com');
  assert.equal(url.pathname, '/user-api-key/new');
  assert.equal(url.searchParams.get('client_id'), 'nitan-mcp-test-id');
  assert.equal(url.searchParams.get('nonce'), '12345');
  assert.equal(url.searchParams.get('scopes'), 'read');
});

test('parseGenerateUserApiKeyArgs supports auth-mode and save-to flags', () => {
  const parsed = parseGenerateUserApiKeyArgs([
    '--site', 'https://www.uscardforum.com',
    '--auth-mode', 'browser',
    '--save-to', '/tmp/profile.json',
  ]);

  assert.equal(parsed.showHelp, false);
  assert.deepEqual(parsed.options, {
    site: 'https://www.uscardforum.com',
    authMode: 'browser',
    saveTo: '/tmp/profile.json',
  });
});
