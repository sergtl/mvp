import {
  ClipboardList,
  FileUser,
  IdCard,
  NotebookPen,
  Send,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { title: string; url: string; icon?: LucideIcon | null };

export const navItems: NavItem[] = [
  { title: "Apply to a job", url: "/app", icon: Send },
  { title: "Applications", url: "/app/applications", icon: ClipboardList },
  { title: "My CVs", url: "/app/my-cvs", icon: FileUser },
  { title: "Profile", url: "/app/profile", icon: IdCard },
  { title: "Saved answers", url: "/app/answers", icon: NotebookPen },
];
