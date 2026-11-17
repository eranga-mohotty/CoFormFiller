/**
 * SmartForm AI - DOM Value Normalizers
 * Pure Web Platform string & temporal formatting for HTML5 inputs.
 */

/**
 * Normalizes an arbitrary date string into HTML5 date format (YYYY-MM-DD).
 */
export function normalizeDateValue(raw: unknown): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const dmy = str.match(/^(\d{1,2})[/\.-](\d{1,2})[/\.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

  const ymd = str.match(/^(\d{4})[/\.-](\d{1,2})[/\.-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;

  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }
  return str;
}

/**
 * Normalizes an arbitrary time string into HTML5 24-hour time format (HH:MM).
 */
export function normalizeTimeValue(raw: unknown): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(str)) return str;

  const match = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? match[2] : '00';
    const meridiem = match[3].toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
  return str;
}
