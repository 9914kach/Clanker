import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  Palette,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import { Button } from "@clanker/ui/components/button";
import { Input } from "@clanker/ui/components/input";
import { Badge } from "@clanker/ui/components/badge";
import { Separator } from "@clanker/ui/components/separator";
import { Switch } from "@clanker/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@clanker/ui/components/select";
import { Slider } from "@clanker/ui/components/slider";
import { cn } from "@clanker/ui/lib/utils";
import { useHubLocale } from "@/components/locale-provider";
import { useHubPrefs } from "@/components/HubPrefsProvider";
import {
  DEFAULT_WIDGET_VISUAL_PREFS,
  DEFAULT_HUB_PREFS,
  cloneHubPrefs,
  type HubWidgetSizePreset,
  type HubToneOverride,
  type HubDesktopStylePackId,
  type HubGridDensity,
  type HubSnapStrength,
  type HubDockPosition,
  type HubDockScale,
  type HubCopyPersonality,
  type HubToastVerbosity,
  type HubMemeFrequency,
  type HubInspectCursorPreset,
  type HubInspectCursorColorSource,
  normalizeHubInspectCursorHex,
} from "@/lib/hub-prefs";
import { HUB_EASE_OUT } from "@/lib/hub-motion";

export type HubPrefsWidgetEntry = {
  id: string;
  label: string;
  tone: "useful" | "social" | "chaos";
};

type PanelTab = "widget" | "desktop" | "copy";

type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

function SegmentControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
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

function PrefRow({
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

function PrefRowToggle({
  label,
  description,
  checked,
  onCheckedChange,
  id,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-5 first:mt-0">
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </h3>
    </div>
  );
}

function WidgetTab({ widgets }: { widgets: readonly HubPrefsWidgetEntry[] }) {
  const { copy } = useHubLocale();
  const p = copy.hubPrefsPanel;
  const { prefs, updateWidgetVisualPrefs, patchPrefs } = useHubPrefs();
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(
    widgets[0]?.id ?? null,
  );

  const selectedWidget = widgets.find((w) => w.id === selectedWidgetId) ?? null;
  const wprefs = selectedWidgetId
    ? { ...DEFAULT_WIDGET_VISUAL_PREFS, ...prefs.widgetVisualById[selectedWidgetId] }
    : null;

  const patch = (field: Parameters<typeof updateWidgetVisualPrefs>[1]) => {
    if (!selectedWidgetId) return;
    updateWidgetVisualPrefs(selectedWidgetId, field);
  };

  const resetWidget = () => {
    if (!selectedWidgetId) return;
    patchPrefs({
      widgetVisualById: {
        ...prefs.widgetVisualById,
        [selectedWidgetId]: { ...DEFAULT_WIDGET_VISUAL_PREFS },
      },
    });
  };

  const sizeOptions: SegmentOption<HubWidgetSizePreset>[] = [
    { value: "compact", label: p.widget.sizeCompact },
    { value: "cozy", label: p.widget.sizeCozy },
    { value: "expanded", label: p.widget.sizeExpanded },
  ];

  const toneOptions: SegmentOption<HubToneOverride>[] = [
    { value: "inherit", label: p.widget.toneInherit },
    { value: "useful", label: p.widget.toneUseful },
    { value: "social", label: p.widget.toneSocial },
    { value: "chaos", label: p.widget.toneChaos },
  ];

  const blurOptions: SegmentOption<"0" | "1" | "2" | "3">[] = [
    { value: "0", label: p.widget.blurNone },
    { value: "1", label: p.widget.blurLight },
    { value: "2", label: p.widget.blurMedium },
    { value: "3", label: p.widget.blurStrong },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs text-muted-foreground">{p.widget.widgetLabel}</p>
        <Select value={selectedWidgetId ?? ""} onValueChange={setSelectedWidgetId}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder={p.widget.noWidgetSelected} />
          </SelectTrigger>
          <SelectContent>
            {widgets.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                <span className="flex items-center gap-2">
                  {w.label}
                  <Badge variant="outline" className="text-[0.6rem]">
                    {w.tone}
                  </Badge>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedWidget || !wprefs ? (
        <p className="text-center text-sm text-muted-foreground py-6">{p.widget.selectWidgetHint}</p>
      ) : (
        <div className="space-y-5">
          <PrefRow label={p.widget.sizePreset}>
            <SegmentControl
              options={sizeOptions}
              value={wprefs.sizePreset}
              onChange={(v) => patch({ sizePreset: v })}
            />
          </PrefRow>

          <PrefRow label={p.widget.toneOverride}>
            <SegmentControl
              options={toneOptions}
              value={wprefs.toneOverride}
              onChange={(v) => patch({ toneOverride: v })}
            />
          </PrefRow>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{p.widget.glassOpacity}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{wprefs.glassOpacity}%</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[wprefs.glassOpacity]}
              onValueChange={([v]) => patch({ glassOpacity: v })}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">{p.widget.glassOpacityHint}</p>
          </div>

          <PrefRow label={p.widget.blurStrength}>
            <SegmentControl
              options={blurOptions}
              value={String(wprefs.blurStrength) as "0" | "1" | "2" | "3"}
              onChange={(v) => patch({ blurStrength: Number(v) as 0 | 1 | 2 | 3 })}
            />
          </PrefRow>

          <Separator />

          <PrefRowToggle
            id={`show-subtitle-${selectedWidgetId}`}
            label={p.widget.showSubtitle}
            description={p.widget.showSubtitleDesc}
            checked={wprefs.showSubtitle}
            onCheckedChange={(v) => patch({ showSubtitle: v })}
          />
          <PrefRowToggle
            id={`show-tone-badge-${selectedWidgetId}`}
            label={p.widget.showToneBadge}
            description={p.widget.showToneBadgeDesc}
            checked={wprefs.showToneBadge}
            onCheckedChange={(v) => patch({ showToneBadge: v })}
          />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full rounded-xl text-muted-foreground"
            onClick={resetWidget}
          >
            <RotateCcw className="size-3.5" />
            {p.widget.resetWidget}
          </Button>
        </div>
      )}
    </div>
  );
}

function DevInspectCursorPrefs() {
  const { copy } = useHubLocale();
  const icp = copy.hubPrefsPanel.inspectCursor;
  const { prefs, patchPrefs } = useHubPrefs();
  const ic = prefs.inspectCursor;
  const [hexDraft, setHexDraft] = useState(ic.customColor);

  useEffect(() => {
    setHexDraft(ic.customColor);
  }, [ic.customColor]);

  const presetOptions: SegmentOption<HubInspectCursorPreset>[] = [
    { value: "crosshair", label: icp.presetCrosshair },
    { value: "dot", label: icp.presetDot },
    { value: "ring", label: icp.presetRing },
    { value: "bracket", label: icp.presetBracket },
  ];

  const colorOptions: SegmentOption<HubInspectCursorColorSource>[] = [
    { value: "primary", label: icp.colorPrimary },
    { value: "accent", label: icp.colorAccent },
    { value: "foreground", label: icp.colorForeground },
    { value: "custom", label: icp.colorCustom },
  ];

  const commitHex = () => {
    const n = normalizeHubInspectCursorHex(hexDraft);
    if (n) {
      patchPrefs({ inspectCursor: { ...ic, customColor: n } });
    } else {
      setHexDraft(ic.customColor);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeading>{icp.sectionTitle}</SectionHeading>
      <p className="text-xs text-muted-foreground">{icp.sectionHint}</p>

      <PrefRow label={icp.presetLabel}>
        <SegmentControl
          options={presetOptions}
          value={ic.preset}
          onChange={(v) => patchPrefs({ inspectCursor: { ...ic, preset: v } })}
        />
      </PrefRow>

      <PrefRow label={icp.colorLabel}>
        <SegmentControl
          options={colorOptions}
          value={ic.colorSource}
          onChange={(v) => patchPrefs({ inspectCursor: { ...ic, colorSource: v } })}
        />
      </PrefRow>

      {ic.colorSource === "custom" ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="hub-inspect-cursor-hex">
            {icp.customHexLabel}
          </label>
          <Input
            id="hub-inspect-cursor-hex"
            className="rounded-xl font-mono text-sm"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitHex();
              }
            }}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="hub-inspect-cursor-hex-hint"
          />
          <p id="hub-inspect-cursor-hex-hint" className="text-xs text-muted-foreground">
            {icp.customHexHint}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{icp.sizeLabel}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{ic.sizePercent}%</span>
        </div>
        <Slider
          min={50}
          max={200}
          step={5}
          value={[ic.sizePercent]}
          onValueChange={([v]) => patchPrefs({ inspectCursor: { ...ic, sizePercent: v } })}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">{icp.sizeHint}</p>
      </div>
    </div>
  );
}

function DesktopTab() {
  const { copy } = useHubLocale();
  const p = copy.hubPrefsPanel.desktop;
  const { prefs, patchPrefs } = useHubPrefs();
  const d = prefs.desktop;
  const dock = prefs.dock;
  const motion = prefs.motion;

  const stylePackOptions: SegmentOption<HubDesktopStylePackId>[] = [
    { value: "default", label: p.stylePackDefault },
    { value: "midnight", label: p.stylePackMidnight },
    { value: "paper", label: p.stylePackPaper },
    { value: "signal", label: p.stylePackSignal },
  ];

  const densityOptions: SegmentOption<HubGridDensity>[] = [
    { value: "compact", label: p.gridCompact },
    { value: "cozy", label: p.gridCozy },
    { value: "expanded", label: p.gridExpanded },
  ];

  const snapOptions: SegmentOption<HubSnapStrength>[] = [
    { value: "relaxed", label: p.snapRelaxed },
    { value: "standard", label: p.snapStandard },
    { value: "firm", label: p.snapFirm },
  ];

  const dockPosOptions: SegmentOption<HubDockPosition>[] = [
    { value: "bottom", label: p.dockBottom },
    { value: "left", label: p.dockLeft },
  ];

  const dockScaleOptions: SegmentOption<HubDockScale>[] = [
    { value: "sm", label: p.dockSm },
    { value: "md", label: p.dockMd },
    { value: "lg", label: p.dockLg },
  ];

  return (
    <div className="space-y-5">
      <SectionHeading>{copy.hubPrefsPanel.tabs.desktop}</SectionHeading>

      <PrefRow label={p.stylePack}>
        <SegmentControl
          options={stylePackOptions}
          value={d.stylePackId}
          onChange={(v) => patchPrefs({ desktop: { ...d, stylePackId: v } })}
        />
      </PrefRow>

      <PrefRow label={p.gridDensity}>
        <SegmentControl
          options={densityOptions}
          value={d.gridDensity}
          onChange={(v) => patchPrefs({ desktop: { ...d, gridDensity: v } })}
        />
      </PrefRow>

      <PrefRow label={p.snapStrength}>
        <SegmentControl
          options={snapOptions}
          value={d.snapStrength}
          onChange={(v) => patchPrefs({ desktop: { ...d, snapStrength: v } })}
        />
      </PrefRow>

      <Separator />

      <PrefRow label={p.dockPosition}>
        <SegmentControl
          options={dockPosOptions}
          value={dock.position}
          onChange={(v) => patchPrefs({ dock: { ...dock, position: v } })}
        />
      </PrefRow>

      <PrefRow label={p.dockScale}>
        <SegmentControl
          options={dockScaleOptions}
          value={dock.scale}
          onChange={(v) => patchPrefs({ dock: { ...dock, scale: v } })}
        />
      </PrefRow>

      <Separator />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{p.animationIntensity}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{motion.animationIntensity}%</span>
        </div>
        <Slider
          min={0}
          max={100}
          step={10}
          value={[motion.animationIntensity]}
          onValueChange={([v]) => patchPrefs({ motion: { animationIntensity: v } })}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">{p.animationIntensityHint}</p>
      </div>

      {import.meta.env.DEV ? (
        <>
          <Separator />
          <DevInspectCursorPrefs />
        </>
      ) : null}
    </div>
  );
}

function PersonalityCard({
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

function CopyTab() {
  const { copy } = useHubLocale();
  const p = copy.hubPrefsPanel.copy;
  const { prefs, patchPrefs } = useHubPrefs();
  const cs = prefs.copyStyle;

  const verbosityOptions: SegmentOption<HubToastVerbosity>[] = [
    { value: "minimal", label: p.toastMinimal },
    { value: "normal", label: p.toastNormal },
    { value: "verbose", label: p.toastVerbose },
  ];

  const memeOptions: SegmentOption<HubMemeFrequency>[] = [
    { value: "off", label: p.memeOff },
    { value: "low", label: p.memeLow },
    { value: "normal", label: p.memeNormal },
  ];

  const personalities: {
    value: HubCopyPersonality;
    label: string;
    description: string;
    accent: string;
  }[] = [
    { value: "calm", label: p.personalityCalm, description: p.personalityCalmDesc, accent: "bg-blue-400" },
    { value: "normal", label: p.personalityNormal, description: p.personalityNormalDesc, accent: "bg-primary" },
    { value: "chaotic", label: p.personalityChaotic, description: p.personalityChaoticDesc, accent: "bg-destructive" },
  ];

  const verbosityDescMap: Record<HubToastVerbosity, string> = {
    minimal: p.toastMinimalDesc,
    normal: p.toastNormalDesc,
    verbose: p.toastVerboseDesc,
  };

  const memeDescMap: Record<HubMemeFrequency, string> = {
    off: p.memeOffDesc,
    low: p.memeLowDesc,
    normal: p.memeNormalDesc,
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>{p.personality}</SectionHeading>
        <div className="grid grid-cols-1 gap-2">
          {personalities.map((pers) => (
            <PersonalityCard
              key={pers.value}
              label={pers.label}
              description={pers.description}
              selected={cs.personality === pers.value}
              onClick={() => patchPrefs({ copyStyle: { ...cs, personality: pers.value } })}
              accentClass={pers.accent}
            />
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <SectionHeading>{p.toastVerbosity}</SectionHeading>
        <SegmentControl
          options={verbosityOptions}
          value={cs.toastVerbosity}
          onChange={(v) => patchPrefs({ copyStyle: { ...cs, toastVerbosity: v } })}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{verbosityDescMap[cs.toastVerbosity]}</p>
      </div>

      <Separator />

      <div>
        <SectionHeading>{p.memeFrequency}</SectionHeading>
        <SegmentControl
          options={memeOptions}
          value={cs.memeFrequency}
          onChange={(v) => patchPrefs({ copyStyle: { ...cs, memeFrequency: v } })}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{memeDescMap[cs.memeFrequency]}</p>
      </div>
    </div>
  );
}

export type HubPrefsPanelProps = {
  open: boolean;
  onClose: () => void;
  widgets: readonly HubPrefsWidgetEntry[];
};

export default function HubPrefsPanel({ open, onClose, widgets }: HubPrefsPanelProps) {
  const { copy } = useHubLocale();
  const p = copy.hubPrefsPanel;
  const { patchPrefs } = useHubPrefs();
  const reducedMotion = useReducedMotion() ?? false;
  const [activeTab, setActiveTab] = useState<PanelTab>("desktop");

  const tabs: { id: PanelTab; label: string }[] = [
    { id: "widget", label: p.tabs.widget },
    { id: "desktop", label: p.tabs.desktop },
    { id: "copy", label: p.tabs.copy },
  ];

  const handleResetAll = () => {
    patchPrefs(cloneHubPrefs(DEFAULT_HUB_PREFS));
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="prefs-backdrop"
            initial={reducedMotion ? undefined : { opacity: 0 }}
            animate={reducedMotion ? undefined : { opacity: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18, ease: HUB_EASE_OUT }}
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            key="prefs-panel"
            role="dialog"
            aria-label={p.title}
            initial={reducedMotion ? undefined : { x: "100%" }}
            animate={reducedMotion ? undefined : { x: 0 }}
            exit={reducedMotion ? undefined : { x: "100%" }}
            transition={{ duration: 0.24, ease: HUB_EASE_OUT }}
            className={cn(
              "fixed right-0 top-0 bottom-0 z-50 flex w-[min(24rem,100vw)] flex-col",
              "border-l border-border/60 bg-background/95 shadow-2xl backdrop-blur-xl",
            )}
          >
            <div className="flex items-start justify-between border-b border-border/55 px-4 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="rounded-xl border border-border/60 bg-primary/14 p-1.5 text-primary">
                    <Settings2 className="size-4" />
                  </div>
                  <h2 className="text-sm font-semibold">{p.title}</h2>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label={p.closeButton}
                className="rounded-xl"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex gap-0.5 border-b border-border/55 px-3 py-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex-1 rounded-xl px-2 py-1.5 text-xs font-medium transition",
                    activeTab === tab.id
                      ? "bg-primary/12 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {activeTab === "widget" && <WidgetTab widgets={widgets} />}
              {activeTab === "desktop" && <DesktopTab />}
              {activeTab === "copy" && <CopyTab />}
            </div>

            <div className="border-t border-border/55 px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full rounded-xl text-muted-foreground text-xs"
                onClick={handleResetAll}
              >
                <RotateCcw className="size-3" />
                {p.resetAll}
              </Button>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export function HubPrefsPanelTrigger({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className="rounded-xl gap-1.5"
    >
      <Palette className="size-4" />
      <span className="hidden sm:inline">{label}</span>
      <ChevronDown className="size-3 opacity-60" />
    </Button>
  );
}
