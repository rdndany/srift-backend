'use client';

import { Toaster } from 'sonner';
import './siteToaster.css';

/** A picture drawn in square pixels (one `rect` for each), so that the icons look like the rest of the pages. */
function Pixels({ rows, fill }: { rows: readonly string[]; fill: string }) {
  return (
    <svg width="20" height="20" viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={fill} /> : null)))}
    </svg>
  );
}

const TICK = ['.......#', '......##', '#....##.', '##..##..', '.####...', '..##....'] as const;
const CROSS = ['##....##', '###..###', '.######.', '..####..', '.######.', '###..###', '##....##'] as const;
const INFO = ['..##..', '..##..', '......', '..##..', '..##..', '..##..', '..##..'] as const;

/**
 * The website's notifications (a purchase made or refused, a gift claimed): one `<Toaster />` for every page, so that anything can say
 * `toast.success('...')` / `toast.error('...')` (from `sonner`). They stand in the bottom right corner, cut from the same square
 * pixels as the pages (see `siteToaster.css`).
 */
export function SiteToaster() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      offset={{ bottom: 22, right: 22 }}
      mobileOffset={{ bottom: 14, left: 12, right: 12 }}
      closeButton
      duration={5000}
      visibleToasts={3}
      icons={{
        success: <Pixels rows={TICK} fill="#8fe388" />,
        error: <Pixels rows={CROSS} fill="#ff8a7a" />,
        info: <Pixels rows={INFO} fill="#c9a2ff" />,
      }}
    />
  );
}
