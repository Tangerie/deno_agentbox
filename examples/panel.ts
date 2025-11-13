import { AgentboxSession } from "../agentbox/mod.ts";
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

console.log(await session.panel("c_card", "c_tabs", {
    cid: 29165
}))