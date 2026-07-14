export default function MaintenanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Minimal layout — no providers, no sidebar, no scripts
  return children;
}
