import makeFetchCookie from 'fetch-cookie';
import { COMMON_HEADERS } from "./constants.ts";

export async function authenticate(username : string, password : string, baseUrl : string) {
    const cookieJar = new makeFetchCookie.toughCookie.CookieJar();
    cookieJar.removeAllCookiesSync();
    const fetchCookie = makeFetchCookie(fetch, cookieJar);

    // 01
    let res = await fetchCookie(baseUrl + "/admin/login", {
        headers: COMMON_HEADERS,
        redirect: "manual"
    });

    const authLocation = res.headers.get("location")!;

    // 02
    res = await fetchCookie(authLocation, {
        headers: COMMON_HEADERS,
        redirect: "manual"
    });

    const xsrf_auth = res.headers.getSetCookie().find(x => x.startsWith("XSRF-TOKEN="))!.split(";")[0].split("=")[1];

    // 03
    res = await fetchCookie(authLocation, {
        method: "POST",
        headers: {
        ...COMMON_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded"
        },
        redirect: "manual",
        body: new URLSearchParams({
        "_csrf": xsrf_auth,
        "username": username,
        "password": password
        })
    });

    // 04
    res = await fetchCookie(res.headers.get("location")!, {
        headers: COMMON_HEADERS,
        redirect: "manual"
    });

    // 05
    res = await fetchCookie(res.headers.get("location")!, {
        headers: COMMON_HEADERS,
        redirect: "manual"
    });

    // 06
    res = await fetchCookie(baseUrl + res.headers.get("location"), {
        headers: {
        ...COMMON_HEADERS
        },
        redirect: "manual"
    })

    const cookieStr = await cookieJar.getCookieString(baseUrl + "/admin/master");
    const csrf = cookieStr.split(";").map(x => x.trim()).find(x => x.startsWith("_csrf="))!.split("=").at(-1)!;
    return { cookieStr, csrf };
}