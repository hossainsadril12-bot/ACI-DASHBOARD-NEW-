// The month and brand a person last looked at, kept so a refresh or a menu click shows the same view.
// The browser writes them (only for a page actually shown, never for a background prefetch);
// src/proxy.ts only reads them.
export const MONTH_COOKIE = "aci-month";
export const BRAND_COOKIE = "aci-brand";
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const KEEP_SECONDS = 60 * 60 * 24 * 60;
