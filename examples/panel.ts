import { AgentboxSession } from "../agentbox/mod.ts";
import "@std/dotenv/load";

const session = AgentboxSession.get(
    Deno.env.get("TEST_USERNAME")!,
    Deno.env.get("TEST_PASSWORD")!,
    Deno.env.get("TEST_BASE_URL")!
);

console.log(await session.panel("c_card", "c_tabs", {
    cid: 10008
}))