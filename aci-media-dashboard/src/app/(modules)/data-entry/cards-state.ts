import { UPLOAD_CARDS, type UploadCard } from "@/lib/ingest/cards";
import type { ActiveVersion } from "@/store/datasets";
import { emptyDraft, whenDhaka, type BusinessOption, type RowDraft } from "./logic";

// Pure: which cards Upload Data shows (spec 3.2, 3.3) and what each one shows now.

export type CardState = { id: string; card: UploadCard; title: string; business: { slug: string; name: string } | null; nowShowing: string };

export const NOTHING_YET = "nothing uploaded yet";
/** The title of the Digital card for a business with no Digital data, once another business has its own card. */
export const ANOTHER_BUSINESS = "Digital · another business";

/** "<file> · <date and time>", or "Manual edit · <date and time>" for a typed version. */
function shown(v: ActiveVersion): string {
  const when = whenDhaka(v.createdAt);
  return v.source === "manual" ? `Manual edit · ${when}` : `${v.fileName ?? v.label} · ${when}`;
}

/** "N categories · last upload <file> · <date and time>" from the active ATL versions. */
function atlLine(list: ActiveVersion[]): string {
  if (list.length === 0) return NOTHING_YET;
  const last = list.reduce((a, v) => (v.createdAt > a.createdAt ? v : a));
  const n = `${list.length} ${list.length === 1 ? "category" : "categories"}`;
  return last.source === "manual" ? `${n} · ${shown(last)}` : `${n} · last upload ${shown(last)}`;
}

/**
 * The cards in his app's order. Digital: one card per visible business that has an active digital:<slug> version
 * (sorted by name, business fixed), then one card for another business. Every other card reads the dataset keyed
 * by its type.
 */
export function cardStates(active: ActiveVersion[], businesses: { slug: string; name: string; hidden?: boolean }[]): CardState[] {
  const byKey = new Map(active.map((v) => [v.datasetKey, v] as const));
  const out: CardState[] = [];
  for (const card of UPLOAD_CARDS) {
    if (card.type === "atl") {
      out.push({ id: card.key, card, title: card.title, business: null, nowShowing: atlLine(active.filter((v) => v.datasetKey.startsWith("atl:"))) });
      continue;
    }
    if (card.type === "digital") {
      const visible = businesses.filter((b) => !b.hidden).sort((a, b) => a.name.localeCompare(b.name));
      let own = 0;
      for (const b of visible) {
        const v = byKey.get(`digital:${b.slug}`);
        if (!v) continue;
        own++;
        out.push({ id: `digital:${b.slug}`, card, title: `Digital · ${b.name}`, business: { slug: b.slug, name: b.name }, nowShowing: shown(v) });
      }
      out.push({ id: card.key, card, title: own ? ANOTHER_BUSINESS : card.title, business: null, nowShowing: NOTHING_YET });
      continue;
    }
    const v = byKey.get(card.type);
    out.push({ id: card.key, card, title: card.title, business: null, nowShowing: v ? shown(v) : NOTHING_YET });
  }
  return out;
}

/** A new file's draft on this card: a business's own Digital card sends that business, so it is never asked. */
export function startDraft(state: CardState): RowDraft {
  return state.business ? { ...emptyDraft(), business: { value: state.business.slug, newName: "" } } : emptyDraft();
}

/**
 * The businesses the Digital card for another business offers for a file: not one with its own Digital card, as a
 * pick there would replace that business's data from the wrong card. The server still checks the file's brands.
 */
export function anotherBusinessOptions(states: CardState[], businesses: BusinessOption[]): BusinessOption[] {
  const own = new Set(states.flatMap((s) => (s.business ? [s.business.slug] : [])));
  return businesses.filter((b) => !own.has(b.slug));
}
