import { NextResponse, type NextRequest } from "next/server";

// Remember the month and brand a person last chose, so a refresh, a menu click or a quick action
// shows the same month instead of jumping back to the current one.
export const MONTH_COOKIE = "aci-month";
export const BRAND_COOKIE = "aci-brand";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const KEEP = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 60 };

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const month = url.searchParams.get("month");
  const brand = url.searchParams.get("brand");
  const savedMonth = request.cookies.get(MONTH_COOKIE)?.value;
  const savedBrand = request.cookies.get(BRAND_COOKIE)?.value;

  // No month or brand in the address: render with the remembered ones (the address bar stays as typed).
  const target = new URL(url);
  if (month === null && savedMonth && MONTH_RE.test(savedMonth)) target.searchParams.set("month", savedMonth);
  if (brand === null && savedBrand && /^\d+$/.test(savedBrand)) target.searchParams.set("brand", savedBrand);
  const res = target.search === url.search ? NextResponse.next() : NextResponse.rewrite(target);

  // A month or brand in the address is a new choice: remember it ("All brands" sends an empty brand).
  if (month && MONTH_RE.test(month)) res.cookies.set(MONTH_COOKIE, month, KEEP);
  if (brand !== null) {
    if (/^\d+$/.test(brand)) res.cookies.set(BRAND_COOKIE, brand, KEEP);
    else res.cookies.delete(BRAND_COOKIE);
  }
  return res;
}

// Only the pages that have a month and brand filter.
export const config = {
  matcher: ["/", "/plan", "/spend", "/performance", "/digital", "/competitors"],
};
