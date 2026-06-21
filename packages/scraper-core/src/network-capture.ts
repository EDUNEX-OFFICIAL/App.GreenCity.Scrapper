import type { Page, Request } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface CapturedRequest {
  phase: string;
  url: string;
  method: string;
  resourceType: string;
  headers: Record<string, string>;
  postData?: string;
  status?: number;
  responseContentType?: string;
  responsePreview?: string;
}

export class NetworkCapture {
  private captures: CapturedRequest[] = [];
  private phase = 'unknown';

  attach(page: Page): void {
    page.on('request', (req) => void this.onRequest(req));
    page.on('response', (res) => void this.onResponse(res.request(), res.status(), res.headers()['content-type']));
  }

  setPhase(phase: string): void {
    this.phase = phase;
  }

  private async onRequest(req: Request): Promise<void> {
    const type = req.resourceType();
    if (type !== 'xhr' && type !== 'fetch' && req.method() !== 'POST') return;
    this.captures.push({
      phase: this.phase,
      url: req.url(),
      method: req.method(),
      resourceType: type,
      headers: req.headers(),
      postData: req.postData() ?? undefined,
    });
  }

  private async onResponse(req: Request, status: number, contentType?: string): Promise<void> {
    const type = req.resourceType();
    if (type !== 'xhr' && type !== 'fetch' && req.method() !== 'POST') return;
    const entry = [...this.captures].reverse().find((c) => c.url === req.url() && c.method === req.method());
    if (!entry) return;
    entry.status = status;
    entry.responseContentType = contentType;
    try {
      const response = await req.response();
      const body = response ? await response.text() : undefined;
      if (body) entry.responsePreview = body.slice(0, 2000);
    } catch {
      // response may be unavailable
    }
  }

  getCaptures(): CapturedRequest[] {
    return this.captures;
  }

  toMarkdown(bpCode: string): string {
    const lines = [
      `# Network Capture Report — ${bpCode}`,
      '',
      `Captured ${this.captures.length} XHR/fetch/POST requests.`,
      '',
    ];
    for (const c of this.captures) {
      lines.push(`## ${c.phase}: ${c.method} ${c.url}`);
      lines.push('');
      lines.push(`- Resource type: ${c.resourceType}`);
      lines.push(`- Status: ${c.status ?? 'pending'}`);
      lines.push(`- Content-Type: ${c.responseContentType ?? 'unknown'}`);
      lines.push('');
      lines.push('### Headers');
      lines.push('```json');
      lines.push(JSON.stringify(c.headers, null, 2));
      lines.push('```');
      if (c.postData) {
        lines.push('');
        lines.push('### Payload');
        lines.push('```');
        lines.push(c.postData.slice(0, 4000));
        lines.push('```');
      }
      if (c.responsePreview) {
        lines.push('');
        lines.push('### Response preview');
        lines.push('```');
        lines.push(c.responsePreview);
        lines.push('```');
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  async saveReport(bpCode: string, dir = './.data/network-capture'): Promise<string> {
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${bpCode}-${Date.now()}.md`);
    await writeFile(path, this.toMarkdown(bpCode), 'utf8');
    return path;
  }
}
