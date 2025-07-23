import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产环境优化
  compress: true,
  poweredByHeader: false,
  
  // 实验性功能
  experimental: {
    // 启用服务器组件的优化
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  
  // 输出配置
  output: 'standalone',
  
  // 图片优化
  images: {
    formats: ['image/webp', 'image/avif'],
  },
};

export default nextConfig;
