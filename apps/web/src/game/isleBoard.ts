/** The farthest island day this page has already told the server. */
let sent = 0;
/** False after the server says nobody is signed in, so a guest does not report on every save. */
let signed: boolean | null = null;

/**
 * Tell the website the best Survival Island day of the character who is signed in.
 * The island itself is saved on this device; the server only keeps the number, and never a smaller one.
 * A guest has no row. A day that was already sent is not sent again.
 */
export function reportIsleDay(day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > 10_000) return;
  if (signed === false || day <= sent) return;
  const posting = day;
  void fetch('/api/leaderboard/isle', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ days: posting }),
  })
    .then((res) => {
      if (res.status === 401) {
        signed = false;
        return;
      }
      if (!res.ok) return;
      signed = true;
      sent = Math.max(sent, posting);
    })
    .catch(() => {
      /* the next save tries again */
    });
}
