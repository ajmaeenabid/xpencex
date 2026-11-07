import { Banknote, Landmark, Smartphone } from 'lucide-react';
import { Account } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { MOBILE_PROVIDERS } from './accounts';

/** Square tile with the bank icon, or the mobile banking brand colour */
export default function AccountIcon({ type, size = 'md' }: { type: Account['type']; size?: 'md' | 'lg' }) {
  const color = MOBILE_PROVIDERS.find(p => p.type === type)?.color;
  const Icon = type === 'bank' ? Landmark : type === 'cash' ? Banknote : Smartphone;
  return (
    <span
      className={cn(
        'shrink-0 rounded-xl flex items-center justify-center',
        size === 'lg' ? 'w-12 h-12' : 'w-10 h-10',
        !color && 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
      )}
      style={color ? { backgroundColor: `${color}1A`, color } : undefined}
    >
      <Icon size={size === 'lg' ? 22 : 18} />
    </span>
  );
}
