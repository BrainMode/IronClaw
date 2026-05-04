"use client";

import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { startNextSession } from "./actions";

export function StartSessionButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      disabled={isPending}
      onClick={() => startTransition(() => startNextSession())}
      className="w-full"
      size="lg"
    >
      {isPending ? "Starte…" : "Session starten"}
    </Button>
  );
}
