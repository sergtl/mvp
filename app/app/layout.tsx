import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "../components/layout";

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <TooltipProvider>
      <Layout>{children}</Layout>
    </TooltipProvider>
  );
}
