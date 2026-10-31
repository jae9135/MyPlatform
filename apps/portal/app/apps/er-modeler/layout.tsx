import { appMetadata } from "@/lib/appMetadata";

export const metadata = appMetadata("er-modeler");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
