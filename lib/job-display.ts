import { finiteSalary, type JobSalary } from './job-ingestion';

/** Display the supplied currency and period without inventing annual equivalents. */
export function formatJobSalary(salary: JobSalary): string {
  const min = finiteSalary(salary.min);
  const max = finiteSalary(salary.max);
  if (min === null && max === null) return 'Not listed';
  const currency = /^[A-Z]{3}$/.test(salary.currency || '') && salary.currency !== 'UNKNOWN' ? salary.currency : '';
  const number = (value: number) => new Intl.NumberFormat('en-US', {
    notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: value >= 1000 ? 1 : 2,
  }).format(value);
  const format = (value: number) => {
    if (!currency) return number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, currencyDisplay: currency === 'USD' ? 'symbol' : 'code',
      notation: value >= 1000 ? 'compact' : 'standard', minimumFractionDigits: 0, maximumFractionDigits: value >= 1000 ? 1 : 2,
    }).format(value);
  };
  const range = min !== null && max !== null && min !== max
    ? currency && currency !== 'USD' ? `${currency} ${number(min)}–${number(max)}` : `${format(min)} – ${format(max)}`
    : min !== null ? `${format(min)}${max === null ? '+' : ''}` : `Up to ${format(max!)}`;
  const period = { year: '/yr', month: '/mo', week: '/wk', day: '/day', hour: '/hr', unknown: ' (period not listed)' };
  return range + (salary.interval ? period[salary.interval] : '') + (currency ? '' : ' (currency not listed)')
    + (salary.isPredicted === true ? ' (estimated)' : '');
}
