export function ModuleDataPanel({
  moduleKey,
  label,
  subtitle,
}: {
  moduleKey: string;
  label?: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h1>{label ?? moduleKey}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      <p>Module data: {moduleKey}</p>
    </div>
  );
}
