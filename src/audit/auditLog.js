// Append-only, hash-chained audit log for agent decisions (JSON Lines on disk).
// Each entry stores the hash of the previous one, so any edit or deletion breaks verify().
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const GENESIS = '0'.repeat(64);

// Stable key order so the same entry always hashes the same way.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashEntry(entry) {
  const { hash, ...rest } = entry;
  return createHash('sha256').update(canonical(rest)).digest('hex');
}

export function validateAuditEvent(e) {
  const errors = [];
  if (!e || typeof e !== 'object') return ['event must be an object'];
  for (const k of ['actor', 'action']) {
    if (typeof e[k] !== 'string' || !e[k].trim()) errors.push(`${k} is required`);
  }
  if (e.toolCalls !== undefined) {
    if (!Array.isArray(e.toolCalls)) errors.push('toolCalls must be an array');
    else e.toolCalls.forEach((t, i) => { if (typeof t?.tool !== 'string') errors.push(`toolCalls[${i}].tool is required`); });
  }
  if (e.dataRefs !== undefined && !Array.isArray(e.dataRefs)) errors.push('dataRefs must be an array');
  if (e.policy !== undefined && (typeof e.policy !== 'object' || typeof e.policy.id !== 'string')) errors.push('policy.id is required when policy is given');
  return errors;
}

/**
 * @param {{ file?: string, now?: () => string }} [opts]  file: JSONL path; omit for in-memory only.
 */
export function createAuditLog({ file, now = () => new Date().toISOString() } = {}) {
  const entries = [];
  if (file && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) if (line.trim()) entries.push(JSON.parse(line));
  }
  if (file) mkdirSync(dirname(file), { recursive: true });

  return {
    /** Record one agent decision: who acted, what tools it called, what data and policy it used. */
    append(event) {
      const errors = validateAuditEvent(event);
      if (errors.length) {
        const err = new Error(`Invalid audit event: ${errors.join('; ')}`);
        err.validation = errors;
        throw err;
      }
      const prev = entries[entries.length - 1];
      const entry = {
        id: randomUUID(),
        seq: entries.length + 1,
        timestamp: now(),
        correlationId: event.correlationId,
        actor: event.actor,
        action: event.action,
        toolCalls: event.toolCalls ?? [],
        dataRefs: event.dataRefs ?? [],
        policy: event.policy,
        decision: event.decision,
        rationale: event.rationale,
        prevHash: prev ? prev.hash : GENESIS,
      };
      entry.hash = hashEntry(entry);
      entries.push(entry);
      if (file) appendFileSync(file, `${JSON.stringify(entry)}\n`);
      return entry;
    },

    list({ actor, action, correlationId } = {}) {
      return entries.filter((e) => (!actor || e.actor === actor)
        && (!action || e.action === action)
        && (!correlationId || e.correlationId === correlationId));
    },

    /** Recompute the chain. Returns the first broken entry, if any. */
    verify() {
      let prevHash = GENESIS;
      for (const e of entries) {
        if (e.prevHash !== prevHash || hashEntry(e) !== e.hash) return { ok: false, entries: entries.length, brokenAt: e.seq };
        prevHash = e.hash;
      }
      return { ok: true, entries: entries.length };
    },

    // Test hook: direct access to entries (e.g. to simulate tampering).
    _entries: entries,
  };
}
