import {
  format, isToday, isYesterday, parseISO,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths,
} from 'date-fns';
import { he } from 'date-fns/locale';

export type PeriodType = 'day' | 'week' | 'month';

export function formatDate(dateStr: string): string {
  const date = parseISO(dateStr);
  return format(date, 'dd/MM/yyyy', { locale: he });
}

export function formatDateTime(dateStr: string): string {
  const date = parseISO(dateStr);
  return format(date, 'dd/MM/yyyy HH:mm', { locale: he });
}

export function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

export function formatRelativeDate(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'היום';
  if (isYesterday(date)) return 'אתמול';
  return formatDate(dateStr);
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function nowTimeISO(): string {
  return format(new Date(), 'HH:mm:ss');
}

// Week starts on Sunday (Israel)
const WEEK_OPTS = { weekStartsOn: 0 as const };

/** Inclusive start/end ISO dates for the period containing `anchorISO`. */
export function periodRange(type: PeriodType, anchorISO: string): { start: string; end: string } {
  const d = parseISO(anchorISO);
  if (type === 'day') return { start: anchorISO, end: anchorISO };
  if (type === 'week') {
    return {
      start: format(startOfWeek(d, WEEK_OPTS), 'yyyy-MM-dd'),
      end: format(endOfWeek(d, WEEK_OPTS), 'yyyy-MM-dd'),
    };
  }
  return {
    start: format(startOfMonth(d), 'yyyy-MM-dd'),
    end: format(endOfMonth(d), 'yyyy-MM-dd'),
  };
}

/** Human-readable label for the period (Hebrew). */
export function periodLabel(type: PeriodType, anchorISO: string): string {
  const d = parseISO(anchorISO);
  if (type === 'day') return `${format(d, 'EEEE', { locale: he })}, ${formatDate(anchorISO)}`;
  if (type === 'week') {
    const { start, end } = periodRange('week', anchorISO);
    return `${formatDate(start)} – ${formatDate(end)}`;
  }
  return format(d, 'MMMM yyyy', { locale: he });
}

/** Move the anchor date one period back (-1) or forward (+1). */
export function shiftPeriod(type: PeriodType, anchorISO: string, dir: -1 | 1): string {
  const d = parseISO(anchorISO);
  if (type === 'day') return format(addDays(d, dir), 'yyyy-MM-dd');
  if (type === 'week') return format(addWeeks(d, dir), 'yyyy-MM-dd');
  return format(addMonths(d, dir), 'yyyy-MM-dd');
}
