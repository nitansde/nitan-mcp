import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getDefaultProfilePath } from '../util/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runCli(args: string[], env?: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [path.resolve(__dirname, '../../dist/index.js'), ...args], {
      env: { ...process.env, ...(env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('delete-user-api-key removes the default profile file when it exists', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'nitan-delete-profile-'));
  const profilePath = getDefaultProfilePath('darwin', { ...process.env, HOME: home }, home);
  mkdirSync(path.dirname(profilePath), { recursive: true });
  writeFileSync(profilePath, JSON.stringify({ auth_pairs: [{ site: 'https://www.uscardforum.com', user_api_key: 'k', user_api_client_id: 'c' }] }), 'utf8');

  try {
    const result = await runCli(['delete-user-api-key'], { HOME: home });
    assert.equal(result.code, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.success, true);
    assert.equal(parsed.deleted, true);
    await stat(profilePath).then(
      () => assert.fail('profile should be deleted'),
      () => undefined,
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('delete-user-api-key is a no-op when the default profile file does not exist', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'nitan-delete-profile-empty-'));

  try {
    const result = await runCli(['delete-user-api-key'], { HOME: home });
    assert.equal(result.code, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.success, true);
    assert.equal(parsed.deleted, false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('server rejects deprecated --profile flag', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'nitan-profile-flag-'));
  const bogusProfile = path.join(home, 'custom-profile.json');
  writeFileSync(bogusProfile, '{}', 'utf8');

  try {
    const result = await runCli(['--profile', bogusProfile], { HOME: home });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /--profile is no longer supported/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
