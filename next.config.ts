import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产环境优化
  compress: true,
  poweredByHeader: false,
  
  // 服务器外部包配置
  serverExternalPackages: ['@prisma/client'],
  
  // 输出配置
  output: 'standalone',
  
  // 图片优化
  images: {
    formats: ['image/webp', 'image/avif'],
  },
};

export default nextConfig;
