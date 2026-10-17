import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Same helper shadcn / KokonutUI components expect at "@/lib/utils".
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
