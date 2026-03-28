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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@clanker/ui/components/select";
import { cn } from "@clanker/ui/lib/utils";
import { useHubLocale } from "@/components/locale-provider";
import { useHubPrefs } from "@/components/HubPrefsProvider";
import {
  HubPrefChoiceCard,
  HubPrefRow,
  HubPrefSectionHeading,
  HubPrefSliderRow,
  HubPrefToggleRow,
  HubSegmentControl,
  type HubSegmentOption,
} from "@/components/HubPrefsControls";
import {
  DEFAULT_WIDGET_VISUAL_PREFS,
  DEFAULT_HUB_PREFS,
  cloneHubPrefs,
  type HubWidgetSizePreset,
  type HubToneOverride,
  type HubDesktopStylePackId,
  type HubGridDensity,
  type HubGridCompaction,
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

  const sizeOptions: HubSegmentOption<HubWidgetSizePreset>[] = [
    { value: "compact", label: p.widget.sizeCompact },
    { value: "cozy", label: p.widget.sizeCozy },
    { value: "expanded", label: p.widget.sizeExpanded },
  ];

  const toneOptions: HubSegmentOption<HubToneOverride>[] = [
    { value: "inherit", label: p.widget.toneInherit },
    { value: "useful", label: p.widget.toneUseful },
    { value: "social", label: p.widget.toneSocial },
    { value: "chaos", label: p.widget.toneChaos },
  ];

  const blurOptions: HubSegmentOption<"0" | "1" | "2" | "3">[] = [
    { value: "0", label: p.widget.blurNone },
    { value: "1", label: p.widget.blurLight },
    { value: "2", label: p.widget.blurMedium },
    { value: "3", label: p.widget.blurStrong },
  ];

  return (
    <div className="flex flex-col gap-4">
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
        <div className="flex flex-col gap-5">
          <HubPrefRow label={p.widget.sizePreset}>
            <HubSegmentControl
              options={sizeOptions}
              value={wprefs.sizePreset}
              onChange={(v) => patch({ sizePreset: v })}
            />
          </HubPrefRow>

          <HubPrefRow label={p.widget.toneOverride}>
            <HubSegmentControl
              options={toneOptions}
              value={wprefs.toneOverride}
              onChange={(v) => patch({ toneOverride: v })}
            />
          </HubPrefRow>

          <HubPrefSliderRow
            label={p.widget.glassOpacity}
            hint={p.widget.glassOpacityHint}
            min={0}
            max={100}
            step={5}
            value={wprefs.glassOpacity}
            onChange={(v) => patch({ glassOpacity: v })}
          />

          <HubPrefRow label={p.widget.blurStrength}>
            <HubSegmentControl
              options={blurOptions}
              value={String(wprefs.blurStrength) as "0" | "1" | "2" | "3"}
              onChange={(v) => patch({ blurStrength: Number(v) as 0 | 1 | 2 | 3 })}
            />
          </HubPrefRow>

          <Separator />

          <HubPrefToggleRow
            id={`show-subtitle-${selectedWidgetId}`}
            label={p.widget.showSubtitle}
            description={p.widget.showSubtitleDesc}
            checked={wprefs.showSubtitle}
            onCheckedChange={(v) => patch({ showSubtitle: v })}
          />
          <HubPrefToggleRow
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

  const presetOptions: HubSegmentOption<HubInspectCursorPreset>[] = [
    { value: "crosshair", label: icp.presetCrosshair },
    { value: "dot", label: icp.presetDot },
    { value: "ring", label: icp.presetRing },
    { value: "bracket", label: icp.presetBracket },
  ];

  const colorOptions: HubSegmentOption<HubInspectCursorColorSource>[] = [
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
    <div className="flex flex-col gap-4">
      <HubPrefSectionHeading>{icp.sectionTitle}</HubPrefSectionHeading>
      <p className="text-xs text-muted-foreground">{icp.sectionHint}</p>

      <HubPrefRow label={icp.presetLabel}>
        <HubSegmentControl
          options={presetOptions}
          value={ic.preset}
          onChange={(v) => patchPrefs({ inspectCursor: { ...ic, preset: v } })}
        />
      </HubPrefRow>

      <HubPrefRow label={icp.colorLabel}>
        <HubSegmentControl
          options={colorOptions}
          value={ic.colorSource}
          onChange={(v) => patchPrefs({ inspectCursor: { ...ic, colorSource: v } })}
        />
      </HubPrefRow>

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

      <HubPrefSliderRow
        label={icp.sizeLabel}
        hint={icp.sizeHint}
        min={50}
        max={200}
        step={5}
        value={ic.sizePercent}
        onChange={(v) => patchPrefs({ inspectCursor: { ...ic, sizePercent: v } })}
      />
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

  const stylePackOptions: HubSegmentOption<HubDesktopStylePackId>[] = [
    { value: "default", label: p.stylePackDefault },
    { value: "midnight", label: p.stylePackMidnight },
    { value: "paper", label: p.stylePackPaper },
    { value: "signal", label: p.stylePackSignal },
    { value: "campfire", label: p.stylePackCampfire },
  ];

  const densityOptions: HubSegmentOption<HubGridDensity>[] = [
    { value: "compact", label: p.gridCompact },
    { value: "cozy", label: p.gridCozy },
    { value: "expanded", label: p.gridExpanded },
  ];
  const compactionOptions: HubSegmentOption<HubGridCompaction>[] = [
    { value: "none", label: p.gridCompactionNone },
    { value: "pack", label: p.gridCompactionPack },
  ];

  const snapOptions: HubSegmentOption<HubSnapStrength>[] = [
    { value: "relaxed", label: p.snapRelaxed },
    { value: "standard", label: p.snapStandard },
    { value: "firm", label: p.snapFirm },
  ];

  const dockPosOptions: HubSegmentOption<HubDockPosition>[] = [
    { value: "bottom", label: p.dockBottom },
    { value: "left", label: p.dockLeft },
  ];

  const dockScaleOptions: HubSegmentOption<HubDockScale>[] = [
    { value: "sm", label: p.dockSm },
    { value: "md", label: p.dockMd },
    { value: "lg", label: p.dockLg },
  ];

  return (
    <div className="flex flex-col gap-5">
      <HubPrefSectionHeading>{copy.hubPrefsPanel.tabs.desktop}</HubPrefSectionHeading>

      <HubPrefRow label={p.stylePack}>
        <HubSegmentControl
          options={stylePackOptions}
          value={d.stylePackId}
          onChange={(v) => patchPrefs({ desktop: { ...d, stylePackId: v } })}
        />
      </HubPrefRow>

      <HubPrefRow label={p.gridDensity}>
        <HubSegmentControl
          options={densityOptions}
          value={d.gridDensity}
          onChange={(v) => patchPrefs({ desktop: { ...d, gridDensity: v } })}
        />
      </HubPrefRow>

      <HubPrefRow label={p.gridCompaction}>
        <HubSegmentControl
          options={compactionOptions}
          value={d.gridCompaction}
          onChange={(v) => patchPrefs({ desktop: { ...d, gridCompaction: v } })}
        />
      </HubPrefRow>

      <HubPrefRow label={p.snapStrength}>
        <HubSegmentControl
          options={snapOptions}
          value={d.snapStrength}
          onChange={(v) => patchPrefs({ desktop: { ...d, snapStrength: v } })}
        />
      </HubPrefRow>

      <Separator />

      <HubPrefRow label={p.dockPosition}>
        <HubSegmentControl
          options={dockPosOptions}
          value={dock.position}
          onChange={(v) => patchPrefs({ dock: { ...dock, position: v } })}
        />
      </HubPrefRow>

      <HubPrefRow label={p.dockScale}>
        <HubSegmentControl
          options={dockScaleOptions}
          value={dock.scale}
          onChange={(v) => patchPrefs({ dock: { ...dock, scale: v } })}
        />
      </HubPrefRow>

      <Separator />

      <HubPrefSliderRow
        label={p.animationIntensity}
        hint={p.animationIntensityHint}
        min={0}
        max={100}
        step={10}
        value={motion.animationIntensity}
        onChange={(v) => patchPrefs({ motion: { animationIntensity: v } })}
      />

      {import.meta.env.DEV ? (
        <>
          <Separator />
          <DevInspectCursorPrefs />
        </>
      ) : null}
    </div>
  );
}

function CopyTab() {
  const { copy } = useHubLocale();
  const p = copy.hubPrefsPanel.copy;
  const { prefs, patchPrefs } = useHubPrefs();
  const cs = prefs.copyStyle;

  const verbosityOptions: HubSegmentOption<HubToastVerbosity>[] = [
    { value: "minimal", label: p.toastMinimal },
    { value: "normal", label: p.toastNormal },
    { value: "verbose", label: p.toastVerbose },
  ];

  const memeOptions: HubSegmentOption<HubMemeFrequency>[] = [
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
    <div className="flex flex-col gap-5">
      <div>
        <HubPrefSectionHeading>{p.personality}</HubPrefSectionHeading>
        <div className="grid grid-cols-1 gap-2">
          {personalities.map((pers) => (
            <HubPrefChoiceCard
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
        <HubPrefSectionHeading>{p.toastVerbosity}</HubPrefSectionHeading>
        <HubSegmentControl
          options={verbosityOptions}
          value={cs.toastVerbosity}
          onChange={(v) => patchPrefs({ copyStyle: { ...cs, toastVerbosity: v } })}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{verbosityDescMap[cs.toastVerbosity]}</p>
      </div>

      <Separator />

      <div>
        <HubPrefSectionHeading>{p.memeFrequency}</HubPrefSectionHeading>
        <HubSegmentControl
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
