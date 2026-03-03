export function toLocalDateKey(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate())
  );
}

export function todayKey(): string {
  return toLocalDateKey(new Date());
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function startOfWeekKey(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day;
  const sunday = new Date(d);
  sunday.setDate(diff);
  return (
    sunday.getFullYear() +
    "-" +
    pad(sunday.getMonth() + 1) +
    "-" +
    pad(sunday.getDate())
  );
}

export function isSameWeek(dateA: string, dateB: string): boolean {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const startA = new Date(a);
  startA.setDate(a.getDate() - a.getDay());
  const startB = new Date(b);
  startB.setDate(b.getDate() - b.getDay());
  return startA.getTime() === startB.getTime();
}
