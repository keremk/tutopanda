/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimize imports for large packages (works with both webpack and turbopack)
  experimental: {
    optimizePackageImports: ['@radix-ui/react-icons', 'lucide-react', 'date-fns'],
  },
  webpack: (config, { isServer }) => {
    // Suppress warnings from dependencies with dynamic imports
    if (isServer) {
      config.ignoreWarnings = [
        { module: /node_modules\/@opentelemetry/ },
        { module: /node_modules\/require-in-the-middle/ },
        { module: /node_modules\/import-in-the-middle/ },
        { module: /node_modules\/@flystorage/ },
      ];
    }

    // Next.js handles media files natively, no need for file-loader
    // Media files in public/ are served automatically
    // Media imports work out of the box with type: 'asset'

    return config;
  },
};

export default nextConfig;