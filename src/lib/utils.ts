import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// woke2 impl LIB-CN1, LIB-CN2, LIB-CN3
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
