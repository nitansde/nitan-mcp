/**
 * Format timestamp to specified timezone without seconds
 * Converts UTC/ISO timestamps to target timezone: "2025-09-20T14:03:25.000Z" -> "2025-09-20 14:03"
 * Uses TIMEZONE environment variable if set (e.g., "America/New_York", "Asia/Shanghai")
 * Otherwise uses server's local timezone
 */
export function formatTimestamp(timestamp: string): string {
  if (!timestamp) return timestamp;
  
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      // If parsing fails, try to clean up the original string
      return timestamp.replace(/:\d{2}\.\d{3}Z$/, 'Z').replace(/:\d{2}Z$/, 'Z').replace(/:\d{2}\s+(UTC|GMT|[+-]\d{4})/, ' $1');
    }
    
    // Get timezone from environment variable or use system default
    const timezone = process.env.TIMEZONE;
    
    // Format as YYYY-MM-DD HH:MM in target timezone
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(timezone && { timeZone: timezone })
    };
    
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const parts = formatter.formatToParts(date);
    
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;
    const minute = parts.find(p => p.type === 'minute')?.value;
    
    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch (e) {
    // If any error, return cleaned up original
    return timestamp.replace(/:\d{2}\.\d{3}Z$/, 'Z').replace(/:\d{2}Z$/, 'Z').replace(/:\d{2}\s+(UTC|GMT|[+-]\d{4})/, ' $1');
  }
}
