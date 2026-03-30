import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { WalletProviders } from '@/components/providers/WalletProviders';
import { ToastProvider } from '@/components/ui/toast';
import { ProtocolVersionProvider } from '@/contexts/ProtocolVersionContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'KalySwap - Decentralized Exchange',
  description: 'Trade tokens on KalyChain with KalySwap DEX',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </head>
      <body className={`${inter.className}`} suppressHydrationWarning={true}>
        <ToastProvider>
          <WalletProviders>
            <ProtocolVersionProvider>
              {children}
            </ProtocolVersionProvider>
          </WalletProviders>
        </ToastProvider>
      </body>
    </html>
  );
}
