/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer', 'pdf-parse', 'pdfjs-dist'],
  },
}

module.exports = nextConfig


