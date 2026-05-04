import { AppNav } from "@/components/app-nav";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { logout } from "../(auth)/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Determine role from household_members. RLS handles per-user filtering.
  const { data: membership } = await supabase
    .from("household_members")
    .select("role, household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = membership?.role ?? null;

  return (
    <div className="min-h-screen flex flex-col pb-24">
      <header className="border-b border-(--color-border) px-4 py-3 flex items-center justify-between">
        <h1 className="font-semibold tracking-tight">IronClaw</h1>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
          >
            Logout
          </button>
        </form>
      </header>

      <main className="flex-1 px-4 py-6 max-w-3xl w-full mx-auto">{children}</main>

      <AppNav role={role} />
    </div>
  );
}
