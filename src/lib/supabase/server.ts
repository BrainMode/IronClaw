/**
 * Server-side Supabase client (Server Components, Server Actions, Route Handlers).
 * Bound to the request's cookies — RLS sees the authenticated user.
 */
import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookiesToSet = { name: string; value: string; options?: CookieOptions }[];

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies — middleware handles refresh.
          }
        },
      },
    },
  );
}
