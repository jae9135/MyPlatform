import "./app-shell.css";

export default function AppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="app-shell">{children}</div>;
}
