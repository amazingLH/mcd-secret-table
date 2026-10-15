import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApi } from './server/api';

export default defineConfig({
  plugins: [react(), {
    name: 'secret-table-live-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        // Connect strips the mount prefix before dispatch.
        req.url = '/api' + req.url;
        void handleApi(req, res);
      });
    },
  }],
  base: './',
});
