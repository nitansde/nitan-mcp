export declare class TTLCache<K, V> {
    private maxEntries;
    private map;
    constructor(maxEntries?: number);
    get(key: K): V | undefined;
    set(key: K, value: V, ttlMs: number): void;
}
