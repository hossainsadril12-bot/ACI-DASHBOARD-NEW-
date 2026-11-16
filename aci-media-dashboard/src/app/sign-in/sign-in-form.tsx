"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction, type SignInState } from "./actions";

export function SignInForm() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, { error: null });
  return (
    <form action={formAction} className="grid gap-4" aria-busy={pending}>
      <div className="grid gap-1.5">
        <Label htmlFor="user">User name</Label>
        <Input id="user" name="user" autoComplete="username" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
