import { type RequestParameters, AgentboxSession } from "../agentbox/mod.ts";
import "@std/dotenv/load";

const session = AgentboxSession.get(
    Deno.env.get("TEST_USERNAME")!,
    Deno.env.get("TEST_PASSWORD")!,
    Deno.env.get("TEST_BASE_URL")!
);

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