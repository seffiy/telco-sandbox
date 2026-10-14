import { createApp } from './app.js';
import { createStoreFromEnv } from './data/store.js';
import { createAuditLog } from './audit/auditLog.js';

const store = createStoreFromEnv();
const audit = createAuditLog({ file: process.env.AUDIT_LOG_FILE ?? 'logs/audit.jsonl' });
const app = createApp({ store, audit, exposeGroundTruth: process.env.EXPOSE_GROUND_TRUTH !== 'false' });
const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  const { seed, subscribers } = store.meta;
  console.log(`telco-sandbox listening on http://localhost:${port} (seed ${seed}, ${subscribers} subscribers, ${store.anomalies.length} labeled anomalies)`);
});
