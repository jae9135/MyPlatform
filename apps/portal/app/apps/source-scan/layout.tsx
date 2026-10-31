import { appMetadata } from "@/lib/appMetadata";

export const metadata = appMetadata("source-scan");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
