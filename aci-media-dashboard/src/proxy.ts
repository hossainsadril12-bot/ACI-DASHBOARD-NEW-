import { NextResponse, type NextRequest } from "next/server";
import { BRAND_COOKIE, MONTH_COOKIE, MONTH_RE } from "@/lib/view-cookies";

// When the address has no month or brand, render the page with the ones the person last looked at,
// so a refresh, a menu click or a quick action keeps the same view. The address bar stays as typed.
// This only reads the remembered view; the page itself stores it (RememberView), so background
// prefetches of links with other months can never change it.
export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const savedMonth = request.cookies.get(MONTH_COOKIE)?.value;
  const savedBrand = request.cookies.get(BRAND_COOKIE)?.value;

  const target = new URL(url);
  if (!url.searchParams.has("month") && savedMonth && MONTH_RE.test(savedMonth)) target.searchParams.set("month", savedMonth);
  // Competitors keeps its own brand choice, so the shared brand does not apply there.
  if (url.pathname !== "/competitors" && !url.searchParams.has("brand") && savedBrand && /^\d+$/.test(savedBrand)) {
    target.searchParams.set("brand", savedBrand);
  }
  return target.search === url.search ? NextResponse.next() : NextResponse.rewrite(target);
}

// Only the pages that have a month (and brand) filter.
export const config = {
  matcher: ["/", "/plan", "/spend", "/performance", "/digital", "/competitors"],
};
