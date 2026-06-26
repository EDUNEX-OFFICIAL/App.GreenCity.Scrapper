import type { Page } from 'playwright';
import {
  buildPostBackFields,
  detectGridEventTarget,
  fieldsToUrlEncoded,
  GRID_EVENT_TARGET,
  VIEW_ALL_TARGET,
} from '@greencity/shared';

/** Trigger ASP.NET postback from Playwright page */
export async function triggerPostBack(
  page: Page,
  eventTarget: string,
  eventArgument = '',
): Promise<void> {
  await page.waitForSelector('#aspnetForm, #form1, form[name="aspnetForm"]', {
    state: 'attached',
    timeout: 60000,
  });
  await page.evaluate(
    ({ target, argument }) => {
      const form =
        (document.getElementById('aspnetForm') as HTMLFormElement | null) ??
        (document.getElementById('form1') as HTMLFormElement | null) ??
        (document.querySelector('form[name="aspnetForm"]') as HTMLFormElement | null);
      if (!form) throw new Error('aspnetForm not found');
      const targetInput = form.querySelector('[name="__EVENTTARGET"]') as HTMLInputElement | null;
      const argInput = form.querySelector('[name="__EVENTARGUMENT"]') as HTMLInputElement | null;
      if (targetInput) targetInput.value = target;
      if (argInput) argInput.value = argument;
      form.submit();
    },
    { target: eventTarget, argument: eventArgument },
  );
  await page.waitForLoadState('domcontentloaded');
}

export async function triggerViewAll(page: Page, html?: string): Promise<void> {
  const content = html ?? (await page.content());
  const target = detectGridEventTarget(content);
  const viewAll = content.match(/id=["']([^"']*lbtnAll)["']/i);
  if (viewAll) {
    await triggerPostBack(page, viewAll[1].replace(/_/g, '$'));
  } else {
    await triggerPostBack(page, VIEW_ALL_TARGET);
  }
}

export async function triggerGridPage(
  page: Page,
  gridTarget?: string,
  pageNum?: number,
): Promise<void> {
  const html = await page.content();
  const target = gridTarget ?? detectGridEventTarget(html);
  await triggerPostBack(page, target, `Page$${pageNum ?? 2}`);
}

export { buildPostBackFields, fieldsToUrlEncoded, GRID_EVENT_TARGET, VIEW_ALL_TARGET };
