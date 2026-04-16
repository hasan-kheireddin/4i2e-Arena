import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  icon,
  trailing,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'h-11 w-full rounded-xl border border-border bg-input text-primary placeholder-muted shadow-sm transition-all duration-150 outline-none',
            icon ? 'pl-10' : 'pl-3',
            trailing ? 'pr-10' : 'pr-3',
            error
              ? 'border-danger focus:ring-2 focus:ring-danger/20'
              : 'focus:border-brand focus:ring-2 focus:ring-brand/20',
            props.readOnly && 'cursor-default bg-base text-muted',
            props.disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
          aria-invalid={Boolean(error)}
          {...props}
        />
        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            {trailing}
          </span>
        )}
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-danger">
          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
      {!error && hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
