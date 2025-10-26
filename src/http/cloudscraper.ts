import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type { Logger } from "../util/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find the Python script - check multiple locations
function findPythonScript(): string {
  // 1. When running from built dist/ (development or after build)
  const distPath = join(__dirname, "cloudscraper_wrapper.py");
  if (existsSync(distPath)) {
    return distPath;
  }
  
  // 2. When running from source (development)
  const srcPath = join(__dirname, "..", "..", "src", "http", "cloudscraper_wrapper.py");
  if (existsSync(srcPath)) {
    return srcPath;
  }
  
  // 3. When installed via npm as @nitan/mcp (the file is copied to dist/)
  // This handles: node_modules/@nitan/mcp/dist/http/cloudscraper_wrapper.py
  const npmDistPath = join(__dirname, "cloudscraper_wrapper.py");
  if (existsSync(npmDistPath)) {
    return npmDistPath;
  }
  
  // 4. Fallback: try src/http relative to package root
  const packageSrcPath = join(__dirname, "..", "..", "src", "http", "cloudscraper_wrapper.py");
  if (existsSync(packageSrcPath)) {
    return packageSrcPath;
  }
  
  throw new Error("cloudscraper_wrapper.py not found. Please ensure Python script is bundled with the package.");
}

const scriptPath = findPythonScript();

export interface CloudscraperRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  cookies?: Record<string, string>;
  timeout?: number;
  login?: {
    username: string;
    password: string;
    second_factor_token?: string;
  };
}

export interface CloudscraperResponse {
  success: boolean;
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  cookies?: Record<string, string>;
  csrf_token?: string;
  message?: string;
  error?: string;
  error_type?: string;
}

export class CloudscraperClient {
  private pythonPath: string;
  private scriptPath: string;

  constructor(
    private logger: Logger,
    pythonPath: string = "python3"
  ) {
    this.pythonPath = pythonPath;
    this.scriptPath = scriptPath;
  }

  async request(req: CloudscraperRequest): Promise<CloudscraperResponse> {
    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, [this.scriptPath]);

      let stdout = "";
      let stderr = "";

      python.stdout.setEncoding('utf8');
      python.stderr.setEncoding('utf8');

      python.stdout.on("data", (data) => {
        stdout += data;
      });

      python.stderr.on("data", (data) => {
        stderr += data;
      });

      python.on("close", (code) => {
        if (stderr) {
          this.logger.debug(`Python stderr: ${stderr}`);
        }

        this.logger.debug(`Python process exited with code: ${code}`);
        this.logger.debug(`Raw stdout length: ${stdout.length} bytes`);
        this.logger.debug(`Raw stdout (first 500 chars): ${stdout.substring(0, 500)}`);
        
        // Check for binary data
        const hasBinaryData = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\xFF]/.test(stdout);
        if (hasBinaryData) {
          this.logger.error(`Stdout contains binary data! This may indicate gzip or other encoding issue.`);
          this.logger.debug(`Stdout as hex (first 100 bytes): ${Buffer.from(stdout.substring(0, 100)).toString('hex')}`);
        }

        try {
          const result = JSON.parse(stdout) as CloudscraperResponse;
          
          if (!result.success) {
            this.logger.error(`Cloudscraper error: ${result.error} (${result.error_type})`);
          }
          
          resolve(result);
        } catch (e) {
          const error = e as Error;
          this.logger.error(`Failed to parse cloudscraper response: ${error.message}`);
          this.logger.error(`Raw output length: ${stdout.length}`);
          this.logger.error(`Raw output (full): ${stdout}`);
          reject(new Error(`Cloudscraper failed: ${error.message}`));
        }
      });

      python.on("error", (err) => {
        this.logger.error(`Failed to spawn Python process: ${err.message}`);
        reject(new Error(`Failed to spawn Python: ${err.message}`));
      });

      // Send request data to Python script via stdin
      const input = JSON.stringify(req);
      python.stdin.write(input);
      python.stdin.end();
    });
  }
}
