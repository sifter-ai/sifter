import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  Link as LinkIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react";
import {
  createFolder,
  deleteFolder,
  fetchFolder,
  fetchFolderDocuments,
  fetchFolders,
  linkExtractor,
  unlinkExtractor,
  updateFolder,
} from "@/api/folders";
import { fetchSifts } from "@/api/extractions";
import type { DocumentWithStatuses } from "@/api/folders";
import type { DocumentSiftStatus, Folder } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UploadModal } from "@/components/UploadModal";

// ---- Utilities ----

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function aggregateStatus(statuses: DocumentSiftStatus[]): string | null {
  if (!statuses?.length) return null;
  if (statuses.some((s) => s.status === "error")) return "error";
  if (statuses.some((s) => s.status === "processing")) return "processing";
  if (statuses.some((s) => s.status === "pending")) return "pending";
  if (statuses.every((s) => s.status === "discarded")) return "discarded";
  if (statuses.some((s) => s.status === "done")) return "done";
  return null;
}

function dotColor(status: string) {
  switch (status) {
    case "done": return "bg-emerald-400";
    case "processing": return "bg-amber-400";
    case "pending": return "bg-amber-300";
    case "error": return "bg-red-400";
    case "discarded": return "bg-slate-300";
    default: return "bg-slate-200";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "done": return "Extracted";
    case "processing": return "Processing";
    case "pending": return "Pending";
    case "error": return "Error";
    case "discarded": return "Discarded";
    default: return status;
  }
}

// ---- SiftDots component ----

interface SiftDotsProps {
  statuses: DocumentSiftStatus[];
  sifts: Array<{ id: string; name: string }>;
}

function SiftDots({ statuses, sifts }: SiftDotsProps) {
  if (!statuses?.length) return null;
  const hasProcessing = statuses.some(
    (s) => s.status === "processing" || s.status === "pending"
  );
  return (
    <div className="flex items-center gap-1 shrink-0">
      {hasProcessing && <Loader2 className="h-3 w-3 text-amber-500 animate-spin mr-0.5" />}
      {statuses.map((s) => {
        const sift = sifts.find((e) => e.id === s.sift_id);
        return (
          <span
            key={s.sift_id}
            className={`w-2 h-2 rounded-full shrink-0 ${dotColor(s.status)} hover:scale-125 transition-transform`}
            title={`${sift?.name ?? s.sift_id}: ${statusLabel(s.status)}`}
          />
        );
      })}
    </div>
  );
}

// ---- Folder tree helpers ----

interface FolderNode {
  folder: Folder;
  children: FolderNode[];
}

function buildTree(folders: Folder[], parentId: string | null = null): FolderNode[] {
  return folders
    .filter((f) => (f.parent_id ?? null) === parentId)
    .map((f) => ({ folder: f, children: buildTree(folders, f.id) }));
}

function getAncestors(folders: Folder[], folderId: string): string[] {
  const ids: string[] = [];
  let current = folders.find((f) => f.id === folderId);
  while (current?.parent_id) {
    ids.push(current.parent_id);
    current = folders.find((f) => f.id === current!.parent_id);
  }
  return ids;
}

// ---- FolderTreeItem (recursive) ----

interface FolderTreeItemProps {
  node: FolderNode;
  activeFolderId: string | undefined;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  depth: number;
}

function FolderTreeItem({ node, activeFolderId, expanded, onToggle, onSelect, depth }: FolderTreeItemProps) {
  const { folder, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(folder.id);
  const isActive = activeFolderId === folder.id;

  return (
    <div>
      <button
        className={`flex items-center gap-1.5 pr-3 py-1.5 rounded-md text-sm transition-all w-full text-left border-l-2 group
          ${isActive
            ? "bg-primary/10 font-medium text-foreground border-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border-transparent"
          }`}
        style={{ paddingLeft: `${10 + depth * 16}px` }}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren ? (
          <span
            className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors p-0.5 -ml-0.5 rounded"
            onClick={(e) => { e.stopPropagation(); onToggle(folder.id); }}
          >
            {isExpanded
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />
            }
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {isExpanded || isActive
          ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/60" />
          : <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        }
        <span className="truncate flex-1">{folder.name}</span>
        {folder.document_count > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
            {folder.document_count}
          </span>
        )}
      </button>

      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <FolderTreeItem
              key={child.folder.id}
              node={child}
              activeFolderId={activeFolderId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main page ----

export default function FolderBrowserPage() {
  const { id: folderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newParentId, setNewParentId] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedSiftId, setSelectedSiftId] = useState("");
  const [search, setSearch] = useState("");

  // Track expanded tree nodes
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["folders"],
    queryFn: fetchFolders,
  });

  const { data: folder, isLoading: folderLoading } = useQuery({
    queryKey: ["folder", folderId],
    queryFn: () => fetchFolder(folderId!),
    enabled: !!folderId,
  });

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["folder-documents", folderId],
    queryFn: () => fetchFolderDocuments(folderId!),
    enabled: !!folderId,
    refetchInterval: (query) => {
      const docs = query.state.data as DocumentWithStatuses[] | undefined;
      const hasProcessing = docs?.some((d) =>
        d.sift_statuses?.some((s) => s.status === "processing" || s.status === "pending")
      );
      return hasProcessing ? 2000 : false;
    },
  });

  const { data: allSifts = [] } = useQuery({
    queryKey: ["sifts"],
    queryFn: fetchSifts,
  });

  // Build tree and compute ancestors for auto-expand
  const folderTree = useMemo(() => buildTree(folders), [folders]);
  const ancestors = useMemo(() => (folderId ? getAncestors(folders, folderId) : []), [folders, folderId]);

  // Auto-expand ancestors when navigating deep
  const effectiveExpanded = useMemo(() => {
    const s = new Set(expandedIds);
    ancestors.forEach((id) => s.add(id));
    if (folderId) s.add(folderId);
    return s;
  }, [expandedIds, ancestors, folderId]);

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Breadcrumb path: ancestors + current folder
  const breadcrumbPath = useMemo(() => {
    const result: Folder[] = [];
    let current = folders.find((f) => f.id === folderId);
    while (current) {
      result.unshift(current);
      const parentId = current.parent_id;
      current = parentId ? folders.find((f) => f.id === parentId) : undefined;
    }
    return result;
  }, [folders, folderId]);

  // Direct subfolders of current folder
  const subfolders = useMemo(
    () => folders.filter((f) => f.parent_id === (folderId ?? null)),
    [folders, folderId]
  );

  // Mutations
  const createMutation = useMutation({
    mutationFn: () => createFolder(newName, newDescription, newParentId),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setShowCreate(false);
      setNewName("");
      setNewDescription("");
      setNewParentId(null);
      navigate(`/folders/${created.id}`);
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateFolder(folderId!, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setEditingName(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFolder(folderId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      const parentId = folder?.parent_id;
      if (parentId) navigate(`/folders/${parentId}`);
      else navigate("/folders");
    },
  });

  const linkMutation = useMutation({
    mutationFn: () => linkExtractor(folderId!, selectedSiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
      setShowLinkDialog(false);
      setSelectedSiftId("");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (siftId: string) => unlinkExtractor(folderId!, siftId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["folder", folderId] }),
  });

  const linkedSiftIds = folder?.extractors?.map((e) => e.sift_id) ?? [];
  const inheritedSiftIds = folder?.inherited_extractors?.map((e) => e.sift_id) ?? [];
  const allLinkedIds = [...linkedSiftIds, ...inheritedSiftIds];
  const availableToLink = allSifts.filter((e) => !allLinkedIds.includes(e.id));
  const filteredDocs = documents.filter((d) =>
    d.filename.toLowerCase().includes(search.toLowerCase())
  );

  const isAllDocs = !folderId;
  const currentFolderName = folder?.name ?? "My Documents";

  const handleDeleteFolder = () => setDeleteFolderOpen(true);

  const openCreateDialog = (parentId: string | null = null) => {
    setNewParentId(parentId);
    setNewName("");
    setNewDescription("");
    setShowCreate(true);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Unified top rail — mirrors CloudChatPage for visual consistency between submenu pages */}
      <header className="flex h-14 shrink-0 border-b">
        {/* Left slot: matches sidebar width + bg so the sidebar column reads as one continuous strip top-to-bottom */}
        <div className="w-60 shrink-0 flex items-center px-3 border-r bg-muted/20">
          <button
            onClick={() => openCreateDialog(null)}
            className="group relative w-full h-9 rounded-lg overflow-hidden bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all hover:-translate-y-px active:translate-y-0 active:shadow-sm"
          >
            <span className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Plus className="h-3.5 w-3.5 relative transition-transform group-hover:rotate-90" />
            <span className="relative">New folder</span>
          </button>
        </div>

        {/* Right slot: breadcrumb + contextual actions */}
        <div className="flex-1 flex items-center gap-2 px-5 min-w-0">
          {folderId && editingName ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Input
                className="h-8 text-sm w-56"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nameInput.trim()) renameMutation.mutate(nameInput.trim());
                  if (e.key === "Escape") setEditingName(false);
                }}
                autoFocus
              />
              <Button size="sm" className="h-8 px-3 text-xs"
                onClick={() => nameInput.trim() && renameMutation.mutate(nameInput.trim())}
                disabled={renameMutation.isPending || !nameInput.trim()}
              >
                {renameMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setEditingName(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/60 shrink-0">
                Folders
              </span>
              <span className="h-px w-5 bg-border shrink-0" aria-hidden />
              {breadcrumbPath.length > 0 ? (
                <>
                  {breadcrumbPath.slice(0, -1).map((bc) => (
                    <span key={bc.id} className="flex items-center gap-1.5 shrink-0 min-w-0">
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
                        onClick={() => navigate(`/folders/${bc.id}`)}
                      >
                        {bc.name}
                      </button>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </span>
                  ))}
                  <span className="text-sm font-semibold tracking-tight text-foreground truncate">
                    {breadcrumbPath[breadcrumbPath.length - 1].name}
                  </span>
                  <button
                    className="text-muted-foreground/50 hover:text-foreground transition-colors p-1 rounded shrink-0"
                    onClick={() => {
                      const last = breadcrumbPath[breadcrumbPath.length - 1];
                      setNameInput(last.name);
                      setEditingName(true);
                    }}
                    title="Rename"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <span className="text-sm font-semibold tracking-tight text-foreground truncate">
                  All Documents
                </span>
              )}
            </div>
          )}

          {/* Right-side action cluster */}
          {!editingName && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-40 pl-8 pr-2.5 text-xs rounded-md border border-input bg-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 transition-shadow"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setShowUpload(true)}
                disabled={folders.length === 0}
              >
                <Upload className="h-3.5 w-3.5" /> Upload
              </Button>
              {folderId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => openCreateDialog(folderId)}
                  title="New subfolder"
                >
                  <Plus className="h-3.5 w-3.5" /> Subfolder
                </Button>
              )}
              {folderId && (
                <button
                  onClick={handleDeleteFolder}
                  disabled={deleteMutation.isPending}
                  className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors shrink-0 disabled:opacity-50"
                  title="Delete folder"
                >
                  {deleteMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />
                  }
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Body: folder tree sidebar + main panel */}
      <div className="flex flex-1 min-h-0">
        {/* Folder tree sidebar */}
        <aside className="w-60 shrink-0 border-r flex flex-col bg-muted/20">
          <nav className="flex-1 overflow-y-auto p-2">
            <div className="space-y-0.5">
              {/* All Documents */}
              <button
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all w-full text-left border-l-2 ${
                  isAllDocs
                    ? "bg-primary/10 font-medium text-foreground border-primary pl-[10px]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border-transparent pl-[10px]"
                }`}
                onClick={() => navigate("/folders")}
              >
                <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                <span className="truncate flex-1">All Documents</span>
              </button>

              {foldersLoading ? (
                <div className="space-y-1 mt-1 px-1">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
                </div>
              ) : folders.length === 0 ? (
                <div className="px-3 py-8 text-center space-y-2">
                  <FolderIcon className="h-5 w-5 mx-auto text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground/70 leading-relaxed">
                    Your folders<br />will appear here
                  </p>
                </div>
              ) : (
                folderTree.map((node) => (
                  <FolderTreeItem
                    key={node.folder.id}
                    node={node}
                    activeFolderId={folderId}
                    expanded={effectiveExpanded}
                    onToggle={handleToggle}
                    onSelect={(id) => navigate(`/folders/${id}`)}
                    depth={0}
                  />
                ))
              )}
            </div>
          </nav>
        </aside>

        {/* Main panel */}
        <div className="flex-1 flex flex-col min-w-0">
        {/* Linked sifts bar — folder-specific secondary header */}
        {folderId && (
          <div className="px-5 py-2 border-b bg-muted/20 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.14em]">Linked Sifts</span>
            {folder?.extractors?.length === 0 && !folder?.inherited_extractors?.length ? (
              <span className="text-xs text-muted-foreground/60">None</span>
            ) : (
              <>
                {folder?.extractors?.map((link) => {
                  const ext = allSifts.find((e) => e.id === link.sift_id);
                  return (
                    <div key={link.id} className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs h-5 px-1.5">
                        {ext?.name ?? link.sift_id}
                      </Badge>
                      <button onClick={() => unlinkMutation.mutate(link.sift_id)}
                        className="text-muted-foreground/50 hover:text-destructive transition-colors" title="Unlink">
                        <Unlink className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                {folder?.inherited_extractors?.map((link) => {
                  const ext = allSifts.find((e) => e.id === link.sift_id);
                  const parentFolder = folders.find((f) => f.id === link.folder_id);
                  return (
                    <div key={`inherited-${link.id}`} className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs h-5 px-1.5 opacity-70">
                        {ext?.name ?? link.sift_id}
                        <span className="ml-1 text-[10px] text-muted-foreground">from {parentFolder?.path ?? parentFolder?.name ?? "parent"}</span>
                      </Badge>
                    </div>
                  );
                })}
              </>
            )}
            <Button variant="ghost" size="sm" className="h-5 text-[11px] px-1.5 flex items-center gap-1 text-muted-foreground"
              onClick={() => setShowLinkDialog(true)}>
              <LinkIcon className="h-2.5 w-2.5" /> Link Sift
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isAllDocs ? (
            /* All Documents: folder grid */
            foldersLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : folders.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <FolderIcon className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm font-medium">No folders yet</p>
                <p className="text-xs mt-1">Create a folder to start organising your documents</p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={() => openCreateDialog(null)}>
                  <Plus className="h-3.5 w-3.5" /> New Folder
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {folders
                  .filter((f) => !f.parent_id && f.name.toLowerCase().includes(search.toLowerCase()))
                  .map((f) => (
                    <div key={f.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-primary/[0.03] cursor-pointer transition-colors group"
                      onClick={() => navigate(`/folders/${f.id}`)}
                    >
                      <FolderIcon className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      <span className="font-medium text-sm flex-1">{f.name}</span>
                      {f.description && (
                        <span className="text-xs text-muted-foreground/60 hidden lg:block truncate max-w-xs">{f.description}</span>
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground/60 tabular-nums">
                        {f.document_count} doc{f.document_count !== 1 ? "s" : ""}
                      </span>
                      {f.created_at && (
                        <span className="text-[11px] text-muted-foreground/50 w-20 text-right hidden sm:block">
                          {new Date(f.created_at).toLocaleDateString()}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
                    </div>
                  ))}
              </div>
            )
          ) : (
            /* Folder selected */
            docsLoading || folderLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <>
                {/* Subfolder cards */}
                {subfolders.length > 0 && (
                  <div className="px-4 py-3 border-b">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Subfolders
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {subfolders.map((sub) => (
                        <button key={sub.id}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/60 bg-muted/30 hover:bg-primary/[0.05] hover:border-primary/20 transition-all text-left group"
                          onClick={() => navigate(`/folders/${sub.id}`)}
                        >
                          <FolderIcon className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-primary/60 transition-colors" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{sub.name}</p>
                            <p className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{sub.document_count} doc{sub.document_count !== 1 ? "s" : ""}</p>
                          </div>
                        </button>
                      ))}
                      <button
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border/40 text-muted-foreground/50 hover:text-muted-foreground hover:border-border transition-all text-xs"
                        onClick={() => openCreateDialog(folderId ?? null)}
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0" />
                        New subfolder
                      </button>
                    </div>
                  </div>
                )}

                {/* Document list */}
                {filteredDocs.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">
                      {search ? "No documents match your search" : "No documents yet"}
                    </p>
                    {!search && (
                      <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowUpload(true)}>
                        <Upload className="h-3.5 w-3.5" /> Upload Documents
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredDocs.map((doc) => (
                      <DocumentRow key={doc.id} doc={doc} allSifts={allSifts}
                        onOpen={() => navigate(`/documents/${doc.id}`)}
                      />
                    ))}
                  </div>
                )}
              </>
            )
          )}
        </div>
        </div>
      </div>

      {/* New Folder Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {newParentId
                ? `New subfolder in "${folders.find((f) => f.id === newParentId)?.name ?? "folder"}"`
                : "New Folder"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</Label>
              <Input placeholder="e.g. Q1 Invoices" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createMutation.mutate(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description (optional)</Label>
              <Input placeholder="Brief description" value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)} />
            </div>
            <Button onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending} className="w-full">
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Modal */}
      <UploadModal open={showUpload} onOpenChange={setShowUpload}
        folders={folders} defaultFolderId={folderId} />

      {/* Delete Folder Confirmation */}
      <AlertDialog open={deleteFolderOpen} onOpenChange={setDeleteFolderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              "{folder?.name}" and all its documents will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link Sift Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link Sift</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {availableToLink.length === 0 ? (
              <p className="text-sm text-muted-foreground">All sifts are already linked to this folder.</p>
            ) : (
              <div className="space-y-2">
                {availableToLink.map((ext) => (
                  <button key={ext.id}
                    className={`w-full text-left p-3 border rounded-md hover:bg-muted/50 text-sm transition-colors ${selectedSiftId === ext.id ? "border-primary bg-primary/5" : ""}`}
                    onClick={() => setSelectedSiftId(ext.id)}
                  >
                    <span className="font-medium">{ext.name}</span>
                    {ext.description && <p className="text-xs text-muted-foreground mt-0.5">{ext.description}</p>}
                  </button>
                ))}
              </div>
            )}
            <Button onClick={() => linkMutation.mutate()}
              disabled={!selectedSiftId || linkMutation.isPending} className="w-full">
              {linkMutation.isPending ? "Linking…" : "Link Sift"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- DocumentRow ----

interface DocumentRowProps {
  doc: DocumentWithStatuses;
  allSifts: Array<{ id: string; name: string; description?: string }>;
  onOpen: () => void;
}

function DocumentRow({ doc, allSifts, onOpen }: DocumentRowProps) {
  const agg = aggregateStatus(doc.sift_statuses ?? []);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-primary/[0.03] transition-colors group cursor-pointer"
      onClick={onOpen}
    >
      <div className="relative shrink-0">
        <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
        {agg && (
          <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-background ${dotColor(agg)}`} />
        )}
      </div>
      <span className="font-medium text-sm truncate flex-1 group-hover:text-primary transition-colors">
        {doc.filename}
      </span>
      {doc.sift_statuses?.length > 0 && (
        <SiftDots statuses={doc.sift_statuses} sifts={allSifts} />
      )}
      <span className="font-mono text-[11px] text-muted-foreground/60 shrink-0 tabular-nums w-14 text-right hidden sm:block">
        {formatBytes(doc.size_bytes)}
      </span>
      <span className="text-[11px] text-muted-foreground/60 shrink-0 w-20 text-right hidden md:block">
        {new Date(doc.uploaded_at).toLocaleDateString()}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>Open</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
