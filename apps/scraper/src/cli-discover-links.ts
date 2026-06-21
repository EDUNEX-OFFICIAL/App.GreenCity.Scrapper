import { SessionManager } from './session/manager.js';
import { writeFile } from 'node:fs/promises';

async function main() {
  const session = new SessionManager();
  await session.withAdminPage(async (page) => {
    await page.goto('http://app.greencity.org.in/_admin/home/', { waitUntil: 'networkidle', timeout: 60000 });
    const html = await page.content();
    await writeFile('/data/debug-home.html', html);

    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        text: (a.textContent ?? '').trim().slice(0, 80),
        href: (a as HTMLAnchorElement).href,
      })),
    );

    const interesting = hrefs.filter(
      (l) =>
        l.href.includes('.aspx') ||
        /bank|sale|bp|master|account|neft/i.test(l.text) ||
        /bank|sale|bp|master|account|neft/i.test(l.href),
    );

    console.log('Total links:', hrefs.length);
    console.log('Interesting links:');
    for (const l of interesting.slice(0, 80)) {
      console.log(`  [${l.text}] -> ${l.href}`);
    }

    // Also dump frames
    const frames = page.frames();
    console.log('Frames:', frames.map((f) => f.url()));
  });
  await session.close();
}

main().catch(console.error);
