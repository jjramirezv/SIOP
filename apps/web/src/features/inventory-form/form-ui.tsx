import { CircleAlert } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export const cardClass = 'bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4';
export const labelClass = 'block text-sm font-medium text-slate-900';

export function inputClass(invalid = false, numeric = false): string {
  return twMerge(
    'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none disabled:bg-slate-100',
    numeric && 'font-mono tabular-nums tracking-tight',
    invalid && 'border-rose-500 bg-rose-50/40 text-rose-950 focus:border-rose-600 focus:ring-rose-500/20',
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-rose-600 flex items-center gap-1">
      <CircleAlert size={13} className="shrink-0" aria-hidden="true" />{message}
    </p>
  );
}
