import type { NextConfig } from "next";

const config: NextConfig = {
  // Fail the build on type errors rather than shipping them. Lint is gated
  // separately in CI (`npm run lint`) — Next 16.3.7 dropped the `eslint` config
  // key here, so this can no longer also do it inline.
  typescript: { ignoreBuildErrors: false },
  // A project's slug comes from its content filename, so renaming the file changes a public URL.
  // `/projects/mcpgauntlet` was live, crawled, and linked from a vulnerability report sent to a
  // third-party maintainer; the package was renamed to `mcpgantlet` because PyPI refused the old
  // name. Redirect rather than 404: a dead link in a report someone else already received is not
  // a cost worth paying for tidiness.
  async redirects() {
    return [
      {
        source: "/projects/mcpgauntlet",
        destination: "/projects/mcpgantlet",
        permanent: true,
      },
    ];
  },
  // Text fragments must work: never send Document-Policy: force-load-at-top,
  // which would disable them. Headers below are the security baseline.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
