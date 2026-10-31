import { appMetadata } from "@/lib/appMetadata";

export const metadata = appMetadata("receipt-to-pdf");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
