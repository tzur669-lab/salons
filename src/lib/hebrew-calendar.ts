import { HDate, HebrewCalendar } from "@hebcal/core";

// Hebrew month names in Hebrew script
const HEBREW_MONTH_NAMES: Record<number, string> = {
  1:  "ניסן",
  2:  "אייר",
  3:  "סיוון",
  4:  "תמוז",
  5:  "אב",
  6:  "אלול",
  7:  "תשרי",
  8:  "חשוון",
  9:  "כסלו",
  10: "טבת",
  11: "שבט",
  12: "אדר",
  13: "אדר ב׳",
};

export function toHebrewDate(date: Date): string {
  const hd = new HDate(date);
  return hd.renderGematriya(); // e.g. "כ״ו אייר תשפ״ו"
}

export function toHebrewDateShort(date: Date): string {
  const hd = new HDate(date);
  const day = hd.getDate();
  const month = HEBREW_MONTH_NAMES[hd.getMonth()] ?? hd.getMonthName();
  return `${numberToHebrew(day)} ${month}`;
}

export function getHebrewHolidays(year: number): Array<{ date: Date; name: string }> {
  const events = HebrewCalendar.calendar({
    year,
    isHebrewYear: false,
    il: true,
    noHolidays: false,
    noModern: false,
  });
  return events.map((ev) => ({
    date: ev.getDate().greg(),
    name: ev.render("he"),
  }));
}

export function getHebrewDayName(date: Date): string {
  const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  return days[date.getDay()];
}

function numberToHebrew(n: number): string {
  const letters = [
    "", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י",
    "יא", "יב", "יג", "יד", "טו", "טז", "יז", "יח", "יט", "כ",
    "כא", "כב", "כג", "כד", "כה", "כו", "כז", "כח", "כט", "ל",
  ];
  return letters[n] ?? String(n);
}

export function formatHebrewFullDate(date: Date): string {
  const dayName = getHebrewDayName(date);
  const hebrewDate = toHebrewDateShort(date);
  const gregorian = date.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${dayName}, ${hebrewDate} (${gregorian})`;
}
