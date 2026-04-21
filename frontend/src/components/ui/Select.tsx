import React from 'react';
import { cn } from '@/lib/utils';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
  label?: string;
  error?: string;
  placeholder?: string;
}

export function Select({
  options,
  label,
  error,
  placeholder,
  className,
  id,
  ...props
}: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const { style: selectStyle, ...selectProps } = props;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'h-11 w-full appearance-none rounded-xl border border-border bg-input text-primary shadow-sm transition-all duration-150 outline-none',
            'cursor-pointer',
            error
              ? 'border-danger focus:ring-2 focus:ring-danger/20'
              : 'focus:border-brand focus:ring-2 focus:ring-brand/20',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            className
          )}
          aria-invalid={Boolean(error)}
          style={{
            paddingInlineStart: '0.75rem',
            paddingInlineEnd: '2.25rem',
            ...selectStyle,
          }}
          {...selectProps}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <span
          className="absolute top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          style={{ insetInlineEnd: '0.75rem' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-danger">
          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
