/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // When NEXT_PUBLIC_API_BASE is empty (e.g. the shareable tunnel build), the
  // browser calls /api on the same origin and Next proxies it to the local
  // backend. This keeps the whole app reachable through a single public URL
  // with no CORS. Harmless otherwise — /api has no frontend routes.
  // BACKEND_ORIGIN points the deployed frontend at the backend service.
  // On Railway you can set it to the backend's private domain, e.g.
  //   BACKEND_ORIGIN=${{ollie-backend.RAILWAY_PRIVATE_DOMAIN}}
  // Railway resolves that to a BARE HOSTNAME with no scheme and no port, and
  // Next refuses a rewrite destination that lacks http:// or https:// ("Invalid
  // rewrite found") and exits, which shows up as a crash loop. So normalise:
  // add a scheme if missing, add the port if missing, strip any trailing slash.
  // Unset, it falls back to the local backend, so local dev is unchanged.
  async rewrites() {
    const raw = (process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000").trim();
    const hadScheme = /^https?:\/\//i.test(raw);
    let backend = (hadScheme ? raw : `http://${raw}`).replace(/\/+$/, "");
    // Only a bare hostname gets the default port bolted on. A full URL the user
    // supplied is respected as-is, so https://api.example.com stays on 443.
    if (!hadScheme && !/:\d+$/.test(new URL(backend).host)) {
      const u = new URL(backend);
      u.port = process.env.BACKEND_PORT || "8000";
      backend = u.origin;
    }
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.hougarden.com" },
      { protocol: "https", hostname: "*.s.hougarden.com" },
      { protocol: "https", hostname: "sg-s.hougarden.com" },
      { protocol: "https", hostname: "s.hougarden.com" },
    ],
  },
};
module.exports = nextConfig;
