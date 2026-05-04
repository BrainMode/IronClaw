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
import { login } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await login(formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>IronClaw</CardTitle>
        <CardDescription>Personal Fitness Coach. Login mit Email + Passwort.</CardDescription>
      </CardHeader>
      <form action={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              placeholder="kontakt@dennyweber.ch"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-(--color-destructive)" role="alert">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Anmelden…" : "Anmelden"}
          </Button>
          <Link
            href="/reset-password"
            className="text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
          >
            Passwort vergessen?
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
