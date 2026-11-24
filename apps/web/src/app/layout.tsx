import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteToaster } from '@/components/SiteToaster';
import './globals.css';

export const metadata: Metadata = {
  title: 'SolRift',
  description: 'A voxel sandbox in your browser, powered by Solana.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
  // (draw under the notch and the home bar; the pages clear them with the safe-area insets, see components/responsive.css)
  viewportFit: 'cover',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/Monocraft.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <SiteToaster />
      </body>
    </html>
  );
}
