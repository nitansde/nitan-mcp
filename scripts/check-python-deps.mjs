#!/usr/bin/env node
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const venvDir = join(rootDir, '.venv');
const venvConfig = join(venvDir, 'pyvenv.cfg');
const venvPython = isWindows ? join(venvDir, 'Scripts', 'python.exe') : join(venvDir, 'bin', 'python');
const playwrightPackageJson = join(rootDir, 'node_modules', 'playwright', 'package.json');
const playwrightCliJs = join(rootDir, 'node_modules', 'playwright', 'cli.js');

console.log('Checking Python dependencies for Discourse MCP...');

function detectPythonVersion(pythonCmd) {
  try {
    const pythonVersion = execSync(`${pythonCmd} --version`, { encoding: 'utf-8' }).trim();
    return pythonVersion;
  } catch {
    return undefined;
  }
}

function resolvePythonCommand() {
  const candidates = isWindows
    ? ['py -3', 'python', 'python3']
    : ['python3', 'python'];

  for (const candidate of candidates) {
    const version = detectPythonVersion(candidate);
    if (!version) continue;
    console.log(`Found ${version} via: ${candidate}`);
    return candidate;
  }

  console.warn('Warning: Python not found. Cloudflare bypass features will not work.');
  console.warn('');
  console.warn('To use cloudscraper/curl_cffi for bypassing Cloudflare, please install Python:');
  console.warn('  • Download Python 3.7+ from: https://www.python.org/downloads/');
  console.warn('  • On Windows: Make sure to check "Add Python to PATH" during installation');
  console.warn('  • On Mac: brew install python3');
  console.warn('  • On Linux: sudo apt-get install python3 python3-pip');
  console.warn('');
  return undefined;
}

function ensureVenvPip() {
  try {
    execSync(`"${venvPython}" -m pip --version`, {
      encoding: 'utf-8',
      stdio: 'inherit',
    });
  } catch {
    console.log('pip is missing in .venv, bootstrapping with ensurepip...');
    execSync(`"${venvPython}" -m ensurepip --upgrade`, {
      encoding: 'utf-8',
      stdio: 'inherit',
    });
  }
}

function findRequirementsFile() {
  const projectRequirements = join(rootDir, 'requirements.txt');
  if (existsSync(projectRequirements)) return projectRequirements;
  const distRequirements = join(rootDir, 'dist', 'requirements.txt');
  if (existsSync(distRequirements)) return distRequirements;
  return undefined;
}

function ensurePythonDependencies(pythonCmd) {
  const requirementsFile = findRequirementsFile();
  if (!requirementsFile) {
    console.warn('Warning: requirements.txt not found.');
    return;
  }

  let venvReady = existsSync(venvConfig) && existsSync(venvPython);

  if (!venvReady) {
    try {
      console.log('Creating local .venv for Python dependencies...');
      execSync(`${pythonCmd} -m venv "${venvDir}"`, {
        encoding: 'utf-8',
        stdio: 'inherit',
      });
      venvReady = existsSync(venvConfig) && existsSync(venvPython);
    } catch {
      console.warn('Warning: Failed to initialize local .venv for Python dependencies.');
      console.warn('Cloudflare bypass may be unavailable until .venv is created.');
      console.warn(`You can run manually: ${pythonCmd} -m venv .venv`);
      return;
    }
  }

  if (!venvReady) {
    console.warn('Warning: .venv initialization did not produce expected files.');
    console.warn('Cloudflare bypass may be unavailable until .venv is fixed.');
    return;
  }

  try {
    ensureVenvPip();
    execSync(`"${venvPython}" -m pip install --quiet --disable-pip-version-check --upgrade pip setuptools wheel`, {
      encoding: 'utf-8',
      stdio: 'inherit',
    });

    console.log('Installing Python dependencies into .venv...');
    execSync(`"${venvPython}" -m pip install --quiet --disable-pip-version-check -r "${requirementsFile}"`, {
      encoding: 'utf-8',
      stdio: 'inherit',
    });
    console.log('Python dependencies installed successfully in .venv!');
  } catch (error) {
    const details = String(error?.stderr || error?.message || error);
    console.warn('Warning: Failed to install Python dependencies automatically.');
    if (details.toLowerCase().includes('externally-managed-environment')) {
      console.warn('Detected PEP668 externally-managed-environment policy.');
      console.warn('System pip is intentionally avoided; use local .venv.');
    }
    console.warn(`You may need to run manually: "${venvPython}" -m pip install -r requirements.txt`);
  }
}

function ensureMacPlaywright() {
  if (!isMac) {
    console.log('Skipping Playwright auto-install on non-macOS.');
    return;
  }

  try {
    if (!existsSync(playwrightPackageJson)) {
      console.log('Installing Playwright package for macOS browser fallback...');
      execSync('npm install --no-save --ignore-scripts playwright', {
        cwd: rootDir,
        encoding: 'utf-8',
        stdio: 'inherit',
      });
    } else {
      console.log('Playwright package already installed.');
    }

    if (!existsSync(playwrightCliJs)) {
      console.warn('Warning: Playwright CLI was not found after package installation.');
      console.warn('You can run manually: npm install --no-save playwright && npx playwright install chromium');
      return;
    }

    console.log('Installing Playwright browser runtime (chromium)...');
    execSync(`"${process.execPath}" "${playwrightCliJs}" install chromium`, {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'inherit',
    });
    console.log('Playwright browser runtime is ready.');
  } catch (error) {
    const details = String(error?.stderr || error?.message || error);
    console.warn('Warning: Failed to auto-install Playwright for macOS browser fallback.');
    if (details) {
      console.warn(details);
    }
    console.warn('You can run manually: npm install --no-save playwright && npx playwright install chromium');
  }
}

const pythonCmd = resolvePythonCommand();
if (pythonCmd) {
  ensurePythonDependencies(pythonCmd);
}

ensureMacPlaywright();

console.log('Setup complete!');
