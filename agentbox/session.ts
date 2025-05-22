import { authenticate } from "./auth.ts";
import { Cache, CacheScope } from "./cache.ts";
import { config } from "./config.ts";

type AuthState = Awaited<ReturnType<typeof authenticate>>;

const MAX_REQUESTS = 5;

export class AgentboxSession {
    private static sessions : Record<string, AgentboxSession> = {};

    private cache : CacheScope;
    private username : string;
    private password : string;
    private baseUrl : string;

    private numRunningRequests;
    private curRequests : Array<[string | URL, RequestInit | undefined, (res : Response) => void, (err : any) => void]>;

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

    public async login(force : boolean) {
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

        const url = new URL(path, this.baseUrl)

        const res = await fetch(url, init);
        
        if(res.status !== 401) return res;

        const auth = await this.login(true);

        init.headers.cookie = auth.cookieStr;
        init.headers["x-csrf-token"] = auth.csrf;
    
        return await fetch(url, init);
    }

    async tryNextRequest() {
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

    public request(path : string | URL, _init?: RequestInit) {
        return new Promise<Response>((resolve, reject) => {
            this.curRequests.push([path, _init, resolve, reject]);
            this.tryNextRequest();
        })
    }

}
