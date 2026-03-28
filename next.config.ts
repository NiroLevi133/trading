import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@anthropic-ai/sdk', 'openai', '@google/generative-ai', 'pg'],
};

export default nextConfig;
