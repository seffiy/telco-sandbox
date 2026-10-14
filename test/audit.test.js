import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuditLog } from '../src/audit/auditLog.js';

test('tampering with a logged decision breaks verification', () => {
  const log = createAuditLog();
  log.append({ actor: 'agent', action: 'propose_credit', decision: { creditCents: 500 } });
  log.append({ actor: 'agent', action: 'apply_credit' });
  assert.equal(log.verify().ok, true);
  log._entries[0].decision.creditCents = 50000;
  assert.deepEqual(log.verify(), { ok: false, entries: 2, brokenAt: 1 });
});

test('log persists to JSON Lines and reloads with an intact chain', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'audit-')), 'audit.jsonl');
  const first = createAuditLog({ file });
  first.append({ actor: 'a', action: 'one' });
  first.append({ actor: 'a', action: 'two' });
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 2);
  const reloaded = createAuditLog({ file });
  reloaded.append({ actor: 'a', action: 'three' });
  assert.deepEqual(reloaded.verify(), { ok: true, entries: 3 });
});
