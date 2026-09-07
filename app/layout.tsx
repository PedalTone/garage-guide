import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#173d6d',
};

export const metadata: Metadata = {
  title: 'Garage Guide (v1.4) — Your vehicle life, organized',
  description: 'A private, local-first home for vehicle documents, deadlines, and maintenance records.',
  manifest: './manifest.webmanifest',
  icons: { icon: './favicon.svg', apple: './apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Garage Guide (v1.4)' },
  openGraph: {
    title: 'Garage Guide (v1.4)',
    description: 'Your vehicle life, organized.',
    images: [{ url: './og.png', width: 1200, height: 630, alt: 'Garage Guide — Your vehicle life, organized.' }],
  },
  twitter: { card: 'summary_large_image', title: 'Garage Guide (v1.4)', description: 'Your vehicle life, organized.', images: ['./og.png'] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><ServiceWorkerRegister />{children}</body>
    </html>
  );
}
