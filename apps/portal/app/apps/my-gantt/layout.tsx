import { appMetadata } from "@/lib/appMetadata";

export const metadata = appMetadata("my-gantt");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
