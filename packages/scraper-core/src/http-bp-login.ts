import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bpUrl, createLogger, fieldsToUrlEncoded, loadConfig, parseAspNetFormFields } from '@greencity/shared';

const log = createLogger('http-bp-login');

function parseSetCookieHeaders(res: Response, jar: Record<string, string>): Record<string, string> {
  const next = { ...jar };
  const raw = res.headers.get('set-cookie');
  if (!raw) return next;
  for (const part of raw.split(/,(?=[^;]+?=)/)) {
    const [nameValue] = part.split(';');
    const eq = nameValue.indexOf('=');
    if (eq <= 0) continue;
    next[nameValue.slice(0, eq).trim()] = nameValue.slice(eq + 1).trim();
  }
  return next;
}

function cookieJarToHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ');
}

async function saveCookieJar(bpCode: string, jar: Record<string, string>): Promise<void> {
  const cfg = loadConfig();
  const path = join(cfg.storageStateDir, `bp-${bpCode}.json`);
  const state = {
    cookies: Object.entries(jar).map(([name, value]) => ({
      name,
      value,
      domain: 'app.greencity.org.in',
      path: '/',
    })),
  };
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

/** ASP.NET BP login via raw HTTP — no Playwright. Returns Cookie header or null. */
export async function loginBpViaHttp(bpCode: string, password: string): Promise<string | null> {
  const cfg = loadConfig();
  const loginUrl = bpUrl(cfg.erpBaseUrl, '/Login.aspx');
  let jar: Record<string, string> = {};

  try {
    const getRes = await fetch(loginUrl);
    jar = parseSetCookieHeaders(getRes, jar);
    const html = await getRes.text();
    const fields = parseAspNetFormFields(html);

    const userKey = Object.keys(fields).find((k) => /UserName/i.test(k));
    const passKey = Object.keys(fields).find((k) => /Password/i.test(k));
    if (!userKey || !passKey) {
      log.warn({ bpCode }, 'BP login form fields not found');
      return null;
    }

    fields[userKey] = bpCode;
    fields[passKey] = password;
    fields.Button1 = 'Login';

    const postRes = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieJarToHeader(jar),
        Referer: loginUrl,
        Origin: new URL(loginUrl).origin,
      },
      body: fieldsToUrlEncoded(fields),
      redirect: 'manual',
    });
    jar = parseSetCookieHeaders(postRes, jar);

    if (postRes.status >= 300 && postRes.status < 400) {
      const location = postRes.headers.get('location');
      if (location) {
        const redirectUrl = location.startsWith('http')
          ? location
          : new URL(location, loginUrl).href;
        const redirectRes = await fetch(redirectUrl, {
          headers: { Cookie: cookieJarToHeader(jar) },
          redirect: 'follow',
        });
        jar = parseSetCookieHeaders(redirectRes, jar);
      }
    } else if (!postRes.ok) {
      log.warn({ bpCode, status: postRes.status }, 'BP HTTP login POST failed');
      return null;
    }

    const probe = await fetch(bpUrl(cfg.erpBaseUrl, '/team/TreeSponsor.aspx'), {
      headers: { Cookie: cookieJarToHeader(jar) },
    });
    const probeHtml = await probe.text();
    if (
      probe.status === 404 ||
      /Login\.aspx/i.test(probe.url) ||
      probeHtml.includes('PasswordTextBox') ||
      !probeHtml.includes('mytree.add')
    ) {
      log.warn({ bpCode, status: probe.status }, 'BP HTTP login failed — tree probe rejected session');
      return null;
    }

    const header = cookieJarToHeader(jar);
    await saveCookieJar(bpCode, jar).catch(() => undefined);
    log.info({ bpCode }, 'BP HTTP login successful');
    return header;
  } catch (err) {
    log.warn({ bpCode, err: err instanceof Error ? err.message : String(err) }, 'BP HTTP login error');
    return null;
  }
}
