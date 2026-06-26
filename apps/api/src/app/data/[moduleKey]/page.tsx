import { getModuleConfig } from '@greencity/shared';
import { ModuleDataPanel } from '@/components/ModuleDataPanel';

export const dynamic = 'force-dynamic';

export default async function DataBrowserPage({
  params,
}: {
  params: Promise<{ moduleKey: string }>;
}) {
  const { moduleKey } = await params;
  const config = getModuleConfig(moduleKey);

  return (
    <ModuleDataPanel
      moduleKey={moduleKey}
      label={config?.label ?? moduleKey}
      subtitle={config?.navPath?.join(' › ')}
    />
  );
}
