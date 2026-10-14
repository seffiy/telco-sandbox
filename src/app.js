import express from 'express';
import { bssRouter } from './routes/bss.js';
import { sandboxRouter } from './routes/sandbox.js';
import { tmfError } from './routes/tmf.js';

export function createApp({ store, audit, exposeGroundTruth = true }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(bssRouter(store));
  app.use(sandboxRouter(store, audit, { exposeGroundTruth }));
  app.use((req, res) => tmfError(res, 404, 'Not found', `No route for ${req.method} ${req.path}`));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return tmfError(res, 400, 'Bad request', 'Malformed JSON body');
    console.error(err);
    tmfError(res, 500, 'Internal error', 'Unexpected error');
  });
  return app;
}
