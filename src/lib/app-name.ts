/**
 * Trims a salon display name to a safe home-screen label length.
 * iOS and Android truncate long app names (~12 chars) on the home screen.
 * Full name → manifest `name`; this form → `short_name` + apple-mobile-web-app-title.
 * Cuts on the last word boundary within the budget, falls back to hard-cut.
 * No ellipsis — the OS adds its own.
 */
export function shortAppName(name: string, max = 12): string {
  if (name.length <= max) return name;
  const cut = name.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}
