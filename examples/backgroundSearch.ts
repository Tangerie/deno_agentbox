import { type RequestParameters, AgentboxSession } from "../agentbox/mod.ts";
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

const params : RequestParameters = {
    filter: {
        status: "all",
        // modifiedAfter: new Date().toISOString().split("T")[0]
    }
}

let startTime = performance.now();
const cnt = await Array.fromAsync(session.searchInBackground("/contacts", params)).then(x => x.length);
console.log("searchInBackground", performance.now() - startTime, "ms");
startTime = performance.now();
await Array.fromAsync(session.search("/contacts", params));
console.log("search", performance.now() - startTime, "ms");
console.log(cnt, "Items")
