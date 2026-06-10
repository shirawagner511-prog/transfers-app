import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  required?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, startIcon, endIcon, required, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
            {label}
            {required && <span className="text-red-500 mr-1"> *</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {startIcon && (
            <span className="absolute end-3 text-gray-400 pointer-events-none">{startIcon}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full rounded-lg border px-3 py-2 text-sm bg-white
              placeholder-gray-400 text-gray-900
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
              ${error ? 'border-red-400 focus:ring-red-400' : 'border-gray-300'}
              ${startIcon ? 'pe-10' : ''}
              ${endIcon ? 'ps-10' : ''}
              ${className}
            `}
            {...props}
          />
          {endIcon && (
            <span className="absolute start-3 text-gray-400 pointer-events-none">{endIcon}</span>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
