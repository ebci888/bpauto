/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: {
    root: __dirname
  },
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/site.html'
      }
    ];
  }
};

module.exports = nextConfig;
