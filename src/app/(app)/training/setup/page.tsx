import { getUserEquipment } from "@/lib/training/queries";
import { SetupWizard } from "./setup-wizard";

export default async function TrainingSetupPage() {
  const current = await getUserEquipment();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Trainings-Setup</h2>
        <p className="text-(--color-muted-foreground)">
          Welches Equipment hast du? Wir generieren daraus einen Iron-Mike-Plan (Ganzkörper 2× pro
          Woche, 5-7 Reps RIR=0).
        </p>
      </div>
      <SetupWizard initial={current} />
    </div>
  );
}
