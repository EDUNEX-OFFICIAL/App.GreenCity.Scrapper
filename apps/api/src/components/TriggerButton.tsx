'use client';

import { useState } from 'react';

export function TriggerButton({
  moduleKey,
  portal,
  bpCode,
}: {
  moduleKey: string;
  portal: 'admin' | 'bp';
  bpCode?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function trigger() {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/runs/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleKey, portal, bpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMsg(`Queued: ${data.runId}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span>
      <button className="btn" onClick={trigger} disabled={loading}>
        {loading ? '…' : 'Run Now'}
      </button>
      {msg && <small style={{ marginLeft: 8 }}>{msg}</small>}
    </span>
  );
}
