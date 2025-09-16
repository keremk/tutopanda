/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    rules: {
      '*.css': ['css-loader', 'postcss-loader'],
    },
  },
  transpilePackages: ['@remotion/bundler', '@remotion/player', '@remotion/renderer', 'remotion'],
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Handle file imports for Remotion
    config.module.rules.push({
      test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/,
      use: {
        loader: 'file-loader',
        options: {
          publicPath: '/_next/static/media/',
          outputPath: 'static/media/',
        },
      },
    });

    return config;
  },
};

export default nextConfig;