/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'coverartarchive.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.musicbrainz.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/sign/**',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['music-metadata'],
  },
};
module.exports = nextConfig;