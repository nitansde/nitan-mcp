import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMacPlaywrightProfileSelection } from "../http/browser_fallback.js";

function createTempHomeDir(): string {
  return mkdtempSync(join(tmpdir(), "nitan-browser-fallback-"));
}

test("selects OpenClaw profile when requested profile directory exists", () => {
  const homeDir = createTempHomeDir();

  try {
    const openClawUserDataDir = join(homeDir, "Library", "Application Support", "OpenClaw", "ChromeProfile");
    mkdirSync(join(openClawUserDataDir, "Default"), { recursive: true });

    const selection = resolveMacPlaywrightProfileSelection({
      homeDir,
      loginProfileName: "Default",
    });

    assert.equal(selection.source, "openclaw");
    assert.equal(selection.userDataDir, openClawUserDataDir);
    assert.equal(selection.profileDirectory, "Default");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("falls back to dedicated Nitan profile when OpenClaw profile directory is missing", () => {
  const homeDir = createTempHomeDir();

  try {
    const openClawUserDataDir = join(homeDir, "Library", "Application Support", "OpenClaw", "ChromeProfile");
    mkdirSync(openClawUserDataDir, { recursive: true });

    const selection = resolveMacPlaywrightProfileSelection({
      homeDir,
      loginProfileName: "Default",
    });

    const expectedNitanUserDataDir = join(homeDir, "Library", "Application Support", "NitanMCP", "ChromeProfile");
    assert.equal(selection.source, "nitan");
    assert.equal(selection.userDataDir, expectedNitanUserDataDir);
    assert.equal(selection.profileDirectory, "Default");
    assert.ok(existsSync(join(expectedNitanUserDataDir, "Default")));
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("OPENCLAW_CHROME_PROFILE_DIR override is used only when requested profile exists", () => {
  const homeDir = createTempHomeDir();

  try {
    const overrideDir = join(homeDir, "OpenClawOverride");
    mkdirSync(join(overrideDir, "Profile 1"), { recursive: true });

    const inheritedSelection = resolveMacPlaywrightProfileSelection({
      homeDir,
      loginProfileName: "Profile 1",
      openClawChromeProfileDirOverride: overrideDir,
    });
    assert.equal(inheritedSelection.source, "openclaw");
    assert.equal(inheritedSelection.userDataDir, overrideDir);

    const fallbackSelection = resolveMacPlaywrightProfileSelection({
      homeDir,
      loginProfileName: "Default",
      openClawChromeProfileDirOverride: overrideDir,
    });
    const expectedNitanUserDataDir = join(homeDir, "Library", "Application Support", "NitanMCP", "ChromeProfile");
    assert.equal(fallbackSelection.source, "nitan");
    assert.equal(fallbackSelection.userDataDir, expectedNitanUserDataDir);
    assert.ok(existsSync(join(expectedNitanUserDataDir, "Default")));
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("default managed profile directory is nitan and persists profile naming metadata", () => {
  const homeDir = createTempHomeDir();

  try {
    const selection = resolveMacPlaywrightProfileSelection({
      homeDir,
    });

    const expectedNitanUserDataDir = join(homeDir, "Library", "Application Support", "NitanMCP", "ChromeProfile");
    assert.equal(selection.source, "nitan");
    assert.equal(selection.userDataDir, expectedNitanUserDataDir);
    assert.equal(selection.profileDirectory, "nitan");
    assert.ok(existsSync(join(expectedNitanUserDataDir, "nitan")));

    const localState = JSON.parse(readFileSync(join(expectedNitanUserDataDir, "Local State"), "utf8"));
    assert.equal(localState?.profile?.last_used, "nitan");
    assert.equal(localState?.profile?.info_cache?.nitan?.name, "nitan");
    assert.equal(localState?.profile?.info_cache?.nitan?.is_using_default_name, false);

    const preferences = JSON.parse(readFileSync(join(expectedNitanUserDataDir, "nitan", "Preferences"), "utf8"));
    assert.equal(preferences?.profile?.name, "nitan");
    assert.equal(preferences?.profile?.using_default_name, false);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});
