// Google's own product logos, shown where Xpences links to that Google app (sign-in, Connected apps, exports).
// They are Google's current designs (the 2025 "G" and the 2026 Workspace icons), kept as Google made them
// in src/shared/brand/google/, so they are not themed. Google's branding rules ask for the logos unchanged
// and with some space around them, which LogoTile below gives. Each logo fits inside a size x size box.
import { cn } from '../lib/utils';
import gUrl from '../brand/google/g.svg';
import driveUrl from '../brand/google/drive.svg';
import sheetsUrl from '../brand/google/sheets.svg';
import calendarUrl from '../brand/google/calendar.svg';

type LogoProps = { size?: number; className?: string };

const logo = (src: string) =>
  function Logo({ size = 20, className }: LogoProps) {
    return <img src={src} alt="" aria-hidden="true" width={size} height={size} draggable={false} className={cn('object-contain', className)} />;
  };

/** The Google "G" */
export const GoogleG = logo(gUrl);
/** Google Drive */
export const DriveLogo = logo(driveUrl);
/** Google Sheets */
export const SheetsLogo = logo(sheetsUrl);
/** Google Calendar */
export const CalendarLogo = logo(calendarUrl);

/**
 * A logo on a light tile. The light background keeps Google's colours readable in dark mode too.
 */
export function LogoTile({ children, size = 'md', className }: { children: React.ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <div className={cn(
      'shrink-0 flex items-center justify-center bg-white border border-black/5 shadow-sm',
      size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-11 h-11 rounded-2xl' : 'w-10 h-10 rounded-xl',
      className,
    )}>
      {children}
    </div>
  );
}
