/**
 * Detects the device manufacturer from the user-agent, to tailor the
 * battery-optimization / auto-launch guidance. OnePlus/OPPO/Realme share the
 * BBK/OxygenOS "deep clean" that force-stops swiped-away apps (the main cause of
 * lost notifications). Best-effort — UA strings vary, so unknowns fall to "generic".
 */
export type Oem = "oneplus" | "xiaomi" | "huawei" | "samsung" | "generic";

export function detectOem(): Oem {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  if (/oneplus|oppo|realme|\bpj[a-z]|\bcph\d|\brmx\d/i.test(ua)) return "oneplus";
  if (/xiaomi|redmi|poco|miui/i.test(ua)) return "xiaomi";
  if (/huawei|honor/i.test(ua)) return "huawei";
  if (/samsung|\bsm-/i.test(ua)) return "samsung";
  return "generic";
}

/** Manual settings guidance per OEM (Hebrew, RTL). */
export const OEM_HINT: Record<Oem, string> = {
  oneplus:
    "בטלפון OnePlus/OPPO המערכת עוצרת אפליקציות שנסגרות. כדי לקבל התראות תמיד: הגדרות → אפליקציות → רוני ניילס → סוללה → בחרי “ללא הגבלה”, וגם הפעילי “הפעלה אוטומטית” (Auto-launch).",
  xiaomi:
    "בטלפון Xiaomi/Redmi: הגדרות → אפליקציות → רוני ניילס → חיסכון בסוללה → “ללא הגבלה”, והפעילי “הפעלה אוטומטית” (Autostart).",
  huawei:
    "בטלפון Huawei/Honor: הגדרות → סוללה → הפעלת אפליקציות → רוני ניילס → כבי “ניהול אוטומטי” והפעילי הפעלה ברקע.",
  samsung:
    "בטלפון Samsung: הגדרות → אפליקציות → רוני ניילס → סוללה → “ללא הגבלה” (Unrestricted).",
  generic:
    "כדי לקבל התראות גם כשהאפליקציה סגורה, אפשרי לה לרוץ ברקע: הגדרות → אפליקציות → רוני ניילס → סוללה → “ללא הגבלה”, והפעילי “הפעלה אוטומטית”.",
};
