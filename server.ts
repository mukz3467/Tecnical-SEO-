import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import app from './server/app.ts';
import { config } from './server/config.ts';

async function startServer() {
  if (!config.isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: !config.disableHmr },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`AutoIndex AI server running at http://0.0.0.0:${config.port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
