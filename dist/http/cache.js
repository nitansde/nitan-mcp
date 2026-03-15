export class TTLCache {
    constructor(maxEntries = 100) {
        this.maxEntries = maxEntries;
        this.map = new Map();
    }
    get(key) {
        const entry = this.map.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.map.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlMs) {
        if (this.map.size >= this.maxEntries) {
            // simple LRU-ish: delete first key
            const firstKey = this.map.keys().next().value;
            if (firstKey !== undefined)
                this.map.delete(firstKey);
        }
        this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
}
//# sourceMappingURL=cache.js.map