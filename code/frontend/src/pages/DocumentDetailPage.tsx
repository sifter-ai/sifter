import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, EyeOff, Loader2, Mail, RefreshCw, Trash2 } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
import { deleteDocument, downloadDocument, fetchDocument, fetchDocumentBlob, fetchFolder, reprocessDocument } from "../api/folders";
import { fetchSifts } from "../api/extractions";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { DocumentSiftStatus } from "../api/types";

function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col items-center">
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNumber(1); }}
        loading={<div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        error={<div className="p-4 text-sm text-muted-foreground">Failed to load PDF.</div>}
      >
        <Page
          pageNumber={pageNumber}
          width={width || undefined}
          renderTextLayer
          renderAnnotationLayer
        />
      </Document>
      {numPages && numPages > 1 && (
        <div className="flex items-center gap-3 py-2 text-sm text-muted-foreground border-t w-full justify-center bg-background">
          <button
            onClick={() => setPageNumber(p => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="p-1 rounded hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>Page {pageNumber} of {numPages}</span>
          <button
            onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-1 rounded hover:bg-muted disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function statusVariant(status: string) {
  switch (status) {
    case "done": return "success";
    case "processing": return "info";
    case "pending": return "pending";
    case "error": return "destructive";
    case "discarded": return "pending";
    default: return "outline";
  }
}

function statusDot(status: string) {
  switch (status) {
    case "done": return "bg-emerald-500";
    case "error": return "bg-red-500";
    case "discarded": return "bg-slate-400";
    default: return null;
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

export default function DocumentDetailPage() {
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => fetchDocument(documentId!),
    enabled: !!documentId,
    refetchInterval: (query: any) => {
      const doc = query.state.data;
      const hasProcessing = doc?.sift_statuses?.some(
        (s: DocumentSiftStatus) => s.status === "processing" || s.status === "pending"
      );
      return hasProcessing ? 2000 : false;
    },
  });

  const { data: folder } = useQuery({
    queryKey: ["folder", doc?.folder_id],
    queryFn: () => fetchFolder(doc!.folder_id),
    enabled: !!doc?.folder_id,
  });

  const { data: siftsPage } = useQuery({
    queryKey: ["sifts", 200],
    queryFn: () => fetchSifts(200, 0),
  });
  const sifts = siftsPage?.items ?? [];

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const handleTogglePreview = async () => {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (previewUrl) {
      setShowPreview(true);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const { url, contentType } = await fetchDocumentBlob(documentId!);
      blobUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewType(contentType || doc?.content_type || "");
      setShowPreview(true);
    } catch (err) {
      setPreviewError("Preview not available. Try downloading the file instead.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const reprocessMutation = useMutation({
    mutationFn: (siftId?: string) => reprocessDocument(documentId!, siftId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document", documentId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(documentId!),
    onSuccess: () => navigate(-1),
  });

  const handleDelete = () => setDeleteOpen(true);

  const handleDownload = () => {
    downloadDocument(documentId!, doc?.original_filename ?? doc?.filename ?? "document");
  };

  if (isLoading) {
    return (
      <div className="px-6 py-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="px-6 py-8 max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {error ? (error as Error).message : "Document not found."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const canPreview = doc.content_type === "application/pdf" || doc.content_type?.startsWith("image/");

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb + header */}
      <div>
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <button className="hover:text-foreground" onClick={() => navigate("/folders")}>Folders</button>
          {folder && (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <button
                className="hover:text-foreground"
                onClick={() => navigate(`/folders?folder=${doc.folder_id}`)}
              >
                {folder.name}
              </button>
            </>
          )}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground truncate max-w-xs">{doc.filename}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold break-all">{doc.filename}</h1>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" onClick={handleDownload} className="flex items-center gap-1">
              <Download className="h-4 w-4" />
              Download
            </Button>
            {canPreview && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTogglePreview}
                disabled={previewLoading}
                className="flex items-center gap-1"
              >
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPreview ? "Hide" : "Preview"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Inline preview */}
      {showPreview && previewLoading && (
        <div className="rounded-lg border bg-muted/20 flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {showPreview && previewUrl && (
        <div className="rounded-lg border overflow-hidden bg-muted/20">
          {previewType === "application/pdf" ? (
            <PdfViewer url={previewUrl} />
          ) : (
            <img src={previewUrl} alt={doc.filename} className="max-w-full max-h-[600px] object-contain mx-auto block p-4" />
          )}
        </div>
      )}
      {previewError && (
        <Alert variant="destructive">
          <AlertDescription>{previewError}</AlertDescription>
        </Alert>
      )}

      {/* Metadata */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">File Info</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Type</dt>
            <dd className="font-mono">{doc.content_type}</dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd>{formatBytes(doc.size_bytes)}</dd>
            <dt className="text-muted-foreground">Uploaded</dt>
            <dd>{new Date(doc.uploaded_at).toLocaleString()}</dd>
            {folder && (
              <>
                <dt className="text-muted-foreground">Folder</dt>
                <dd>
                  <button
                    className="text-primary hover:underline"
                    onClick={() => navigate(`/folders?folder=${doc.folder_id}`)}
                  >
                    {folder.name}
                  </button>
                </dd>
              </>
            )}
            {doc.connector_source && (
              <>
                <dt className="text-muted-foreground">Source</dt>
                <dd>{(() => {
                  if (doc.connector_source.startsWith("gdrive:")) {
                    const fileId = doc.connector_source.split(":")[2];
                    return (
                      <a
                        href={`https://drive.google.com/file/d/${fileId}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <svg viewBox="0 0 87.3 78" className="h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>
                        Google Drive
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    );
                  }
                  if (doc.connector_source.startsWith("gmail:")) {
                    const msgId = doc.connector_source.split(":")[1];
                    return (
                      <a
                        href={`https://mail.google.com/mail/u/0/#inbox/${msgId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        Gmail
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    );
                  }
                  return <span className="font-mono text-xs">{doc.connector_source}</span>;
                })()}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Per-sift results */}
      <div className="space-y-3">
        <h2 className="font-semibold">Sift Results</h2>

        {!doc.sift_statuses?.length ? (
          <p className="text-sm text-muted-foreground">
            This document isn't linked to any sifts. Link a sift to its folder to start extracting data.
          </p>
        ) : (
          doc.sift_statuses.map((s: DocumentSiftStatus) => {
            const sift = sifts.find((e) => e.id === s.sift_id);
            return (
              <Card key={s.sift_id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {sift?.name ?? s.sift_id}
                      </span>
                      <Badge variant={statusVariant(s.status) as any}>
                        {s.status === "processing" || s.status === "pending" ? (
                          s.status === "processing"
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-400" />
                        ) : statusDot(s.status) ? (
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(s.status)}`} />
                        ) : null}
                        {statusLabel(s.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.status === "done" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/sifts/${s.sift_id}`)}
                          className="flex items-center gap-1 text-xs h-7"
                        >
                          View records
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => reprocessMutation.mutate(s.sift_id)}
                        disabled={reprocessMutation.isPending || s.status === "processing" || s.status === "pending"}
                        className="flex items-center gap-1 h-7 text-xs"
                        title="Reprocess this document"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Reprocess
                      </Button>
                    </div>
                  </div>

                  {s.status === "error" && s.error_message && (
                    <Alert variant="destructive" className="py-2">
                      <AlertDescription className="text-xs">{s.error_message}</AlertDescription>
                    </Alert>
                  )}

                  {s.status === "discarded" && (
                    <Alert className="py-2">
                      <AlertDescription className="text-xs">
                        {s.filter_reason
                          ? `Discarded: ${s.filter_reason}`
                          : "This document did not match the extraction filter."}
                      </AlertDescription>
                    </Alert>
                  )}

                  {s.completed_at && s.status === "done" && (
                    <p className="text-xs text-muted-foreground">
                      Extracted {new Date(s.completed_at).toLocaleString()}
                    </p>
                  )}

                  {(s.status === "processing" || s.status === "pending") && (
                    <p className="text-xs text-muted-foreground animate-pulse">
                      {s.status === "pending" ? "Queued for extraction…" : "Extracting data…"}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {reprocessMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {(reprocessMutation.error as Error).message}
          </AlertDescription>
        </Alert>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              "{doc.filename}" will be permanently deleted along with all extracted records linked to it in your sifts. This cannot be undone.
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
    </div>
  );
}
