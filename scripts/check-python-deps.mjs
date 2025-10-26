#!/usr/bin/env node
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('Checking Python dependencies for Discourse MCP...');

// Check if Python is available (try python3 first, then python for Windows)
let pythonCmd = 'python3';
try {
  const pythonVersion = execSync(`${pythonCmd} --version`, { encoding: 'utf-8' }).trim();
  console.log(`Found ${pythonVersion}`);
} catch (error) {
  // Try 'python' command (common on Windows)
  try {
    pythonCmd = 'python';
    const pythonVersion = execSync(`${pythonCmd} --version`, { encoding: 'utf-8' }).trim();
    console.log(`Found ${pythonVersion}`);
  } catch (error2) {
    console.warn('Warning: Python not found. Cloudscraper features will not work.');
    console.warn('To use cloudscraper, install Python 3.7+ and run: pip install -r requirements.txt');
    process.exit(0); // Don't fail installation
  }
}

// Check if pip is available (try pip3 first, then pip for Windows)
let pipCmd = 'pip3';
try {
  execSync(`${pipCmd} --version`, { encoding: 'utf-8', stdio: 'ignore' });
} catch (error) {
  // Try 'pip' command (common on Windows)
  try {
    pipCmd = 'pip';
    execSync(`${pipCmd} --version`, { encoding: 'utf-8', stdio: 'ignore' });
  } catch (error2) {
    console.warn('Warning: pip not found. Cannot install Python dependencies.');
    console.warn('Install pip and run: pip install -r requirements.txt');
    process.exit(0); // Don't fail installation
  }
}

// Try to install Python dependencies
// Look in root first (dev), then in dist/ (installed)
let requirementsFile = join(rootDir, 'requirements.txt');
if (!existsSync(requirementsFile)) {
  requirementsFile = join(rootDir, 'dist', 'requirements.txt');
}

if (existsSync(requirementsFile)) {
  try {
    console.log('Installing Python dependencies...');
    execSync(`${pipCmd} install --quiet -r "${requirementsFile}"`, {
      encoding: 'utf-8',
      stdio: 'inherit'
    });
    console.log('Python dependencies installed successfully!');
  } catch (error) {
    console.warn('Warning: Failed to install Python dependencies automatically.');
    console.warn(`You may need to run manually: ${pipCmd} install -r requirements.txt`);
    console.warn(`Or use a virtual environment: ${pythonCmd} -m venv venv && pip install -r requirements.txt`);
    process.exit(0); // Don't fail installation
  }
} else {
  console.warn('Warning: requirements.txt not found.');
}

console.log('Setup complete!');
