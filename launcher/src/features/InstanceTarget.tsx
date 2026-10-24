import { tr } from "../lib/i18n";
import { useApp } from "../state/AppState";
import { Select } from "../components/ui";

/** Where a resource pack gets installed: the vanilla .minecraft folder or a VEX instance. */
export function InstanceTarget({ id, value, onChange }: { id?: string; value: string; onChange(v: string): void }) {
  const { instances, info, settings } = useApp();
  const defaultExists = !!settings.minecraftDir || !!info?.defaultMinecraftDirExists;
  return (
    <Select id={id} value={value} onChange={onChange} options={[
      { value: "default", label: defaultExists ? tr("Default Minecraft folder") : tr("Default Minecraft folder (not found)") },
      ...instances.map((i) => ({ value: i.id, label: `${i.name} · ${i.version}` })),
    ]} />
  );
}
