// One recurring calendar invite per cohort (iTIP REQUEST/CANCEL, RFC 5545/5546).
// The UID is fixed per cohort and SEQUENCE is cohorts.invite_sequence, so every
// updated invite replaces the earlier one in the person's calendar instead of adding
// a second event. Times are wall-clock Africa/Lagos (WAT, UTC+1, no daylight saving).

export interface CohortInvite {
  cohortId: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  title: string;
  firstDate: string; // YYYY-MM-DD, the first class
  endDate: string; // YYYY-MM-DD, the cohort's last day
  days: string[]; // "monday", "wednesday", …
  startTime: string; // HH:MM[:SS]
  endTime: string;
  exdates: string[]; // YYYY-MM-DD dates in the pattern with no class
  location?: string | null;
  meetingLink?: string | null;
  organizerEmail: string;
  organizerName: string;
  attendeeEmail: string;
  attendeeName?: string | null;
  now?: Date;
}

const BYDAY: Record<string, string> = {
  sunday: "SU", monday: "MO", tuesday: "TU", wednesday: "WE", thursday: "TH", friday: "FR", saturday: "SA",
};

const date = (d: string) => d.replace(/-/g, "");
const time = (t: string) => t.slice(0, 5).replace(":", "") + "00";

export function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines longer than 75 octets are folded with CRLF + space.
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildCohortIcs(i: CohortInvite): string {
  const tz = "Africa/Lagos";
  const days = i.days.map(d => BYDAY[d.toLowerCase()]).filter(Boolean).join(",");
  const description = [
    i.meetingLink ? `Join online: ${i.meetingLink}` : "",
    i.location ? `Where: ${i.location}` : "",
    "Your classes, materials and attendance are in your FutureLabs student portal: https://admin.futurelabs.ng/student",
  ].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//FutureLabs//Classes//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.method}`,
    "BEGIN:VTIMEZONE",
    `TZID:${tz}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0100",
    "TZNAME:WAT",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:cohort-${i.cohortId}@futurelabs.ng`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${stamp(i.now ?? new Date())}`,
    `DTSTART;TZID=${tz}:${date(i.firstDate)}T${time(i.startTime)}`,
    `DTEND;TZID=${tz}:${date(i.firstDate)}T${time(i.endTime)}`,
    // UNTIL is UTC; 22:59:59Z is the end of the last day in Lagos.
    `RRULE:FREQ=WEEKLY;BYDAY=${days};UNTIL=${date(i.endDate)}T225959Z`,
    ...(i.exdates.length ? [`EXDATE;TZID=${tz}:${i.exdates.map(d => `${date(d)}T${time(i.startTime)}`).join(",")}`] : []),
    `SUMMARY:${escapeIcs(i.title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    ...(i.location || i.meetingLink ? [`LOCATION:${escapeIcs(i.location || i.meetingLink || "")}`] : []),
    ...(i.meetingLink ? [`URL:${i.meetingLink}`] : []),
    `ORGANIZER;CN=${escapeIcs(i.organizerName)}:mailto:${i.organizerEmail}`,
    `ATTENDEE;CN=${escapeIcs(i.attendeeName || i.attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${i.attendeeEmail}`,
    `STATUS:${i.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    ...(i.method === "REQUEST"
      ? ["BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${escapeIcs(i.title)} starts in 30 minutes`, "END:VALARM"]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

const DAY_LABEL: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};
const ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function clock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

// "Mon, Wed & Fri, 10am–11am"
export function describePattern(days: string[], startTime: string, endTime: string): string {
  const names = [...days].map(d => d.toLowerCase()).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map(d => DAY_LABEL[d] ?? d);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0] ?? "";
  return `${list}, ${clock(startTime)}–${clock(endTime)}`;
}
