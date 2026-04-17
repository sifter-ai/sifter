import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchPublicShare, unlockShare, type Share } from "@/api/cloud";
import { BlockRenderer } from "@/components/cloud/BlockRenderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicViewerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [viewJwt, setViewJwt] = useState<string>(() => sessionStorage.getItem(`share_jwt_${slug}`) ?? "");
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");

  const { data: share, isLoading, error } = useQuery({
    queryKey: ["public-share", slug, viewJwt],
    queryFn: () => fetchPublicShare(slug!, viewJwt || undefined),
    retry: false,
  });

  const unlockMutation = useMutation({
    mutationFn: () => unlockShare(slug!, password),
    onSuccess: ({ view_token }) => {
      sessionStorage.setItem(`share_jwt_${slug}`, view_token);
      setViewJwt(view_token);
    },
    onError: () => setUnlockError("Incorrect password"),
  });

  const httpStatus = (error as any)?.status;
  const isPasswordRequired = httpStatus === 401 && !viewJwt;
  const isGone = httpStatus === 404 || httpStatus === 410;

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isGone) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-muted-foreground">This link has expired or been revoked.</p>
      </div>
    );
  }

  if (isPasswordRequired || (!share && !isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm space-y-4 p-8">
          <h1 className="text-lg font-semibold">Password required</h1>
          <Input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlockMutation.mutate()}
          />
          {unlockError && <p className="text-sm text-destructive">{unlockError}</p>}
          <Button className="w-full" onClick={() => unlockMutation.mutate()} disabled={unlockMutation.isPending}>
            {unlockMutation.isPending ? "Unlocking…" : "Unlock"}
          </Button>
        </div>
      </div>
    );
  }

  if (!share) return null;

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">{share.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Shared on {new Date(share.created_at).toLocaleDateString()}
        </p>
      </div>
      {Array.isArray((share as any).source_snapshot) ? (
        <div className="space-y-4">
          {((share as any).source_snapshot as any[]).map((block: any, i: number) => (
            <BlockRenderer key={i} block={block} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No content available.</p>
      )}
    </div>
  );
}
