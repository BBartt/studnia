import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.STUDNIA_SERVER ?? 'localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // dostęp z innych komputerów w sieci lokalnej
    port: 5173,
    proxy: {
      '/ws': { target: `ws://${API}`, ws: true },
      '/api': { target: `http://${API}` },
    },
  },
});
