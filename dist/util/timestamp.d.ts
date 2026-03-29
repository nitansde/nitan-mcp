/**
 * Format timestamp to specified timezone without seconds
 * Converts UTC/ISO timestamps to target timezone: "2025-09-20T14:03:25.000Z" -> "2025-09-20 14:03"
 * Uses TIMEZONE environment variable if set (e.g., "America/New_York", "Asia/Shanghai")
 * Otherwise uses server's local timezone
 */
export declare function formatTimestamp(timestamp: string): string;
