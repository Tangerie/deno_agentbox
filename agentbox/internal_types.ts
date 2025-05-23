import type { authenticate } from "./auth.ts";

export type SingleOrMany<T> = Array<T> | T;
export type AuthState = Awaited<ReturnType<typeof authenticate>>;

export type AgentboxAPIResponse<T> = { response: T | Record<"errors", Array<Record<"code"| "title" | "detail", string>>> }

export interface Json {
    [x: string]: string|number|boolean|Date|Json|JsonArray;
}
interface JsonArray extends Array<string|number|boolean|Date|Json|JsonArray> { }