import { AdminAnnouncementEditor } from "@/components/AdminAnnouncementEditor";

export default async function AdminAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminAnnouncementEditor id={id} />;
}
