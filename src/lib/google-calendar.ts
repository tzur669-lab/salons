interface CalendarParams {
  title: string;
  startTime: Date;
  endTime: Date;
  description?: string;
  location?: string;
}

function formatDateForCalendar(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function buildGoogleCalendarLink(params: CalendarParams): string {
  const { title, startTime, endTime, description, location } = params;
  const base = "https://calendar.google.com/calendar/render";
  const qs = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatDateForCalendar(startTime)}/${formatDateForCalendar(endTime)}`,
    ...(description ? { details: description } : {}),
    ...(location ? { location } : {}),
  });
  return `${base}?${qs.toString()}`;
}
