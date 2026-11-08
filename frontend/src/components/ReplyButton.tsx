import { Reply } from 'lucide-react';

export function ReplyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
    >
      <Reply className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
