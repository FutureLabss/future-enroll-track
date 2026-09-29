export interface ICSEvent {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string | null;
  description?: string | null;
}

export function buildICSContent(event: ICSEvent): string {
  const pad = (n: number) => n.toString().padStart(2, '0');

  const toICSDate = (date: string, time: string) => {
    const [y, m, d] = date.split('-');
    const [h, min] = time.split(':');
    return `${y}${m}${d}T${h}${min}00`;
  };

  const now = new Date();
  const dtStamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    'T',
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
    'Z',
  ].join('');

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@futurelabs-lms`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FutureLabs LMS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${toICSDate(event.date, event.startTime)}`,
    `DTEND:${toICSDate(event.date, event.endTime)}`,
    `SUMMARY:${event.title}`,
  ];

  if (event.location) lines.push(`LOCATION:${event.location}`);
  if (event.description) lines.push(`DESCRIPTION:${event.description}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

export function downloadICS(event: ICSEvent): void {
  const blob = new Blob([buildICSContent(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${event.title.replace(/[^a-z0-9]/gi, '_').slice(0, 60)}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}
