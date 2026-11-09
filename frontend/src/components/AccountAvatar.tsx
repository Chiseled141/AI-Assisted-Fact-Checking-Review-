import { UserRound } from 'lucide-react';

export function AccountAvatar({ avatar, large = false }: { avatar?: string | null; large?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${large ? 'h-16 w-16 bg-brand-50 text-brand-700' : 'h-6 w-6'}`}>
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" />
        : <UserRound className={large ? 'h-7 w-7' : 'h-4 w-4'} aria-hidden="true" />}
    </span>
  );
}
