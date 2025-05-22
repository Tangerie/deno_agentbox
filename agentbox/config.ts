import "@std/dotenv/load"

export const config = {
    CACHE_DIR: Deno.env.get("AGENTBOX_CACHE_DIR") ?? ".cache",
    CACHE_CLEAN: Deno.env.get("AGENTBOX_CACHE_CLEAN") === "1",
    BASE_URL: Deno.env.get("AGENTBOX_BASE_URL") ?? ""
} as const;