interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClass = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`${sizeClass[size]} border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin ${className}`}
    />
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner size="lg" />
    </div>
  );
}
