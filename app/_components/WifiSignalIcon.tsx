export function WifiSignalIcon({ className = "w-4 h-4 text-green-600 inline-block align-[-2px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 21a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM8.46 16.24a5 5 0 0 1 7.08 0 1 1 0 0 1-1.42 1.42 3 3 0 0 0-4.24 0 1 1 0 1 1-1.42-1.42ZM5.64 13.42a9 9 0 0 1 12.72 0 1 1 0 0 1-1.42 1.42 7 7 0 0 0-9.88 0 1 1 0 0 1-1.42-1.42ZM2.81 10.6a13 13 0 0 1 18.38 0 1 1 0 0 1-1.42 1.41 11 11 0 0 0-15.54 0 1 1 0 1 1-1.42-1.41Z" />
    </svg>
  );
}
