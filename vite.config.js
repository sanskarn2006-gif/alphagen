import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // Since ws in the app connects to the root url in local, let's proxy root ws or we can just use relative protocols
    }
  }
});
