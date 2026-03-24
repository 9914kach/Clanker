import devSession from "./dev-session.json";
import homelabDeploy from "./homelab-deploy.json";
import type { ChecklistDefinition } from "@/tools/checklistTypes";

export const checklists = [homelabDeploy, devSession] satisfies ChecklistDefinition[];
