/**
 * Who may do what. First release: everyone reads everything, only the admin writes.
 * Per-person access (staff ID, sections, businesses, brands) plugs in here later. It is switched off.
 */
export const PER_PERSON_ACCESS = false as const;

export type Viewer = { kind: "admin" } | { kind: "viewer" };
export type Action = "read" | "write";

export function can(viewer: Viewer, action: Action): boolean {
  return action === "read" ? true : viewer.kind === "admin";
}
