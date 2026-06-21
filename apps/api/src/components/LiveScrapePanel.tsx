'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExportButton } from './ExportButton';

interface LiveData {
  worker: {
    online: boolean;
    lastHeartbeat: number | null;
    queue: { waiting: number; active: number; delayed: number; failed: number };
  };
  genealogyWorker?: {
    online: boolean;
    lastHeartbeat: number | null;
    queue: { waiting: number; active: number; delayed: number; failed: number };
    harvestQueue?: { waiting: number; active: number; delayed: number; failed: number; completed: number } | null;
  };
  genealogy?: {
    id: string;
    status: string;
    startedAt: string | null;
    progress: {
      totalBps: number | null;
      completed: number | null;
      failed: number | null;
      skipped: number | null;
      enqueued: number | null;
      currentBp: string | null;
      index: number | null;
      processed: number | null;
      remaining: number | null;
      activeCount: number | null;
      queueActive: number | null;
      queueWaiting: number | null;
      workerCapacity: number | null;
      bpPerMin: number | null;
      etaMinutes: number | null;
    };
    activeBps: Array<{
      bpCode: string | null;
      moduleKey: string;
      startedAt: string | null;
    }>;
    recentCompletedBps: Array<{
      bpCode: string | null;
      status: string;
      finishedAt: string | null;
      rowCount: number;
    }>;
  } | null;
  orchestrator: {
    id: string;
    status: string;
    startedAt: string | null;
  } | null;
  activeModule: {
    moduleKey: string;
    rowCount: number;
    rowsInserted: number;
    rowsUpdated: number;
    metadata: Record<string, unknown>;
  } | null;
  progress: {
    currentModule: string | null;
    currentLabel: string | null;
    navPath: string[] | null;
    moduleIndex: number | null;
    totalModules: number | null;
    pagesScraped: number | null;
    rowsSoFar: number | null;
    lastPage: number | null;
    rowsInserted: number | null;
    rowsUpdated: number | null;
    completedModules: string[];
    failedModules: string[];
  };
  recentModules: Array<{
    moduleKey: string;
    status: string;
    rowCount: number;
    rowsInserted: number;
    rowsUpdated: number;
    finishedAt: string | null;
    error: string | null;
  }>;
  timestamp: number;
}

export function LiveScrapePanel() {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch('/api/scrape/live');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load live status');
      setData(json);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const id = setInterval(fetchLive, 2000);
    return () => clearInterval(id);
  }, [fetchLive]);

  async function startSequential() {
    if (!confirm('Start full portal scrape? BP List first, then all admin modules sequentially.')) return;
    setStarting(true);
    setMsg('');
    try {
      const res = await fetch('/api/runs/trigger-sequential', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to start');
      setMsg(`Started — ${json.totalModules} modules queued (run ${json.runId})`);
      fetchLive();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setStarting(false);
    }
  }

  async function startRemaining() {
    if (!confirm('Scrape all remaining modules (skip bp_list)? Sale Operation + all others.')) return;
    setStarting(true);
    setMsg('');
    try {
      const res = await fetch('/api/runs/trigger-remaining', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to start');
      setMsg(`Remaining scrape started — ${json.totalModules} modules (run ${json.runId})`);
      fetchLive();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setStarting(false);
    }
  }

  async function startGenealogy() {
    if (!confirm('Start genealogy scrape for all BPs in DB?')) return;
    setStarting(true);
    setMsg('');
    try {
      const res = await fetch('/api/runs/trigger-genealogy', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to start');
      setMsg(`Genealogy batch queued (run ${json.runId})`);
      fetchLive();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setStarting(false);
    }
  }

  const worker = data?.worker;
  const progress = data?.progress;
  const geneProgress = data?.genealogy?.progress;
  const genePct =
    geneProgress?.totalBps && geneProgress.processed != null
      ? Math.round((geneProgress.processed / geneProgress.totalBps) * 100)
      : 0;
  const pct =
    progress?.moduleIndex && progress?.totalModules
      ? Math.round((progress.moduleIndex / progress.totalModules) * 100)
      : 0;
  const harvestQueue = data?.genealogyWorker?.harvestQueue;

  return (
    <div>
      {error && <div className="banner banner-error">{error}</div>}

      {worker && (
        <div
          className={`banner ${worker.online ? (worker.queue.active > 0 ? 'banner-info' : 'banner-ok') : 'banner-error'}`}
        >
          {worker.online ? (
            <>
              Admin worker online — active: {worker.queue.active}, waiting: {worker.queue.waiting}, failed:{' '}
              {worker.queue.failed}
            </>
          ) : (
            <>Admin worker offline — start scraper container to process jobs</>
          )}
        </div>
      )}

      {data?.genealogyWorker && (
        <div
          className={`banner ${data.genealogyWorker.online ? (data.genealogyWorker.queue.active > 0 || (harvestQueue?.active ?? 0) > 0 ? 'banner-info' : 'banner-ok') : 'banner-warn'}`}
        >
          Genealogy worker {data.genealogyWorker.online ? 'online' : 'offline'}
          {harvestQueue ? (
            <>
              {' '}
              — harvest active: {harvestQueue.active}, waiting: {harvestQueue.waiting}, failed: {harvestQueue.failed}
            </>
          ) : (
            <>
              {' '}
              — active: {data.genealogyWorker.queue.active}, waiting: {data.genealogyWorker.queue.waiting}, failed:{' '}
              {data.genealogyWorker.queue.failed}
            </>
          )}
        </div>
      )}

      {data?.genealogy && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Genealogy Batch</h2>
          <p style={{ marginBottom: '0.75rem' }}>
            Status: <strong>{data.genealogy.status}</strong>
            {data.genealogy.startedAt && (
              <> — started {new Date(data.genealogy.startedAt).toLocaleString()}</>
            )}
          </p>
          {geneProgress?.totalBps ? (
            <>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${genePct}%` }} />
              </div>
              <p>
                {geneProgress.processed ?? 0} / {geneProgress.totalBps} BPs ({genePct}%) — completed:{' '}
                {geneProgress.completed ?? 0}, failed: {geneProgress.failed ?? 0}
                {(geneProgress.skipped ?? 0) > 0 && <>, skipped: {geneProgress.skipped}</>}
              </p>
            </>
          ) : (
            <p>
              Completed: {geneProgress?.completed ?? 0}, failed: {geneProgress?.failed ?? 0}
            </p>
          )}
          <div className="grid">
            <div>
              <div className="stat">{geneProgress?.bpPerMin ?? '—'}</div>
              <small>BP/min</small>
            </div>
            <div>
              <div className="stat">{geneProgress?.etaMinutes ?? '—'}</div>
              <small>ETA (min)</small>
            </div>
            <div>
              <div className="stat">{geneProgress?.activeCount ?? geneProgress?.queueActive ?? 0}</div>
              <small>Active jobs</small>
            </div>
            <div>
              <div className="stat">{geneProgress?.queueWaiting ?? 0}</div>
              <small>Queue waiting</small>
            </div>
            <div>
              <div className="stat">{geneProgress?.workerCapacity ?? '—'}</div>
              <small>Worker capacity</small>
            </div>
            <div>
              <div className="stat">{geneProgress?.enqueued ?? '—'}</div>
              <small>Enqueued</small>
            </div>
          </div>
          {geneProgress?.currentBp && (
            <p style={{ marginTop: '0.75rem' }}>
              Latest BP: <code>{geneProgress.currentBp}</code>
            </p>
          )}
          {(data.genealogy.activeBps ?? []).length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <small>Currently running:</small>
              <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
                {data.genealogy.activeBps.map((bp) => (
                  <li key={`${bp.moduleKey}-${bp.bpCode}-${bp.startedAt}`}>
                    <code>{bp.bpCode ?? '?'}</code>
                    {bp.startedAt && <> — since {new Date(bp.startedAt).toLocaleTimeString()}</>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(data.genealogy.recentCompletedBps ?? []).length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <small>Recently finished:</small>
              <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
                {data.genealogy.recentCompletedBps.map((bp) => (
                  <li key={`${bp.bpCode}-${bp.finishedAt}`}>
                    <code>{bp.bpCode ?? '?'}</code> — {bp.status}
                    {bp.finishedAt && <> at {new Date(bp.finishedAt).toLocaleTimeString()}</>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" onClick={startGenealogy} disabled={starting}>
          Start Genealogy
        </button>
        <button className="btn" onClick={startRemaining} disabled={starting || Boolean(data?.orchestrator)}>
          Scrape Remaining Modules
        </button>
        <button className="btn btn-secondary" onClick={startSequential} disabled={starting || Boolean(data?.orchestrator)}>
          {starting ? 'Starting…' : data?.orchestrator ? 'Scrape Running…' : 'Full Portal Scrape'}
        </button>
        <ExportButton href="/api/data/bp_list/export" label="Export BP List" />
        <ExportButton href="/api/genealogy/export?type=nodes" label="Export Genealogy" />
        <a href="/modules" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          All Exports
        </a>
        <a href="/runs" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          All Runs
        </a>
        {msg && <small>{msg}</small>}
      </div>

      {progress?.totalModules ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Overall Progress</h2>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p>
            Module {progress.moduleIndex ?? 0} / {progress.totalModules} ({pct}%)
          </p>
          {progress.completedModules.length > 0 && (
            <small>Completed: {progress.completedModules.length} modules</small>
          )}
          {progress.failedModules.length > 0 && (
            <small style={{ color: '#c62828', marginLeft: '1rem' }}>
              Failed: {progress.failedModules.length}
            </small>
          )}
        </div>
      ) : null}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Current Module</h2>
        {progress?.currentModule ? (
          <>
            <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>
              {progress.navPath?.join(' > ') ?? progress.currentLabel ?? progress.currentModule}
            </p>
            <div className="grid">
              <div>
                <div className="stat">{progress.lastPage ?? progress.pagesScraped ?? '—'}</div>
                <small>Page scraped</small>
              </div>
              <div>
                <div className="stat">{progress.rowsSoFar ?? 0}</div>
                <small>Rows so far</small>
              </div>
              <div>
                <div className="stat">{progress.rowsInserted ?? 0}</div>
                <small>Inserted</small>
              </div>
              <div>
                <div className="stat">{progress.rowsUpdated ?? 0}</div>
                <small>Updated</small>
              </div>
            </div>
            <p>
              <code>{progress.currentModule}</code>
              {data?.activeModule?.metadata?.pagesScraped != null && (
                <> — pages: {String(data.activeModule.metadata.pagesScraped)}</>
              )}
            </p>
          </>
        ) : data?.orchestrator ? (
          <p>Waiting for first module…</p>
        ) : (
          <p>No scrape in progress. Click &quot;Start Full Portal Scrape&quot; to begin.</p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Recent Completions</h2>
        <table>
          <thead>
            <tr>
              <th>Module</th>
              <th>Status</th>
              <th>Rows</th>
              <th>Inserted</th>
              <th>Updated</th>
              <th>Finished</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recentModules ?? []).map((r) => (
              <tr key={`${r.moduleKey}-${r.finishedAt}`}>
                <td>{r.moduleKey}</td>
                <td className={`status-${r.status}`}>{r.status}</td>
                <td>{r.rowCount}</td>
                <td>{r.rowsInserted}</td>
                <td>{r.rowsUpdated}</td>
                <td>{r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {(data?.recentModules ?? []).length === 0 && (
              <tr>
                <td colSpan={6}>No completed modules yet</td>
              </tr>
            )}
          </tbody>
        </table>
        {data?.timestamp && (
          <small style={{ color: '#666' }}>Last updated: {new Date(data.timestamp).toLocaleTimeString()}</small>
        )}
      </div>
    </div>
  );
}
