import { appMetadata } from "@/lib/appMetadata";

export const metadata = appMetadata("chk-db-std");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
