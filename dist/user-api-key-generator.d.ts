#!/usr/bin/env node
interface GenerateOptions {
    site: string;
    scopes?: string;
    applicationName?: string;
    clientId?: string;
    nonce?: string;
    payload?: string;
    saveTo?: string;
}
export declare function generateUserApiKey(options: GenerateOptions): Promise<void>;
export {};
