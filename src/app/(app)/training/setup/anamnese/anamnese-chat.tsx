"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useChat } from "ai/react";
import Link from "next/link";

export function AnamneseChat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: "/api/coach/anamnese",
    initialMessages: [
      {
        id: "greet",
        role: "assistant",
        content:
          "Hi, ich bin IronClaw Coach. Lass uns kurz dein Trainings-Profil sortieren — danach generiere ich dir den passenden Plan.\n\n**Frage 1/5:** Wie willst du trainieren — eher Iron Mike effizient (1–2 harte Sätze, 6 Reps, ~30–45 min) oder klassisch (3 Sätze × 8–12 Reps, ~60–75 min)?",
      },
    ],
    maxSteps: 8,
  });

  // Anamnese is "done" once the complete_anamnese tool was invoked successfully
  const anamneseDone = messages.some(
    (m) =>
      m.role === "assistant" &&
      m.toolInvocations?.some((ti) => ti.toolName === "complete_anamnese" && ti.state === "result"),
  );

  return (
    <div className="space-y-4 pb-32">
      <div className="space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-lg px-4 py-3 max-w-[90%]",
              m.role === "user"
                ? "ml-auto bg-(--color-primary) text-(--color-primary-foreground)"
                : "bg-(--color-card) border border-(--color-border)",
            )}
          >
            {m.content && (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
            )}
            {m.toolInvocations?.map((ti) => (
              <div
                key={ti.toolCallId}
                className="text-xs text-(--color-muted-foreground) italic mt-2 border-t border-(--color-border) pt-2"
              >
                {ti.state === "result" ? (
                  ti.toolName === "set_training_preferences" ? (
                    <>✓ Profil gespeichert</>
                  ) : ti.toolName === "complete_anamnese" ? (
                    <>✓ Anamnese abgeschlossen</>
                  ) : (
                    <>✓ {ti.toolName}</>
                  )
                ) : (
                  <>⏳ {ti.toolName}…</>
                )}
              </div>
            ))}
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="rounded-lg px-4 py-3 max-w-[90%] bg-(--color-card) border border-(--color-border)">
            <div className="text-sm text-(--color-muted-foreground)">Coach denkt nach…</div>
          </div>
        )}
      </div>

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-(--color-destructive)">Fehler: {error.message}</p>
          </CardContent>
        </Card>
      )}

      {anamneseDone ? (
        <div className="fixed bottom-24 left-0 right-0 px-4">
          <div className="max-w-3xl mx-auto">
            <Button asChild size="lg" className="w-full">
              <Link href="/training/setup">Weiter zu Equipment-Setup →</Link>
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="fixed bottom-24 left-0 right-0 px-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder="Antwort tippen…"
              disabled={isLoading}
              autoFocus
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              Senden
            </Button>
          </div>
        </form>
      )}

      <p className="text-xs text-(--color-muted-foreground) text-center">
        <Link href="/training/setup" className="underline">
          Anamnese überspringen — direkt zum Equipment
        </Link>
      </p>
    </div>
  );
}
