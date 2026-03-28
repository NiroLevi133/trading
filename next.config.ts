import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@anthropic-ai/sdk', 'openai', '@google/generative-ai'],
};

export default nextConfig;
