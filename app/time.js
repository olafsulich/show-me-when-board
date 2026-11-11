// R5: the viewer's local time, in the viewer's own date order (dd/mm for EU locales).
export function formatLocal(iso, locales = navigator.languages, timeZone) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locales, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}
