import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <Sidebar />
      <TopBar user={session.user ?? {}} />
      <div className="pl-[220px] pt-14">
        <main className="p-5">{children}</main>
      </div>
    </div>
  );
}
