import { getWorkerStatus } from '@greencity/queue';

export async function WorkerStatusBanner() {
  let status: Awaited<ReturnType<typeof getWorkerStatus>> | null = null;
  try {
    status = await getWorkerStatus();
  } catch {
    status = null;
  }

  if (!status) {
    return (
      <div className="banner banner-warn">
        Cannot reach Redis queue — scraper status unknown.
      </div>
    );
  }

  if (!status.online) {
    return (
      <div className="banner banner-error">
        Scraper worker offline — {status.queue.waiting} job(s) queued but not processing.
        Start worker: <code>docker compose up -d scraper</code>
      </div>
    );
  }

  if (status.queue.waiting > 0) {
    return (
      <div className="banner banner-info">
        Worker online — processing {status.queue.active} active, {status.queue.waiting} waiting.
      </div>
    );
  }

  return (
    <div className="banner banner-ok">
      Scraper worker online.
    </div>
  );
}
