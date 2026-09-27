export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell min-h-screen bg-background text-foreground flex items-center justify-center">
      {children}
    </div>
  );
}
