import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { fetchDashboards, createDashboard, deleteDashboard, type Dashboard } from "@/api/cloud";
import { fetchSifts } from "@/api/extractions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [selectedSiftIds, setSelectedSiftIds] = useState<string[]>([]);

  const { data, isLoading } = useQuery({ queryKey: ["dashboards"], queryFn: fetchDashboards });
  const { data: sifts = [] } = useQuery({ queryKey: ["sifts"], queryFn: fetchSifts });

  const createMutation = useMutation({
    mutationFn: () => createDashboard({ name, sift_ids: selectedSiftIds }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["dashboards"] }); navigate(`/dashboards/${d.id}`); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDashboard,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboards"] }),
  });

  const dashboards = data?.items ?? [];

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboards</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />New dashboard
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : dashboards.length === 0 ? (
        <p className="text-muted-foreground text-sm py-12 text-center">No dashboards yet. Create one to get started.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map((d: Dashboard) => (
            <div
              key={d.id}
              className="rounded-lg border bg-card p-5 space-y-3 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/dashboards/${d.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{d.name}</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(d.id); }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-xs text-muted-foreground">
                {d.widgets?.length ?? 0} widget{(d.widgets?.length ?? 0) !== 1 ? "s" : ""} ·{" "}
                Updated {new Date(d.updated_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Dashboard</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Dashboard name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Sifts</p>
              {(sifts as any[]).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedSiftIds.includes(s.id)}
                    onChange={(e) =>
                      setSelectedSiftIds((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                      )
                    }
                    className="accent-primary"
                  />
                  {s.name}
                </label>
              ))}
            </div>
            <Button
              className="w-full"
              disabled={!name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
