import { CircleAlert } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export const cardClass = 'desk-form-section space-y-4';
export const labelClass = 'desk-label';

export function inputClass(invalid = false, numeric = false): string {
  return twMerge(
    'desk-input w-full',
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
