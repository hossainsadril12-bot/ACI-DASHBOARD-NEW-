import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Admin sign in" };

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-sm py-6 md:py-10">
      <Card>
        <CardHeader>
          <h1>
            <CardTitle className="text-xl">Admin sign in</CardTitle>
          </h1>
          <CardDescription>Only the admin signs in. Everyone else can read every page without signing in.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
