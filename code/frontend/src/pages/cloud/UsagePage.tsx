import { useQuery } from "@tanstack/react-query";
import { fetchUsage } from "@/api/cloud";
import { UsageBar } from "@/components/cloud/UsageBar";
import { Skeleton } from "@/components/ui/skeleton";

export default function UsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["usage"],
    queryFn: fetchUsage,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Usage</h2>
      <div className="space-y-5 max-w-lg">
        <UsageBar label="Documents processed" value={data.docs_processed} limit={data.docs_limit} />
        <UsageBar label="Storage" value={data.storage_bytes} limit={data.storage_limit_mb} unit="bytes" />
        <UsageBar label="Sifts" value={data.sifts_count} limit={data.sifts_limit} />
      </div>
      <p className="text-xs text-muted-foreground">Usage alerts are sent at 50%, 80%, and 100% of quota.</p>
    </div>
  );
}
