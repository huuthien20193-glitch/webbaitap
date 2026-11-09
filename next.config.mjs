/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tách build-dir dev vs prod: chạy `next dev` song song với `next build`
  // sẽ không ghi đè lẫn nhau (tránh hỏng cache .next khi deploy/verify)
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
