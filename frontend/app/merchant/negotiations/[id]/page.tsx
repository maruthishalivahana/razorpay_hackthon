import { NegotiationDetailPageContent } from "@/components/merchant/negotiations/NegotiationDetailPageContent";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function NegotiationDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <NegotiationDetailPageContent negotiationId={id} />;
}
