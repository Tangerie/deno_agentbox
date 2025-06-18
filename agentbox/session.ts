import { authenticate } from "./auth.ts";
import { Cache, type CacheScope } from "@tangerie/utils/cache"; 
import { SemaphoreQueue, SingularAsync } from "@tangerie/utils/queue"; 
import { DEFAULT_SEARCH_RESPONSE_KEYS, PAGE_SIZE, SEARCH_MAX_ERR_COUNT } from "./constants.ts";
import type { AgentboxAPIResponse, AuthState, Json } from "./internal_types.ts";
import type { RequestParameters } from "./types.ts";
import { config } from "./config.ts";
import { sleep } from "@nodef/extra-sleep";

export class AgentboxSession {
    private static sessions : Record<string, AgentboxSession> = {};

    private cache : CacheScope;
    private username : string;
    private password : string;
    private baseUrl : string;

    private queue : SemaphoreQueue;
    private loginSingular : SingularAsync<AuthState>;

    private constructor(username : string, password : string, baseUrl : string) {
        this.username = username;
        this.password = password;
        this.baseUrl = baseUrl;
        this.cache = Cache.scope(this.username);
        this.queue = new SemaphoreQueue(config.MAX_REQUESTS);
        this.loginSingular = new SingularAsync();
    }

    public static get(username : string, password? : string, baseUrl? : string) : AgentboxSession {
        if(username in AgentboxSession.sessions) {
            return AgentboxSession.sessions[username];
        }

        if(!password) throw new Error("Password required");
        if(!baseUrl) throw new Error("Base URL required");

        AgentboxSession.sessions[username] = new AgentboxSession(username, password, baseUrl);
        return AgentboxSession.sessions[username]!;
    }

    async #login() {
        const auth = await authenticate(this.username, this.password, this.baseUrl);
        await this.cache.set("auth", auth, 1000 * 60 * 60 * 24);
        return auth;
    }

    public async login(force : boolean): Promise<{ cookieStr: string; csrf: string; }> {
        if(!force) {
            const auth = await this.cache.get<AuthState>("auth");
            if(auth !== undefined) {
                return auth;
            }
        }

        return await this.loginSingular.run(() => this.#login());
    }

    public url(path : string | URL, params : URLSearchParams | RequestParameters = new URLSearchParams()): URL {
        if(typeof path === "string" && !path.startsWith("/")) {
            throw new Error("URL path must start with /");
        } 
        const url = typeof path === "string" ? new URL(path, this.baseUrl) : path;
        if(params instanceof URLSearchParams) {
            for(const [k, v] of params) {
                url.searchParams.append(k, v);
            }
        } else {
            for(const [key, value] of Object.entries(params)) {
                if(Array.isArray(value)) {
                    for(const item of value) {
                        if(item === undefined) continue;
                        url.searchParams.append(`${key}[]`, String(item))
                    }
                } else if(typeof value === "object") {
                    for(const [subKey, subValue] of Object.entries(value)) {
                        if(subValue === undefined) continue;
                        url.searchParams.append(`${key}[${subKey}]`, String(subValue))
                    }
                } else {
                    if(value === undefined) continue;
                    url.searchParams.append(key, String(value))
                }
            }
        }
        return url;
    }

    async #request(path : string | URL, _init?: RequestInit) {
        const { cookieStr, csrf } = await this.login(false);

        const init = {
            ...(_init ?? {}),
            headers: {
                ...(_init?.headers ?? {}),
                "cookie": cookieStr,
                "x-csrf-token": csrf
            }
        }        

        const url = this.url(path);

        const res = await fetch(url, init);
        
        if(res.status !== 401) return res;

        const auth = await this.login(true);

        init.headers.cookie = auth.cookieStr;
        init.headers["x-csrf-token"] = auth.csrf;
    
        return await fetch(url, init);
    }

    public request(path : string | URL, _init?: RequestInit): Promise<Response> {
        return this.queue.run(() => this.#request(path, _init));
    }

    async #get<T extends object>(path : string, params : URLSearchParams | RequestParameters) : Promise<T> {
        const url = this.url(`/admin/api` + path, params);

        url.searchParams.set("version", "2");
        
        const res = await this.request(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        }).then(x => x.json() as Promise<AgentboxAPIResponse<T>>);

        return new Promise<T>((resolve, reject) => {
            if("errors" in res.response) {
                reject(res.response.errors)
            } else {
                resolve(res.response as T);
            }
        });
    }

    public get<T, K extends string = string>(path : string, params : URLSearchParams | RequestParameters = new URLSearchParams()): Promise<T> {
        return this.#get<Record<K, T>>(path, params).then(x => Object.values(x).at(0)! as T);
    }

    async post<T>(path : string, body : Json): Promise<T> {
        const url = this.url("/admin/api" + path);
        url.searchParams.set("version", "2");

        const res = await this.request(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        return new Promise<T>((resolve, reject) => {
            if(res.status >= 300) {
                if(res.headers.get("Content-Type") === "application/json") {
                    reject(res.json())
                } else {
                    reject(res.statusText)
                }
            } else {
                if(res.headers.get("Content-Type") === "application/json") {
                    resolve(res.json())
                } else {
                    resolve(res.text() as Promise<T>)
                }
            }
        });
    }

    async put<T>(path : string, body : Json): Promise<T> {
        const url = this.url("/admin/api" + path);
        url.searchParams.set("version", "2");

        const res = await this.request(url, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        return new Promise<T>((resolve, reject) => {
            if(res.status >= 300) {
                if(res.headers.get("Content-Type") === "application/json") {
                    reject(res.json())
                } else {
                    reject(res.statusText)
                }
            } else {
                if(res.headers.get("Content-Type") === "application/json") {
                    resolve(res.json())
                } else {
                    resolve(res.text() as Promise<T>)
                }
            }
        });
    }

    async delete(path : string): Promise<boolean> {
        const url = this.url("/admin/api" + path);
        url.searchParams.set("version", "2");

        const res = await this.request(url, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            }
        });

        return new Promise<boolean>((resolve, reject) => {
            if(res.status >= 300) {
                reject(res.statusText)
            } else {
                resolve(res.status >= 200 && res.status < 300);
            }
        });
    }

    public async *search<T, K extends string = string>(path : string, _params : RequestParameters): AsyncGenerator<T, void, unknown> {
        const params = structuredClone(_params);
        params.limit = PAGE_SIZE;
        params.page = 1;
        let expectedCount = -1;
        let currentCount = 0;
        let errCount = 0;

        while(currentCount < expectedCount || params.page === 1) {
            if(errCount >= SEARCH_MAX_ERR_COUNT) {
                console.error("error Count max reached");
                break;
            }
            const res = await this.#get<Record<'items' | 'current' | 'last', string> & Record<K, T[]>>(path, params);

            expectedCount = parseInt(res.items);

            const key = Object.keys(res).filter(x => !DEFAULT_SEARCH_RESPONSE_KEYS.includes(x)).at(0) as K | undefined;
            if(!key) {
                throw new Error("Key not found");
            }

            if(res[key].length === 0) {
                errCount++;
            } else {
                errCount = 0;
            }

            yield* res[key];
            currentCount += res[key].length;

            params.page++;
        }
    }

    public async *searchInBackground<T, K extends string = string>(path : string, _params : RequestParameters): AsyncGenerator<T, void, unknown> {
        const params = structuredClone(_params);
        params.limit = PAGE_SIZE;

        const firstPageRes = await this.#get<Record<'items' | 'current' | 'last', string> & Record<K, T[]>>(path, params);
        const expectedPageCount = Math.ceil(parseInt(firstPageRes.items) / params.limit);
        const key = Object.keys(firstPageRes).filter(x => !DEFAULT_SEARCH_RESPONSE_KEYS.includes(x)).at(0) as K | undefined;
        if(!key) {
            throw new Error("Key not found");
        }
        
        const promises : Set<Promise<void>> = new Set();
        const items : Array<T> = [];

        let returnedCount = 0;
        
        for(let i = 1; i < expectedPageCount + 1; i++) {
            const currentParams = structuredClone(params);
            currentParams.page = i;
            const prom = this.#get<Record<'items' | 'current' | 'last', string> & Record<K, T[]>>(path, currentParams)
                .then(res => {
                    if(!(key in res)) {
                        throw new Error("Key not found");
                    }
                    items.push(...res[key]);
                    promises.delete(prom);
                })
            promises.add(prom);
        }

        while(returnedCount < parseInt(firstPageRes.items)) {
            while(items.length > 0) {
                yield items.shift()!;
                returnedCount++;
            }
            await sleep(100);
        }
    }

    public panel(type : string, panel_ref : string, _params? : URLSearchParams | RequestParameters): Promise<string> {
        const url = this.url("/admin/panel_lib.php", _params);
        url.searchParams.set("type", type);
        url.searchParams.set("panel_ref", panel_ref);
        url.searchParams.set("page", "1");
        url.searchParams.set("panel", "2");
        url.searchParams.set("hgt", "728");

        return this.request(url, {
            method: "POST"
        }).then(x => x.text());
    }
}
