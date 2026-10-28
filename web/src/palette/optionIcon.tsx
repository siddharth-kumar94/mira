import type { ReactNode } from "react";
import { Avatar } from "../components/Avatar";
import { CycleIcon, Icon, ProjectIcon } from "../components/icons";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { labelColor } from "../components/ui";
import type { PickerOption } from "./pickers";

export function optionIcon(o: PickerOption, highlighted = false): ReactNode {
  if (o.status) return <StatusIcon status={o.status} />;
  if (o.priority !== undefined) return <PriorityIcon priority={o.priority} tone={highlighted ? "ink" : "color"} />;
  if (o.user !== undefined) return <Avatar user={o.user} />;
  if (o.cycle) return <CycleIcon cycle={o.cycle} />;
  if (o.project) return <ProjectIcon project={o.project} />;
  if (o.id.startsWith("l:")) return <span className="size-2 rounded-full" style={{ background: labelColor(o.id.slice(2)) }} />;
  if (o.id.startsWith("e") || (o.id === "none" && o.label === "No estimate")) return <Icon name="estimate" size={14} />;
  return null;
}
