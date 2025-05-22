import { config } from "./config.ts";
import { join, dirname } from "@std/path"
import type { SingleOrMany } from "./types.ts";
import { asArray, asyncIterMap } from "./util.ts";
import { existsSync, ensureDir } from "@std/fs"

export type CacheKey = SingleOrMany<Deno.KvKeyPart>;

class Cache {
    private kvPath : string;
    private kvHandle ?: Deno.Kv;
    private kvHandleCount : number;

    public constructor(cacheDir: string, clean : boolean) {
        if(cacheDir.endsWith(".sqlite3")) {
            this.kvPath = cacheDir;
        } else {
            this.kvPath = join(cacheDir, "kv.sqlite3");
        }
        
        this.kvHandleCount = 0;

        if(existsSync(this.kvPath, { isFile: true }) && clean) {
            Deno.removeSync(this.kvPath);
        }
    }

    public async openKv() : Promise<Deno.Kv> {
        this.kvHandleCount++;

        if(this.kvHandle !== undefined) {
            return this.kvHandle;
        }

        await ensureDir(dirname(this.kvPath));
        
        const kv = await Deno.openKv(this.kvPath);
        const ogClose = kv.close;
        Object.assign(kv, { close: () => {
            this.kvHandleCount--;
            if(this.kvHandleCount === 0) {
                Object.assign(kv, { close: ogClose });
                kv.close();
                this.kvHandle = undefined;
            }
        } });

        this.kvHandle = kv;

        return kv;
    }

    public async use<T>(fn : (kv : Deno.Kv) => T | Promise<T>) {
        const kv = await this.openKv();
        const result = await fn(kv);
        kv.close();
        return result;
    }
}

class CacheScope {
    private _scope : Deno.KvKey;
    private cache : Cache;
    
    public constructor(cache : Cache, scope : Deno.KvKey) {
        this._scope = scope;
        this.cache = cache;
    }

    private key(_key : CacheKey) {
        return [...this._scope, ...asArray(_key)];
    }

    public use<T>(fn : (cache : CacheScope) => T | Promise<T>) {
        return this.cache.use<T>(_ => fn(this));
    }

    public get<T>(key : CacheKey, _default?: T) {
        return this.cache.use(async (kv) => {
            const result = await kv.get<T>(this.key(key));
        
            if(result.versionstamp === null) {
                return _default;
            } else {
                return result.value ?? _default;
            }
        })
    }

    public set<T>(key : CacheKey, value : T, expireInMs?: number) {
        return this.cache.use((kv) => {
            return kv.set(this.key(key), value, {
                expireIn: expireInMs
            }).then(x => x.ok).catch(() => false);
        })
    }

    public delete(...keys : CacheKey[]) {
        return this.cache.use(async (kv) => {
            for(const key of keys){
                await kv.delete(this.key(key));
            }
        })
    }

    public async clear() {
        await this.cache.use(async (kv) => {
            const all_keys = await kv.list({ prefix: this._scope });
            for await(const entry of all_keys) {
                await kv.delete(entry.key);
            }
        });
    }

    public async *list(prefix?: CacheKey) {
        const kv = await this.cache.openKv();
        const entries = await kv.list({
            prefix: this.key(prefix ?? [])
        });
        
        for await(const entry of entries) {
            yield { key: entry.key.slice(this._scope.length), value: entry.value }
        }

        kv.close();
    }

    public keys(prefix?: CacheKey) {
        return asyncIterMap(this.list(prefix), entry => entry.key);
    }
    
    public scope(key : CacheKey) : CacheScope {
        return new CacheScope(this.cache, this.key(key));
    }
}

export type { CacheScope };

const _cache = new Cache(config.CACHE_DIR, config.CACHE_CLEAN);

const rootScope = new CacheScope(_cache, []);

export { rootScope as Cache };