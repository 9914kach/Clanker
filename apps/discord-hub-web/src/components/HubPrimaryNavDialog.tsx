import { useEffect, useState } from "react";
import { Button } from "@clanker/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@clanker/ui/components/dialog";
import { Input } from "@clanker/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@clanker/ui/components/select";
import type { HubCopy } from "@/i18n/hub-copy";
import {
  HUB_NAV_BOOKMARK_ICON_KEYS,
  normalizeNavBookmarkIconKey,
  resolveNavBookmarkIcon,
  type HubNavBookmarkIconKey,
} from "@/lib/hub-nav-bookmark-icons";
import type { HubPrimaryNavItemId } from "@/lib/hub-shell-layout-order";

export default function HubPrimaryNavDialog({
  open,
  navId,
  initialLabel,
  initialPath,
  initialIconKey,
  copy,
  onOpenChange,
  onCommit,
}: {
  open: boolean;
  navId: HubPrimaryNavItemId;
  initialLabel: string;
  initialPath: string;
  initialIconKey: HubNavBookmarkIconKey;
  copy: HubCopy["primaryNav"];
  onOpenChange: (open: boolean) => void;
  onCommit: (payload: {
    navId: HubPrimaryNavItemId;
    label: string;
    path: string;
    iconKey: HubNavBookmarkIconKey;
  }) => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [path, setPath] = useState(initialPath);
  const [iconKey, setIconKey] = useState<HubNavBookmarkIconKey>(() =>
    normalizeNavBookmarkIconKey(initialIconKey),
  );

  useEffect(() => {
    if (open) {
      setLabel(initialLabel);
      setPath(initialPath);
      setIconKey(normalizeNavBookmarkIconKey(initialIconKey));
    }
  }, [open, initialLabel, initialPath, initialIconKey]);

  const handleSave = () => {
    onCommit({
      navId,
      label: label.trim(),
      path: path.trim(),
      iconKey: normalizeNavBookmarkIconKey(iconKey),
    });
  };

  const SelectedIcon = resolveNavBookmarkIcon(iconKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{copy.dialogEditTitle}</DialogTitle>
          <DialogDescription>{copy.dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <label htmlFor="hub-primary-nav-label" className="text-xs font-medium text-muted-foreground">
              {copy.labelField}
            </label>
            <Input
              id="hub-primary-nav-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1.5">
            <span id="hub-primary-nav-icon-label" className="text-xs font-medium text-muted-foreground">
              {copy.iconField}
            </span>
            <Select value={iconKey} onValueChange={(v) => setIconKey(normalizeNavBookmarkIconKey(v))}>
              <SelectTrigger
                id="hub-primary-nav-icon"
                size="default"
                className="w-full min-w-0"
                aria-labelledby="hub-primary-nav-icon-label"
              >
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <SelectedIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{copy.iconNames[iconKey]}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" className="min-w-[var(--radix-select-trigger-width)]">
                {HUB_NAV_BOOKMARK_ICON_KEYS.map((key) => {
                  const Icon = resolveNavBookmarkIcon(key);
                  return (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        {copy.iconNames[key]}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="hub-primary-nav-path" className="text-xs font-medium text-muted-foreground">
              {copy.pathField}
            </label>
            <Input
              id="hub-primary-nav-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              autoComplete="off"
              placeholder={copy.pathHint}
            />
          </div>
        </div>
        <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {copy.cancel}
            </Button>
            <Button type="button" onClick={handleSave}>
              {copy.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
