import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ClickUp Template Deployer',
  description: 'Deploy JSON templates to ClickUp with zero friction',
  icons: {
    icon: '../public/assets/logo/png/logo-02.png',
    shortcut: '../public/assets/logo/png/logo-03.png',
    apple: '../public/assets/logo/png/logo-05.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}