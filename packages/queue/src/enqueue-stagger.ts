/** Stagger BP job dispatch at batch start to avoid thundering-herd portal errors. */
export function genealogyEnqueueStaggerMs(): number {
  const raw = process.env.GENEALOGY_ENQUEUE_STAGGER_MS ?? '50';
  const ms = Number.parseInt(raw, 10);
  return Number.isFinite(ms) && ms >= 0 ? ms : 50;
}

export function jobEnqueueDelayMs(index: number): number | undefined {
  const stagger = genealogyEnqueueStaggerMs();
  if (stagger <= 0) return undefined;
  return index * stagger;
}
