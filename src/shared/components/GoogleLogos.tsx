// Google's own product logos, shown where XpenceX links to that Google app (Connected apps, exports).
// They keep Google's colours on purpose, so they are not themed. Google's branding rules ask for the
// logos unchanged and with some space around them, which LogoTile below gives.
import { cn } from '../lib/utils';

type LogoProps = { size?: number; className?: string };

/** The Google "G" */
export function GoogleG({ size = 20, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Google Drive */
export function DriveLogo({ size = 20, className }: LogoProps) {
  return (
    <svg width={size} height={size * (78 / 87.3)} viewBox="0 0 87.3 78" aria-hidden="true" className={className}>
      <path fill="#0066DA" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00AC47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" />
      <path fill="#EA4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" />
      <path fill="#00832D" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684FC" d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#FFBA00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  );
}

/** Google Sheets */
export function SheetsLogo({ size = 20, className }: LogoProps) {
  return (
    <svg width={size * (48 / 64)} height={size} viewBox="0 0 48 64" aria-hidden="true" className={className}>
      <path fill="#0F9D58" d="M29 0H5a5 5 0 0 0-5 5v54a5 5 0 0 0 5 5h38a5 5 0 0 0 5-5V19L29 0z" />
      <path fill="#87CEAC" d="M29 0v14a5 5 0 0 0 5 5h14L29 0z" />
      {/* The white table with its grid */}
      <rect x="11" y="30" width="26" height="22" rx="1" fill="#F1F1F1" />
      <path fill="#0F9D58" d="M22.75 33h2.5v16h-2.5zM14 36.5h20V39H14zM14 43h20v2.5H14z" />
    </svg>
  );
}

/** Google Calendar */
export function CalendarLogo({ size = 20, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" className={className}>
      <path fill="#FFFFFF" d="M152.637 47.363H47.363v105.274h105.274z" />
      <path fill="#EA4335" d="M152.637 200 200 152.637h-47.363z" />
      <path fill="#FBBC04" d="M200 47.363h-47.363v105.274H200z" />
      <path fill="#34A853" d="M152.637 152.637H47.363V200h105.274z" />
      <path fill="#188038" d="M0 152.637v31.576C0 192.937 7.063 200 15.788 200h31.575v-47.363z" />
      <path fill="#1967D2" d="M200 47.363V15.788C200 7.063 192.937 0 184.212 0h-31.575v47.363z" />
      <path fill="#4285F4" d="M152.637 0H15.788C7.063 0 0 7.063 0 15.788v136.849h47.363V47.363h105.274z" />
      <text x="100" y="124" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="64" fontWeight="700" fill="#4285F4">31</text>
    </svg>
  );
}

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
