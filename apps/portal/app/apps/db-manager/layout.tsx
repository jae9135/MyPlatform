import { appMetadata } from "@/lib/appMetadata";

export const metadata = appMetadata("db-manager");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
