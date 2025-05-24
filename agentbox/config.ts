import "@std/dotenv/load"

export const config = {
    MAX_REQUESTS: parseInt(Deno.env.get("AGENTBOX_MAX_REQUESTS") ?? "5")
} as const;