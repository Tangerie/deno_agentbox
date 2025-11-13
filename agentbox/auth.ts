import makeFetchCookie from 'fetch-cookie';
import { COMMON_HEADERS } from "./constants.ts";
import { encodeBase64 } from "@std/encoding/base64";


export interface OAuthConfig {
    clientId : string;
    oAuthUrl : string;
    redirectUrl : string;
    oldOfficeId : string;
}

export async function authenticate(username : string, password : string, config : OAuthConfig) {
    const cookieJar = new makeFetchCookie.toughCookie.CookieJar();
    cookieJar.removeAllCookiesSync();
    const fetchCookie = makeFetchCookie(fetch, cookieJar);

    const loginUrl = `${config.oAuthUrl}/login?response_type=code&client_id=${config.clientId}&redirect_uri=${config.redirectUrl}`;

    let res = await fetchCookie(loginUrl, {
        headers: { ...COMMON_HEADERS },
        redirect: "manual"
    });

    let csrf = res.headers.getSetCookie().find(x => x.startsWith("XSRF-TOKEN="))!.split("=")[1].split(";")[0]

    res = await fetchCookie(loginUrl, {
        method: "POST",
        headers: {
            ...COMMON_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        redirect: "manual",
        body: new URLSearchParams({
            "_csrf": csrf,
            "username": username,
            "password": password
        })
    });

    const authCode = res.headers.get("location")!.split("?code=").at(-1)!;
    // console.log("Auth Code", authCode);

    res = await fetchCookie(res.headers.get("location")!, {
        headers: { ...COMMON_HEADERS },
        redirect: "manual"
    });

    const dec2hex = (dec: number): string => ('0' + dec.toString(16)).substr(-2)
    const array = new Uint32Array(56)
    crypto.getRandomValues(array)
    const code_verifier = Array.from(array, dec2hex).join('')

    res = await fetchCookie(`${config.oAuthUrl}/token`, {
        method: "POST",
        headers: {
            ...COMMON_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        redirect: "manual",
        body: new URLSearchParams({
            "redirect_uri": config.redirectUrl,
            "client_id": config.clientId,
            "grant_type": "authorization_code",
            "code": authCode,
            "code_challenge_method": "S256",
            "code_verifier": code_verifier
        })
    });

    const rootAuth = await res.json();

    const authHeader = `Bearer ` + rootAuth.access_token

    
    res = await fetchCookie("https://api.sales.reapit.com.au/organisations", {
        headers: {
            ...COMMON_HEADERS,
            "authorization": authHeader,
            "reapit-api-version": "1"
        }
    });

    const orgData = await res.json().then(x => x.data[0]);
    const orgId = orgData.id;
    const orgUrl = orgData.url;

    // console.log("Org ID",  orgId);

    res = await fetchCookie("https://api.sales.reapit.com.au/oauth/token", {
        method: "POST",
        headers: {
            ...COMMON_HEADERS,
            "Content-Type": "application/json",
            "authorization": authHeader,
            "reapit-api-version": "1"
        },
        body: JSON.stringify({
            grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
            subject_token: rootAuth.access_token,
            subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
            client_id: config.clientId,
            organisation_id: orgId,
            requested_subject: null
        })
    });

    const orgAccessToken = await res.json().then(x => x.access_token)

    const clientId = encodeBase64(orgUrl);

    res = await fetchCookie("https://api.agentboxcrm.com.au/configurations?version=2", {
        headers: {
            ...COMMON_HEADERS,
            authorization: `Bearer ${orgAccessToken}`,
            accept: "application/json",
            "x-client-id": clientId
        }
    });

    res = await fetchCookie(`https://${config.oldOfficeId}.agentboxcrm.com.au/admin/api/crm/auth`, {
        method: "POST",
        headers: {
            ...COMMON_HEADERS,
            "content-type": "application/json",
            "accept": "application/json"
        },
        body: JSON.stringify({
            token: orgAccessToken
        })
    });

    const { token } = await res.json()

    res = await fetchCookie(`${config.redirectUrl}/${config.oldOfficeId}/admin/login/crm/${token}`, {
        headers: {
            ...COMMON_HEADERS,
        },
        redirect: "manual"
    });

    

    res = await fetchCookie(res.headers.get("location")!, {
        headers: {
            ...COMMON_HEADERS,
        },
        redirect: "manual"
    });

    const cookieStr = await cookieJar.getCookieString(`${config.redirectUrl}/${config.oldOfficeId}/admin`);
    csrf = cookieStr.split(";").map(x => x.trim()).find(x => x.startsWith("_csrf="))!.split("=").at(-1)!;
    

    return {
        cookieStr, csrf, baseUrl: `${config.redirectUrl}/${config.oldOfficeId}`
    }
}

import { load } from '@std/dotenv';

if(import.meta.main) {
    await load({ export: true });
    console.log(await authenticate(
        Deno.env.get("TEST_USERNAME")!,
        Deno.env.get("TEST_PASSWORD")!,
        {
            clientId: Deno.env.get("REAPIT_CLIENT_ID")!,
            oAuthUrl: Deno.env.get("REAPIT_OAUTH_URL")!,
            redirectUrl: Deno.env.get("REAPIT_REDIRECT_URL")!,
            oldOfficeId: Deno.env.get("REAPIT_OLD_OFFICE_NAME")!,
        }
    ))
}