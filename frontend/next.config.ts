import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 铃声、接通音、挂断音（public/sounds/）默认是 max-age=0，每次进对话页都要回源确认一次。文件名不带哈希，
  // 换素材后老用户最多再听一天旧的，所以缓存一天。
  async headers() {
    return [{ source: "/sounds/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] }];
  },
};

export default nextConfig;
