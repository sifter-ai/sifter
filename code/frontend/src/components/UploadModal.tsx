import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud, X } from "lucide-react";
import { uploadDocument } from "@/api/folders";
import { Folder } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Folder[];
  defaultFolderId?: string;
}

type FileStatus = "idle" | "uploading" | "done" | "error";

interface FileEntry {
  file: File;
  status: FileStatus;
  error?: string;
}

export function UploadModal({
  open,
  onOpenChange,
  folders,
  defaultFolderId,
}: UploadModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [targetFolderId, setTargetFolderId] = useState(defaultFolderId ?? folders[0]?.id ?? "");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Sync target folder when navigating between folders
  useEffect(() => {
    if (defaultFolderId) setTargetFolderId(defaultFolderId);
  }, [defaultFolderId]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setEntries([]);
      setDragOver(false);
    }
  }, [open]);

  const targetFolder = folders.find((f) => f.id === targetFolderId);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setEntries((prev) => {
      const existing = new Set(prev.map((e) => `${e.file.name}:${e.file.size}`));
      const newEntries: FileEntry[] = Array.from(files)
        .filter((f) => !existing.has(`${f.name}:${f.size}`))
        .map((f) => ({ file: f, status: "idle" }));
      return [...prev, ...newEntries];
    });
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (!targetFolderId || entries.length === 0) return;
    setUploading(true);

    const updated = [...entries];
    let anySuccess = false;

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === "done") continue;
      updated[i] = { ...updated[i], status: "uploading" };
      setEntries([...updated]);

      try {
        await uploadDocument(targetFolderId, updated[i].file);
        updated[i] = { ...updated[i], status: "done" };
        anySuccess = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        updated[i] = { ...updated[i], status: "error", error: msg };
      }
      setEntries([...updated]);
    }

    if (anySuccess) {
      queryClient.invalidateQueries({ queryKey: ["folder-documents", targetFolderId] });
      queryClient.invalidateQueries({ queryKey: ["folder", targetFolderId] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    }

    setUploading(false);

    const allDone = updated.every((e) => e.status === "done");
    if (allDone) {
      setTimeout(() => onOpenChange(false), 600);
    }
  };

  const handleClose = () => {
    if (!uploading) onOpenChange(false);
  };

  const hasIdle = entries.some((e) => e.status === "idle" || e.status === "error");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Folder selector */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground shrink-0">Upload to:</span>
            {folders.length > 1 ? (
              <select
                className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={targetFolderId}
                onChange={(e) => setTargetFolderId(e.target.value)}
                disabled={uploading}
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-medium">{targetFolder?.name ?? "—"}</span>
            )}
          </div>

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Drag & drop files here</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG, TIFF — or click to select</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.tiff,.webp"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          <p className="text-xs text-muted-foreground">Max {50} MB per file</p>

          {/* File list */}
          {entries.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {entries.map((entry, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-sm p-2 border rounded-md ${
                    entry.status === "error"
                      ? "border-destructive/50 bg-destructive/5"
                      : entry.status === "done"
                      ? "border-green-500/30 bg-green-50/50"
                      : ""
                  }`}
                >
                  <div className="shrink-0 w-4">
                    {entry.status === "uploading" && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {entry.status === "done" && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {entry.status === "error" && (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-tight">{entry.file.name}</p>
                    {entry.status === "error" && entry.error ? (
                      <p className="text-xs text-destructive truncate">{entry.error}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{formatBytes(entry.file.size)}</p>
                    )}
                  </div>
                  {(entry.status === "idle" || entry.status === "error") && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeEntry(i); }}
                      className="ml-1 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {entries.length > 0 && hasIdle && (
            <Button
              onClick={handleUpload}
              disabled={uploading || !targetFolderId}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading…
                </>
              ) : (
                `Upload ${entries.filter((e) => e.status !== "done").length} file${entries.filter((e) => e.status !== "done").length !== 1 ? "s" : ""}`
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
