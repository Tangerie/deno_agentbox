import { AgentboxSession } from "../agentbox/Session.ts";
import "@std/dotenv/load";

const session = AgentboxSession.get(
    Deno.env.get("TEST_USERNAME")!,
    Deno.env.get("TEST_PASSWORD")!
);

console.log(await Promise.all([
    session.request("/admin/api/contacts/1?version=2", {
        headers: {
            "Content-Type": "application/json"
        }
    }).then(x => x.json()),
    session.request("/admin/api/contacts/3?version=2", {
        headers: {
            "Content-Type": "application/json"
        }
    }).then(x => x.json()),
]));