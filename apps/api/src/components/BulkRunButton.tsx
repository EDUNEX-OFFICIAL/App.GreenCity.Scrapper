'use client';

import { useState } from 'react';

export function BulkRunButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function triggerAll() {
    if (!confirm('Queue all admin modules for scraping?')) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/runs/trigger-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMsg(`Queued ${data.queued} modules`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function reconcile() {
    setLoading(true);
    try {
      const res = await fetch('/api/runs/reconcile', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMsg(`Recovered ${data.total} stale runs`);
      window.location.reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <button className="btn" onClick={triggerAll} disabled={loading}>
        {loading ? '…' : 'Run All Modules'}
      </button>
      <button className="btn btn-secondary" onClick={reconcile} disabled={loading}>
        Recover Stale Runs
      </button>
      {msg && <small>{msg}</small>}
    </div>
  );
}
