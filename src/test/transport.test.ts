import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { constants, publicEncrypt } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getFreePort(): Promise<number> {
  return 3000 + Math.floor(Math.random() * 1000);
}

async function waitForServer(port: number, maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://localhost:${port}/health`);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

function spawnHttpServer(indexPath: string, port: number, options?: { extraArgs?: string[]; cwd?: string }) {
  return spawn('node', [
    indexPath,
    '--transport', 'http',
    '--port', String(port),
    '--log_level', 'silent',
    '--skip-site-validation', 'true',
    ...(options?.extraArgs || []),
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: options?.cwd,
  });
}

async function stopServer(serverProcess: ReturnType<typeof spawn>) {
  serverProcess.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 100));
}

function createTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function extractAuthUrl(html: string): URL {
  const match = html.match(/<a href="([^"]+)" target="_blank" class="btn">Authorize on Discourse<\/a>/);
  assert.ok(match?.[1], 'Auth page should include Discourse authorize URL');
  return new URL(match[1]);
}

function encryptPayloadForAuthUrl(authUrl: URL, payload: Record<string, unknown>): string {
  const publicKey = authUrl.searchParams.get('public_key');
  assert.ok(publicKey, 'Auth URL should include public key');
  return publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(JSON.stringify(payload), 'utf8')
  ).toString('base64');
}

test('HTTP transport starts on specified port', async () => {
  const port = await getFreePort();
  const indexPath = path.resolve(__dirname, '../../dist/index.js');

  const serverProcess = spawnHttpServer(indexPath, port);

  try {
    const ready = await waitForServer(port);
    assert.ok(ready, 'Server should start successfully');
  } finally {
    await stopServer(serverProcess);
  }
});

test('HTTP transport health endpoint returns ok', async () => {
  const port = await getFreePort();
  const indexPath = path.resolve(__dirname, '../../dist/index.js');

  const serverProcess = spawnHttpServer(indexPath, port);

  try {
    const ready = await waitForServer(port);
    assert.ok(ready, 'Server should start');

    const response = await fetch(`http://localhost:${port}/health`);
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.equal(data.status, 'ok');
    assert.equal(typeof data.started_at, 'string');
    assert.equal(typeof data.uptime_seconds, 'number');
    assert.equal(data.authenticated, false);
    assert.equal(data.auth_page, `http://localhost:${port}/auth`);
  } finally {
    await stopServer(serverProcess);
  }
});

test('stdio transport is the default', async () => {
  const indexPath = path.resolve(__dirname, '../../dist/index.js');

  const serverProcess = spawn('node', [
    indexPath,
    '--log_level', 'silent',
    '--skip-site-validation', 'true',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    await fetch('http://localhost:3000/health', { signal: AbortSignal.timeout(500) });
    assert.fail('Should not have HTTP server running in stdio mode');
  } catch (error: any) {
    assert.ok(error.name === 'AbortError' || error.cause?.code === 'ECONNREFUSED');
  } finally {
    await stopServer(serverProcess);
  }
});

test('HTTP transport gracefully handles shutdown', async () => {
  const port = await getFreePort();
  const indexPath = path.resolve(__dirname, '../../dist/index.js');

  const serverProcess = spawnHttpServer(indexPath, port);

  try {
    const ready = await waitForServer(port);
    assert.ok(ready, 'Server should start');

    serverProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(500) });
      assert.fail('Server should be shut down');
    } catch (error: any) {
      assert.ok(error.name === 'AbortError' || error.cause?.code === 'ECONNREFUSED');
    }
  } finally {
    serverProcess.kill('SIGKILL');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
});

test('health and auth page adapt to forwarded host for unauthenticated auth flow', async () => {
  const port = await getFreePort();
  const indexPath = path.resolve(__dirname, '../../dist/index.js');
  const workdir = createTempDir('nitan-auth-flow-');
  const serverProcess = spawnHttpServer(indexPath, port, {
    cwd: workdir,
    extraArgs: ['--site', 'https://www.uscardforum.com'],
  });

  try {
    const ready = await waitForServer(port);
    assert.ok(ready, 'Server should start');

    const healthResponse = await fetch(`http://localhost:${port}/health`, {
      headers: {
        'x-forwarded-host': 'funnel.example.ts.net',
        'x-forwarded-proto': 'https',
      },
    });
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.authenticated, false);
    assert.equal(health.auth_page, 'https://funnel.example.ts.net/auth');

    const authResponse = await fetch(`http://localhost:${port}/auth`, {
      headers: {
        'x-forwarded-host': 'funnel.example.ts.net',
        'x-forwarded-proto': 'https',
      },
    });
    assert.equal(authResponse.status, 200);
    const html = await authResponse.text();
    assert.match(html, /Not Authenticated/);
    assert.match(html, /Paste authorization payload here:/);
    assert.match(html, /Authorize on Discourse/);

    const authUrl = extractAuthUrl(html);
    assert.equal(authUrl.searchParams.get('auth_redirect'), 'https://funnel.example.ts.net/auth/callback');
  } finally {
    await stopServer(serverProcess);
    await rm(workdir, { recursive: true, force: true });
  }
});

test('auth page shows authenticated state when profile already exists', async () => {
  const port = await getFreePort();
  const indexPath = path.resolve(__dirname, '../../dist/index.js');
  const workdir = createTempDir('nitan-auth-profile-');
  writeFileSync(
    path.join(workdir, 'profile.json'),
    JSON.stringify({ auth_pairs: [{ site: 'https://www.uscardforum.com', user_api_key: 'existing-key', user_api_client_id: 'client-1' }] }, null, 2),
    'utf8'
  );

  const serverProcess = spawnHttpServer(indexPath, port, {
    cwd: workdir,
    extraArgs: ['--site', 'https://www.uscardforum.com', '--profile', 'profile.json'],
  });

  try {
    const ready = await waitForServer(port);
    assert.ok(ready, 'Server should start');

    const healthResponse = await fetch(`http://localhost:${port}/health`);
    const health = await healthResponse.json();
    assert.equal(health.authenticated, true);

    const authResponse = await fetch(`http://localhost:${port}/auth`);
    const html = await authResponse.text();
    assert.match(html, /Authenticated/);
    assert.match(html, /Logout/);
    assert.match(html, /You are authenticated to/);
  } finally {
    await stopServer(serverProcess);
    await rm(workdir, { recursive: true, force: true });
  }
});

test('POST and GET auth callback process encrypted payloads and update health state', async () => {
  const indexPath = path.resolve(__dirname, '../../dist/index.js');

  for (const method of ['POST', 'GET'] as const) {
    const port = await getFreePort();
    const workdir = createTempDir(`nitan-auth-callback-${method.toLowerCase()}-`);
    const serverProcess = spawnHttpServer(indexPath, port, {
      cwd: workdir,
      extraArgs: ['--site', 'https://www.uscardforum.com'],
    });

    try {
      const ready = await waitForServer(port);
      assert.ok(ready, `Server should start for ${method}`);

      const authResponse = await fetch(`http://localhost:${port}/auth`);
      const authUrl = extractAuthUrl(await authResponse.text());
      const encryptedPayload = encryptPayloadForAuthUrl(authUrl, { key: `user-key-${method.toLowerCase()}` });

      const callbackResponse = method === 'POST'
        ? await fetch(`http://localhost:${port}/auth/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload: encryptedPayload }),
          })
        : await fetch(`http://localhost:${port}/auth/callback?payload=${encodeURIComponent(encryptedPayload)}`);

      assert.equal(callbackResponse.status, 200);
      const callbackBody = await callbackResponse.json();
      assert.equal(callbackBody.status, 'ok');

      const healthResponse = await fetch(`http://localhost:${port}/health`);
      const health = await healthResponse.json();
      assert.equal(health.authenticated, true);

      const savedProfile = JSON.parse(await readFile(path.join(workdir, 'profile.json'), 'utf8'));
      assert.equal(savedProfile.auth_pairs.length, 1);
      assert.equal(savedProfile.auth_pairs[0].site, 'https://www.uscardforum.com');
      assert.equal(savedProfile.auth_pairs[0].user_api_key, `user-key-${method.toLowerCase()}`);
    } finally {
      await stopServer(serverProcess);
      await rm(workdir, { recursive: true, force: true });
    }
  }
});

test('DELETE auth callback clears profile auth and returns server to unauthenticated state', async () => {
  const port = await getFreePort();
  const indexPath = path.resolve(__dirname, '../../dist/index.js');
  const workdir = createTempDir('nitan-auth-logout-');
  writeFileSync(
    path.join(workdir, 'profile.json'),
    JSON.stringify({ auth_pairs: [{ site: 'https://www.uscardforum.com', user_api_key: 'existing-key', user_api_client_id: 'client-1' }] }, null, 2),
    'utf8'
  );

  const serverProcess = spawnHttpServer(indexPath, port, {
    cwd: workdir,
    extraArgs: ['--site', 'https://www.uscardforum.com', '--profile', 'profile.json'],
  });

  try {
    const ready = await waitForServer(port);
    assert.ok(ready, 'Server should start');

    const logoutResponse = await fetch(`http://localhost:${port}/auth/callback`, { method: 'DELETE' });
    assert.equal(logoutResponse.status, 200);
    const logout = await logoutResponse.json();
    assert.equal(logout.status, 'ok');
    assert.equal(logout.message, 'Logged out');

    const savedProfile = JSON.parse(await readFile(path.join(workdir, 'profile.json'), 'utf8'));
    assert.deepEqual(savedProfile.auth_pairs, []);

    const healthResponse = await fetch(`http://localhost:${port}/health`);
    const health = await healthResponse.json();
    assert.equal(health.authenticated, false);

    const authResponse = await fetch(`http://localhost:${port}/auth`);
    const html = await authResponse.text();
    assert.match(html, /Not Authenticated/);
  } finally {
    await stopServer(serverProcess);
    await rm(workdir, { recursive: true, force: true });
  }
});
