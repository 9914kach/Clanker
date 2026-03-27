import { Slider } from "@clanker/ui/components/slider";
import { Switch } from "@clanker/ui/components/switch";
import { cn } from "@clanker/ui/lib/utils";

export type HubSegmentOption<T extends string> = {
  value: T;
  label: string;
};

export function HubSegmentControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly HubSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-xl border border-border/60 bg-muted/40 p-0.5", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={cn(
            "flex-1 rounded-[0.6rem] px-2.5 py-1.5 text-xs font-medium transition",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function HubPrefRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function HubPrefToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  id,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function HubPrefSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-5 first:mt-0">
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </h3>
    </div>
  );
}

export function HubPrefSliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        className="w-full"
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function HubPrefChoiceCard({
  label,
  description,
  selected,
  onClick,
  accentClass,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  accentClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-3 text-left transition",
        selected
          ? "border-primary/60 bg-primary/10 shadow-sm"
          : "border-border/60 bg-muted/30 hover:bg-muted/60",
      )}
    >
      <span className={cn("text-sm font-semibold", selected ? "text-foreground" : "text-muted-foreground")}>
        <span className={cn("mr-1.5 inline-block size-2 rounded-full", accentClass)} aria-hidden />
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
