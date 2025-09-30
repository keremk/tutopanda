/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    rules: {
      '*.css': ['css-loader', 'postcss-loader'],
    },
  },
  transpilePackages: ['@remotion/bundler', '@remotion/player', '@remotion/renderer', 'remotion'],
  webpack: (config, { isServer }) => {
    // Suppress warnings from dependencies with dynamic imports
    if (isServer) {
      config.ignoreWarnings = [
        { module: /node_modules\/@opentelemetry/ },
        { module: /node_modules\/require-in-the-middle/ },
        { module: /node_modules\/@flystorage/ },
      ];
    }

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