import { AgentboxSession } from "../agentbox/session.ts";
import "@std/dotenv/load";

const session = AgentboxSession.get(
    Deno.env.get("TEST_USERNAME")!,
    Deno.env.get("TEST_PASSWORD")!,
    {
        clientId: Deno.env.get("REAPIT_CLIENT_ID")!,
        oAuthUrl: Deno.env.get("REAPIT_OAUTH_URL")!,
        redirectUrl: Deno.env.get("REAPIT_REDIRECT_URL")!,
        oldOfficeId: Deno.env.get("REAPIT_OLD_OFFICE_NAME")!,
    }
);
await session.login(false);

console.log(await session.get("/contacts/1"))
console.log(await Promise.all(Array.from(Array(10)).map((_, i) => session.get(`/contacts/${i + 1}`).catch(() => undefined))))