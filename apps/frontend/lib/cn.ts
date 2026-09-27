/** Joins class names, dropping falsy values. Replaces the shadcn `cn` helper. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
