export const runtimeConfig = {
  // 固定后端地址：
  // - 开发环境：建议用 Vite 代理，同源访问 /api（保持空字符串）
  // - 生产环境：同域部署也是空字符串；若前后端分离可通过 VITE_API_BASE_URL 指定
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "",
};

