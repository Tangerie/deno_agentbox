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

const contactIncludes = [
    "clientRef",
    "addressTo",
    "legalName",
    "fax",
    "streetAddress",
    "postalAddress",
    "letterAddressBlock",
    "prefContactMethod",
    "comments",
    "lastContacted",
    "attachedRelatedStaffMembers",
    "contactClasses",
    "subscriptions",
    "keyDates",
    "communicationRestrictions"
];

const params : RequestParameters = {
    include: contactIncludes,
    filter: {
        status: "all",
        modifiedAfter: new Date().toISOString().split("T")[0]
    }
}

for await(const contact of session.search("/contacts", params)) {
    console.log(contact);
}