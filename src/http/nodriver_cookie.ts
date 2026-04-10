import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type { Logger } from "../util/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const defaultPythonPath = process.platform === "win32" ? "python" : "python3";

let _scriptPath: string | undefined;

function findPythonScript(): string {
  if (_scriptPath) return _scriptPath;

  const distPath = join(__dirname, "nodriver_cf_cookie.py");
  if (existsSync(distPath)) { _scriptPath = distPath; return distPath; }

  const srcPath = join(__dirname, "..", "..", "src", "http", "nodriver_cf_cookie.py");
  if (existsSync(srcPath)) { _scriptPath = srcPath; return srcPath; }

  throw new Error("nodriver_cf_cookie.py not found.");
}

export interface NodriverResult {
  success: boolean;
  cookies: Record<string, string>;
  error?: string;
  error_type?: string;
}

export class NodriverCookieClient {
  private pythonPath: string;
  private available: boolean | undefined;

  constructor(
    private logger: Logger,
    pythonPath: string = defaultPythonPath
  ) {
    this.pythonPath = pythonPath;
  }

  /**
   * Launch Chrome via nodriver to solve CF challenge and harvest cookies.
   * Returns extracted cookies, or undefined if nodriver is unavailable.
   */
  async harvestCookies(url: string, timeoutSec: number = 60): Promise<NodriverResult | undefined> {
    if (this.available === false) return undefined;

    return new Promise((resolve) => {
      const timeoutMs = (timeoutSec + 15) * 1000;
      this.logger.info(`Launching nodriver for CF bypass: ${url}`);

      let python: ReturnType<typeof spawn>;
      let resolvedPath: string;
      try {
        resolvedPath = findPythonScript();
      } catch {
        this.logger.info("nodriver_cf_cookie.py not found, skipping");
        this.available = false;
        resolve(undefined);
        return;
      }
      try {
        python = spawn(this.pythonPath, [resolvedPath]);
      } catch (err: any) {
        this.logger.info(`Failed to spawn nodriver: ${err.message}`);
        this.available = false;
        resolve(undefined);
        return;
      }

      let stdout = "";
      let stderr = "";

      python.stdout!.setEncoding("utf8");
      python.stderr!.setEncoding("utf8");

      python.stdout!.on("data", (data: string) => { stdout += data; });
      python.stderr!.on("data", (data: string) => { stderr += data; });

      const timer = setTimeout(() => {
        this.logger.error(`Nodriver timed out after ${timeoutMs}ms`);
        try { python.kill(); } catch {}
        resolve(undefined);
      }, timeoutMs);

      python.on("close", (code) => {
        if (timer) clearTimeout(timer);

        if (stderr) this.logger.debug(`Nodriver stderr: ${stderr}`);
        this.logger.debug(`Nodriver exited with code: ${code}`);

        if (stdout.length === 0) {
          this.logger.error("Nodriver produced no output");
          this.available = false;
          resolve(undefined);
          return;
        }

        try {
          const result = JSON.parse(stdout) as NodriverResult;

          if (!result.success && result.error_type === "ImportError") {
            this.logger.info(`Nodriver not installed: ${result.error}`);
            this.available = false;
            resolve(undefined);
            return;
          }

          this.logger.info(`Nodriver: success=${result.success}, cookies=${Object.keys(result.cookies || {}).length}`);
          resolve(result);
        } catch (e: any) {
          this.logger.error(`Failed to parse nodriver output: ${e.message}`);
          resolve(undefined);
        }
      });

      python.on("error", (err) => {
        if (timer) clearTimeout(timer);
        this.logger.info(`Failed to spawn nodriver Python: ${err.message}`);
        this.available = false;
        resolve(undefined);
      });

      const input = JSON.stringify({ url, timeout: timeoutSec });
      python.stdin!.write(input);
      python.stdin!.end();
    });
  }
}
