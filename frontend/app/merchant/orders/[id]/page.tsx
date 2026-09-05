import { OrderDetailPageContent } from "@/components/merchant/orders/OrderDetailPageContent";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <OrderDetailPageContent orderId={id} />;
}
