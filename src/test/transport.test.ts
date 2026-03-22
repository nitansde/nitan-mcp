import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

function spawnHttpServer(indexPath: string, port: number) {
  return spawn('node', [
    indexPath,
    '--transport', 'http',
    '--port', String(port),
    '--log_level', 'silent',
    '--skip-site-validation', 'true',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('HTTP transport starts on specified port', async () => {
  const port = await getFreePort();
  const indexPath = path.resolve(__dirname, '../../dist/index.js');

  const serverProcess = spawnHttpServer(indexPath, port);

  try {
    const ready = await waitForServer(port);
    assert.ok(ready, 'Server should start successfully');
  } finally {
    serverProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 100));
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
    assert.deepEqual(data, { status: 'ok' });
  } finally {
    serverProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 100));
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
    await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(500) });
    assert.fail('Should not have HTTP server running in stdio mode');
  } catch (error: any) {
    assert.ok(error.name === 'AbortError' || error.cause?.code === 'ECONNREFUSED');
  } finally {
    serverProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 100));
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
