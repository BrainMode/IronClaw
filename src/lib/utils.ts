import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind class merging utility used by all shadcn-style components.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
