import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'artnewsroom',
  description: 'curated art news',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <body style={{ height: '100%', margin: 0 }}>{children}</body>
    </html>
  );
}
