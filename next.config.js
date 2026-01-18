/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // TypeScript errors fixed - fail build on type errors for safety
    ignoreBuildErrors: false,
  },
  async rewrites() {
    // Only use rewrites in development
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:3000/api/:path*', // Proxy to backend
        },
        {
          source: '/subgraphs/:path*',
          destination: 'https://app.kalyswap.io/subgraphs/:path*', // Proxy subgraph to avoid CORS
        },
      ];
    }
    return [];
  },
  webpack: (config) => {
    // Fix for MetaMask SDK trying to import React Native modules in browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
};

module.exports = nextConfig;

