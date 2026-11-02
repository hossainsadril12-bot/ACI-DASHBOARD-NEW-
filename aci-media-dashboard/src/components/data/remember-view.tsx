"use client";

import { useEffect } from "react";
import { BRAND_COOKIE, KEEP_SECONDS, MONTH_COOKIE } from "@/lib/view-cookies";

/**
 * Stores the month (and brand) of the page on screen, so the next refresh or menu click opens the same view.
 * It runs only when the page is really shown, never for a background prefetch.
 * `brand: false` leaves the remembered brand alone (pages without a shared brand filter).
 */
export function RememberView({ month, brandId, brand = true }: { month: string; brandId?: number; brand?: boolean }) {
  useEffect(() => {
    const keep = `; path=/; max-age=${KEEP_SECONDS}; samesite=lax`;
    document.cookie = `${MONTH_COOKIE}=${month}${keep}`;
    if (brand) document.cookie = brandId ? `${BRAND_COOKIE}=${brandId}${keep}` : `${BRAND_COOKIE}=; path=/; max-age=0`;
  }, [month, brandId, brand]);
  return null;
}
