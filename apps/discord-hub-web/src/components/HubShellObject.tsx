import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@clanker/ui/lib/utils";
import { hubContextData } from "@/lib/hub-shell-context";
import type { HubShellObjectKind } from "@/lib/hub-shell-object-kinds";

export type HubShellObjectTag = "div" | "nav" | "section";

type HubShellObjectProps = {
  as?: HubShellObjectTag;
  objectId: string;
  objectKind: HubShellObjectKind;
  label: string;
  layoutEditMode?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

/**
 * Marks a region as a shell-managed object for context menus and layout-edit chrome.
 */
export default function HubShellObject({
  as = "div",
  objectId,
  objectKind,
  label,
  layoutEditMode = false,
  className,
  children,
  ...rest
}: HubShellObjectProps) {
  const Comp = as as ElementType;

  return (
    <Comp
      {...rest}
      className={cn(
        className,
        layoutEditMode &&
          "relative rounded-md outline outline-2 outline-dashed outline-primary/50 outline-offset-2 ring-2 ring-primary/15 transition-[outline-color,box-shadow] duration-200",
      )}
      data-shell-object-id={objectId}
      data-shell-object-kind={objectKind}
      {...hubContextData({
        type: "shell.object",
        kind: objectKind,
        objectId,
        label,
      })}
    >
      {children}
    </Comp>
  );
}
