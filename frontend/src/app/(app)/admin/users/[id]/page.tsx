import { AdminUserDetails } from "@/components/AdminUserDetails";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminUserDetails id={id} />;
}
