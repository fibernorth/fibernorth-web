// Start / end for a lead's calendar event (pure; no Google or Firebase).
//
// The event is sent with PATCH, which merges nested fields. Switching a walk
// from all-day to a set time (or back) must clear the other kind of field,
// or Google keeps both `date` and `dateTime` and rejects or mangles the
// event. So the unused one is sent as null.

export const CALENDAR_TIME_ZONE = "America/Detroit";

type Start = { date: string | null; dateTime: string | null; timeZone: string | null };

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** One-hour event at a set time, or an all-day event when time is blank. */
export function eventTimes(date: string, time: string): { start: Start; end: Start } {
  const t = (time || "").trim();
  if (/^\d{2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(":").map(Number);
    const endH = h + 1;
    // A walk at 23:xx ends after midnight: the end rolls to the next day.
    const endDate = endH >= 24 ? nextDay(date) : date;
    const end = `${endDate}T${String(endH % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
    return {
      start: { dateTime: `${date}T${t}:00`, timeZone: CALENDAR_TIME_ZONE, date: null },
      end: { dateTime: end, timeZone: CALENDAR_TIME_ZONE, date: null },
    };
  }
  // All-day; Google's end date is exclusive.
  return {
    start: { date, dateTime: null, timeZone: null },
    end: { date: nextDay(date), dateTime: null, timeZone: null },
  };
}
