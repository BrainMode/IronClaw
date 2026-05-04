"use client";

import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { startNextSessionForLocation } from "./actions";

interface StartSessionButtonProps {
  locationId: string;
  locationLabel: string;
}

export function StartSessionButton({ locationId, locationLabel }: StartSessionButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      disabled={isPending}
      onClick={() => startTransition(() => startNextSessionForLocation(locationId))}
      className="w-full"
      size="lg"
    >
      {isPending ? "Starte…" : `Heute hier trainieren (${locationLabel})`}
    </Button>
  );
}
