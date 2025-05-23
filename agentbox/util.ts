import type { SingleOrMany } from "./internal_types.ts";

export function asArray<T>(data : SingleOrMany<T>) {
    return Array.isArray(data) ? data : [data];
}

export function *iterMap<I, O>(generator : Generator<I>, fn : (item : I, index : number) => O) {
    let i = 0;
    for (const item of generator) {
        yield fn(item, i);
        i++;
    }
}

export async function *asyncIterMap<I, O>(generator : AsyncGenerator<I>, fn : (item : I, index : number) => O | Promise<O>) {
    let i = 0;
    for await(const item of generator) {
        yield await fn(item, i);
        i++;
    }
}