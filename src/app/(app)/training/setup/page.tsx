import { getLocations } from "@/lib/training/queries";
import { SetupWizard } from "./setup-wizard";

export default async function TrainingSetupPage() {
  const locations = await getLocations();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Trainings-Setup</h2>
        <p className="text-(--color-muted-foreground)">
          Definiere deine Trainings-Orte (Gym, Home, Travel) mit dem dort verfügbaren Equipment. Pro
          Location wird ein passender Plan generiert — Iron Mike GK 2× fürs Gym, Home Quick 30 fürs
          Home Gym.
        </p>
      </div>
      <SetupWizard initial={locations} />
    </div>
  );
}
