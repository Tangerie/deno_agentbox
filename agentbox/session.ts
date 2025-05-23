import { authenticate } from "./auth.ts";
import { Cache, type CacheScope } from "./cache.ts";
import { config } from "./config.ts";
import { DEFAULT_SEARCH_RESPONSE_KEYS, MAX_REQUESTS, PAGE_SIZE, SEARCH_MAX_ERR_COUNT } from "./constants.ts";
import type { AgentboxAPIResponse, AuthState, Json } from "./internal_types.ts";
import type { RequestParameters } from "./types.ts";

export class AgentboxSession {
    private static sessions : Record<string, AgentboxSession> = {};

    private cache : CacheScope;
    private username : string;
    private password : string;
    private baseUrl : string;

    private numRunningRequests;
    private curRequests : Array<[string | URL, RequestInit | undefined, (res : Response) => void, (err : unknown) => void]>;

    private loginResolvers : Array<(auth : AuthState) => void>;

    private constructor(username : string, password : string, baseUrl : string) {
        this.username = username;
        this.password = password;
        this.baseUrl = baseUrl;
        this.cache = Cache.scope(this.username);
        this.curRequests = [];
        this.numRunningRequests = 0;
        this.loginResolvers = []
    }

    public static get(username : string, password? : string, baseUrl? : string) : AgentboxSession {
        if(username in AgentboxSession.sessions) {
            return AgentboxSession.sessions[username];
        }

        if(!password) {
            throw new Error("Password required");
        }

        AgentboxSession.sessions[username] = new AgentboxSession(username, password, baseUrl ?? config.BASE_URL);
        return AgentboxSession.sessions[username]!;
    }

    public async login(force : boolean): Promise<{ cookieStr: string; csrf: string; }> {
        if(!force) {
            const auth = await this.cache.get<AuthState>("auth", undefined);
            if(auth !== undefined) {
                return auth;
            }
        }
        if(this.loginResolvers.length > 0) {
            return new Promise<AuthState>((resolve) => {
                this.loginResolvers.push(resolve);
            })
        }

        this.loginResolvers.push(() => {});
        const auth = await authenticate(this.username, this.password, this.baseUrl);

        // Expire in 24 Hours
        await this.cache.set("auth", auth, 1000 * 60 * 60 * 24);

        for(const resolver of this.loginResolvers) {
            resolver(auth);
        }

        this.loginResolvers = [];

        return auth;
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
                        url.searchParams.append(`${key}[]`, String(item))
                    }
                } else if(typeof value === "object") {
                    for(const [subKey, subValue] of Object.entries(value)) {
                        url.searchParams.append(`${key}[${subKey}]`, String(subValue))
                    }
                } else {
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

    private async tryNextRequest() {
        if(this.curRequests.length === 0) return;
        if(this.numRunningRequests >= MAX_REQUESTS) return;
        const [ path, _init, resolve, reject ] = this.curRequests.shift()!;
        this.numRunningRequests++;
        try {
            const res = await this.#request(path, _init);
            resolve(res);
        } catch(err) {
            reject(err);
        } finally {
            this.numRunningRequests--;
            await this.tryNextRequest();
        }
    }

    public request(path : string | URL, _init?: RequestInit): Promise<Response> {
        return new Promise<Response>((resolve, reject) => {
            this.curRequests.push([path, _init, resolve, reject]);
            this.tryNextRequest();
        })
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

    async post(path : string, body : Json): Promise<boolean> {
        const url = this.url("/admin/api" + path);
        url.searchParams.set("version", "2");

        const res = await this.request(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        return new Promise<boolean>((resolve, reject) => {
            if(res.status >= 300) {
                reject(res.statusText)
            } else {
                resolve(res.status >= 200 && res.status < 300);
            }
        });
    }

    async put(path : string, body : Json): Promise<boolean> {
        const url = this.url("/admin/api" + path);
        url.searchParams.set("version", "2");

        const res = await this.request(url, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        return new Promise<boolean>((resolve, reject) => {
            if(res.status >= 300) {
                reject(res.statusText)
            } else {
                resolve(res.status >= 200 && res.status < 300);
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

    public get<T, K extends string = string>(path : string, params : URLSearchParams | RequestParameters = new URLSearchParams()): Promise<T> {
        return this.#get<Record<K, T>>(path, params).then(x => Object.values(x).at(0)! as T);
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
}
