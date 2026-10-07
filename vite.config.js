import { defineConfig } from 'vite';

// Situs live: https://dmsandris.github.io/benonia/
export default defineConfig({
  root: 'web',
  base: '/benonia/',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0, // sprite PNG tetap file terpisah (cache browser)
    chunkSizeWarningLimit: 2000, // Phaser memang besar
  },
  server: { port: 8787 },
});
