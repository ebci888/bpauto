import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BP Auto Repair OS',
  description: 'Booking intake and shop dashboard for BP Auto Repair.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
