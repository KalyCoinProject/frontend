'use client';

import Link from 'next/link';
import { Twitter, Github, MessageCircle } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-slate-900/95 backdrop-blur-sm border-t" style={{ borderTopColor: 'rgba(255, 255, 255, 0.2)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center mb-4">
              <img
                src="/icons/KalySwapLogo.png"
                alt="KalySwap Logo"
                className="h-6 w-6 mr-2"
              />
              <h3
                className="text-xl font-bold"
                style={{
                  background: 'linear-gradient(to right, #fbbf24, #d97706)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                KalySwap
              </h3>
            </div>
            <p className="text-sm mb-4" style={{ color: '#fef3c7' }}>
              The premier decentralized exchange on KalyChain. Trade tokens, provide liquidity, and earn rewards.
            </p>
            <div className="flex space-x-4">
              <a
                href="https://x.com/KalyChainEVM"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-amber-400"
                style={{ color: '#fef3c7' }}
                aria-label="Twitter"
              >
                <Twitter size={20} />
              </a>
              <a
                href="https://github.com/kalycoinproject/"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-amber-400"
                style={{ color: '#fef3c7' }}
                aria-label="GitHub"
              >
                <Github size={20} />
              </a>
              <a
                href="https://t.me/KalyChain"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-amber-400"
                style={{ color: '#fef3c7' }}
                aria-label="Telegram"
              >
                <MessageCircle size={20} />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">
              Products
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href="/swaps" className="text-sm transition-colors hover:text-amber-400" style={{ color: '#fef3c7' }}>
                  Swap
                </Link>
              </li>
              <li>
                <Link href="/pools" className="text-sm transition-colors hover:text-amber-400" style={{ color: '#fef3c7' }}>
                  Pools
                </Link>
              </li>
              <li>
                <Link href="/bridge" className="text-sm transition-colors hover:text-amber-400" style={{ color: '#fef3c7' }}>
                  Bridge
                </Link>
              </li>
              <li>
                <Link href="/stake" className="text-sm transition-colors hover:text-amber-400" style={{ color: '#fef3c7' }}>
                  Stake
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">
              Resources
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href="/docs" className="text-sm transition-colors hover:text-amber-400" style={{ color: '#fef3c7' }}>
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-sm transition-colors hover:text-amber-400" style={{ color: '#fef3c7' }}>
                  FAQ
                </Link>
              </li>
              <li>
                <a
                  href="https://kalychain.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-amber-400"
                  style={{ color: '#fef3c7' }}
                >
                  KalyChain
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">
              Community
            </h3>
            <ul className="space-y-3">
              <li>
                <a
                  href="https://x.com/KalyChainEVM"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-amber-400"
                  style={{ color: '#fef3c7' }}
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="https://discord.gg/tTe8BmcAks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-amber-400"
                  style={{ color: '#fef3c7' }}
                >
                  Discord
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/KalyChain"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-amber-400"
                  style={{ color: '#fef3c7' }}
                >
                  Telegram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t" style={{ borderTopColor: 'rgba(255, 255, 255, 0.2)' }}>
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm mb-4 md:mb-0" style={{ color: '#fef3c7' }}>
              &copy; {new Date().getFullYear()} KalySwap. All rights reserved.
            </p>
            <div className="flex space-x-6">
              <Link href="/terms" className="text-sm transition-colors hover:text-amber-400" style={{ color: '#fef3c7' }}>
                Terms of Service
              </Link>
              <Link href="/privacy" className="text-sm transition-colors hover:text-amber-400" style={{ color: '#fef3c7' }}>
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
