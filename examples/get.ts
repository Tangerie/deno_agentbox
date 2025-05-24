import { AgentboxSession } from "../agentbox/session.ts";
import "@std/dotenv/load";

const session = AgentboxSession.get(
    Deno.env.get("TEST_USERNAME")!,
    Deno.env.get("TEST_PASSWORD")!,
    Deno.env.get("TEST_BASE_URL")!
);

console.log(await session.get("/contacts/1"))
console.log(await Promise.all(Array.from(Array(10)).map((_, i) => session.get(`/contacts/${i + 1}`).catch(() => undefined))))