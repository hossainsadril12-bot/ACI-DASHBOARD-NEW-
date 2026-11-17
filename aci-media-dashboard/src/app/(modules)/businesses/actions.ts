"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getStore } from "@/store/client";
import {
  createBrand, createBusiness, renameBrand, renameBusiness, setAtlCategory, setAtlHidden, setBrandHidden, setBusinessHidden,
} from "@/store/catalog";
import { ValidationError } from "@/server/errors";
import { toActionError, type ActionState } from "@/server/action-state";

/**
 * Refreshes the list page and every business page under it.
 * The pages sit in the (modules) route group, so the group must be in the path.
 */
const done = (): ActionState => {
  revalidatePath("/(modules)/businesses", "layout");
  return { error: null, ok: true };
};

const text = (fd: FormData, key: string): string => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

const hiddenOf = (fd: FormData) => text(fd, "hidden") === "true";

function brandIdOf(fd: FormData): number {
  const id = Number(text(fd, "id"));
  if (!Number.isSafeInteger(id) || id < 1) throw new ValidationError("That brand doesn't exist.");
  return id;
}

/** One name per line; blank lines dropped. The store cleans and checks the names. */
const linesOf = (s: string) => s.split(/\r?\n/).filter((l) => l.trim() !== "");

export async function createBusinessAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await createBusiness(await getStore(), text(fd, "name"));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function renameBusinessAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await renameBusiness(await getStore(), text(fd, "slug"), text(fd, "name"));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function setBusinessHiddenAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await setBusinessHidden(await getStore(), text(fd, "slug"), hiddenOf(fd));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function createBrandAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await createBrand(await getStore(), text(fd, "businessSlug"), text(fd, "name"));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function renameBrandAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await renameBrand(await getStore(), brandIdOf(fd), text(fd, "name"));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function setBrandHiddenAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await setBrandHidden(await getStore(), brandIdOf(fd), hiddenOf(fd));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function setAtlCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await setAtlCategory(await getStore(), text(fd, "slug"), {
      businessSlug: text(fd, "businessSlug"),
      ownBrands: linesOf(text(fd, "ownBrands")),
    });
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function setAtlHiddenAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await setAtlHidden(await getStore(), text(fd, "slug"), hiddenOf(fd));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}
