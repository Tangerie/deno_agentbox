import { Cache } from "../agentbox/cache.ts";

await Cache.set(["scope", "test"], 456);
await Cache.set(["scope", "new", "test"], 467856);

const scope = Cache.scope("scope").scope("new");

console.log(await Array.fromAsync(await scope.keys()));

console.log(await scope.get("test", 123));
console.log(await Cache.get("test", 123));
console.log(await Array.fromAsync(await Cache.list()));

await scope.clear();

console.log(await Array.fromAsync(await Cache.list()));

await Cache.clear();

console.log(await Array.fromAsync(await Cache.list()));