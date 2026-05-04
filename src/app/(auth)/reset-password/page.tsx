"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState, useTransition } from "react";
import { requestPasswordReset } from "../login/actions";

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await requestPasswordReset(formData);
      if (!result.ok) setError(result.error);
      else setSuccess(true);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passwort zurücksetzen</CardTitle>
        <CardDescription>Wir schicken dir einen Reset-Link per Email.</CardDescription>
      </CardHeader>
      <form action={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>
          {error && (
            <p className="text-sm text-(--color-destructive)" role="alert">
              {error}
            </p>
          )}
          {success && (
            <output className="block text-sm text-(--color-success)">
              Falls die Email registriert ist, kommt gleich ein Link.
            </output>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Senden…" : "Link senden"}
          </Button>
          <Link
            href="/login"
            className="text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
          >
            Zurück zum Login
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
