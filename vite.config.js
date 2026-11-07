import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/pdfjs-dist/')) return 'pdfjs';
          if (id.includes('/node_modules/pdf-lib/')) return 'pdf-lib';
          if (id.includes('/node_modules/lucide-react/')) return 'icons';
        },
      },
    },
  },
});
