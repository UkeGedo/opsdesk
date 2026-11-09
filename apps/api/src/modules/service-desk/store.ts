import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db.js';
import { slaPolicies, ticketSlaPauses, ticketSlas, users } from '../../schema.js';
import { evaluateSla, type Calendar } from './sla.js';
import { selectPolicy, type Policy, type Priority } from './policies.js';

type Store = Pick<Db, 'select' | 'insert' | 'update'>;
function policyOf(row: typeof slaPolicies.$inferSelect): Policy {
  return {
    id: row.id,
    version: row.version,
    serviceId: row.serviceId,
    priority: row.priority,
    effectiveFrom: row.effectiveFrom,
    effectiveUntil: row.effectiveUntil,
    active: row.active,
    firstResponseMs: row.firstResponseMs,
    resolutionMs: row.resolutionMs,
    calendar: JSON.parse(row.calendar) as Calendar,
    pauseStatuses: JSON.parse(row.pauseStatuses) as string[],
  };
}

export function applyPolicy(
  tx: Store,
  ticketId: string,
  priority: Priority,
  date: string,
  serviceId: string | null = null,
) {
  const policies = tx
    .select()
    .from(slaPolicies)
    .where(eq(slaPolicies.active, true))
    .all()
    .map(policyOf);
  const policy = selectPolicy(policies, serviceId, priority, date);
  if (policy)
    tx.insert(ticketSlas)
      .values({
        id: randomUUID(),
        ticketId,
        policyId: policy.id,
        snapshot: JSON.stringify(policy),
        startedAt: date,
      })
      .run();
}

function latest(tx: Store, ticketId: string) {
  return tx
    .select()
    .from(ticketSlas)
    .where(eq(ticketSlas.ticketId, ticketId))
    .orderBy(desc(ticketSlas.startedAt), desc(ticketSlas.id))
    .get();
}

export function statusChanged(
  tx: Store,
  ticketId: string,
  oldStatus: string,
  newStatus: string,
  date: string,
) {
  const cycle = latest(tx, ticketId);
  if (!cycle) return;
  const policy = JSON.parse(cycle.snapshot) as Policy;
  if (newStatus === 'reabierto') {
    tx.insert(ticketSlas)
      .values({
        id: randomUUID(),
        ticketId,
        policyId: cycle.policyId,
        snapshot: cycle.snapshot,
        startedAt: date,
      })
      .run();
    return;
  }
  if (cycle.resolvedAt) return;
  const wasPaused = policy.pauseStatuses.includes(oldStatus);
  const paused =
    policy.pauseStatuses.includes(newStatus) && !['resuelto', 'cerrado'].includes(newStatus);
  if (!wasPaused && paused)
    tx.insert(ticketSlaPauses).values({ id: randomUUID(), slaId: cycle.id, startedAt: date }).run();
  if (wasPaused && !paused)
    tx.update(ticketSlaPauses)
      .set({ endedAt: date })
      .where(and(eq(ticketSlaPauses.slaId, cycle.id), isNull(ticketSlaPauses.endedAt)))
      .run();
  if (newStatus === 'resuelto')
    tx.update(ticketSlas).set({ resolvedAt: date }).where(eq(ticketSlas.id, cycle.id)).run();
}

export function recordFirstResponse(
  tx: Store,
  ticketId: string,
  authorId: string,
  visibility: string,
  date: string,
) {
  if (visibility !== 'cliente') return;
  const author = tx.select().from(users).where(eq(users.id, authorId)).get();
  if (!author || author.role === 'cliente') return;
  const cycle = latest(tx, ticketId);
  if (cycle && !cycle.resolvedAt && !cycle.firstResponseAt)
    tx.update(ticketSlas)
      .set({ firstResponseAt: date })
      .where(and(eq(ticketSlas.id, cycle.id), isNull(ticketSlas.firstResponseAt)))
      .run();
}

export function slaForTicket(db: Store, ticketId: string, asOf: string) {
  const cycles = db
    .select()
    .from(ticketSlas)
    .where(eq(ticketSlas.ticketId, ticketId))
    .orderBy(asc(ticketSlas.startedAt), asc(ticketSlas.id))
    .all();
  return cycles.map((cycle) => {
    const policy = JSON.parse(cycle.snapshot) as Policy;
    const pauses = db
      .select()
      .from(ticketSlaPauses)
      .where(eq(ticketSlaPauses.slaId, cycle.id))
      .orderBy(asc(ticketSlaPauses.startedAt))
      .all()
      .map((p) => ({ start: p.startedAt, end: p.endedAt }));
    const observed = new Date(
      Math.max(
        Date.parse(asOf),
        Date.parse(cycle.startedAt),
        Date.parse(cycle.firstResponseAt ?? cycle.startedAt),
        Date.parse(cycle.resolvedAt ?? cycle.startedAt),
      ),
    ).toISOString();
    const response = evaluateSla(
      {
        calendar: policy.calendar,
        targetMs: policy.firstResponseMs,
        startedAt: cycle.startedAt,
        completedAt: cycle.firstResponseAt ?? cycle.resolvedAt,
        pauses,
      },
      observed,
    );
    return {
      id: cycle.id,
      policyId: cycle.policyId,
      policyVersion: policy.version,
      startedAt: cycle.startedAt,
      firstResponseAt: cycle.firstResponseAt,
      resolvedAt: cycle.resolvedAt,
      firstResponse:
        cycle.resolvedAt && !cycle.firstResponseAt
          ? { ...response, status: 'breached' as const, reason: 'resolved_without_response' }
          : response,
      resolution: evaluateSla(
        {
          calendar: policy.calendar,
          targetMs: policy.resolutionMs,
          startedAt: cycle.startedAt,
          completedAt: cycle.resolvedAt,
          pauses,
        },
        observed,
      ),
    };
  });
}
