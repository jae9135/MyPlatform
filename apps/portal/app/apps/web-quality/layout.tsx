import { appMetadata } from "@/lib/appMetadata";

export const metadata = appMetadata("web-quality");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
