import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateSift } from "@/hooks/useExtractions";
import { fetchTemplates } from "@/api/templates";
import type { Template } from "@/api/templates";
import type { CreateSiftPayload } from "@/api/types";

interface SiftFormProps {
  trigger: React.ReactNode;
  onCreated?: (id: string) => void;
}

function TemplateDropdown({
  templates,
  selected,
  onSelect,
}: {
  templates: Template[];
  selected: Template | null;
  onSelect: (t: Template | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {selected ? (
          <>
            <span className="text-primary font-medium">{selected.name}</span>
            <span
              className="ml-1 text-muted-foreground/60 hover:text-muted-foreground"
              onClick={(e) => { e.stopPropagation(); onSelect(null); setOpen(false); }}
              title="Clear"
            >
              ×
            </span>
          </>
        ) : (
          <>
            <FileText className="h-3 w-3" />
            Use a template
            <ChevronDown className="h-3 w-3" />
          </>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-48 rounded-md border bg-popover shadow-md py-1">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { onSelect(t); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 transition-colors ${
                selected?.id === t.id ? "text-primary font-medium" : "text-foreground"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SiftForm({ trigger, onCreated }: SiftFormProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateSiftPayload>({
    name: "",
    description: "",
    instructions: "",
    multi_record: false,
  });
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const { mutate, isPending, error } = useCreateSift();

  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
    staleTime: Infinity,
  });
  const templates = templatesData?.templates ?? [];

  const handleSelectTemplate = (t: Template) => {
    if (selectedTemplate?.id === t.id) {
      setSelectedTemplate(null);
      setForm((f) => ({ ...f, instructions: "" }));
    } else {
      setSelectedTemplate(t);
      setForm((f) => ({ ...f, instructions: t.instructions }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.instructions) return;
    mutate(form, {
      onSuccess: (sift) => {
        setOpen(false);
        setForm({ name: "", description: "", instructions: "", multi_record: false });
        setSelectedTemplate(null);
        onCreated?.(sift.id);
      },
    });
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) {
      setSelectedTemplate(null);
      setForm({ name: "", description: "", instructions: "", multi_record: false });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>New Sift</DialogTitle>
          <DialogDescription>
            Create a sift to process documents and extract structured data.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="e.g. December Invoices"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Optional description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="instructions">Instructions *</Label>
              {templates.length > 0 && (
                <TemplateDropdown
                  templates={templates}
                  selected={selectedTemplate}
                  onSelect={(t) => {
                    setSelectedTemplate(t);
                    setForm((f) => ({ ...f, instructions: t ? t.instructions : "" }));
                  }}
                />
              )}
            </div>
            <Textarea
              id="instructions"
              placeholder="e.g. Extract: client name, invoice date, total amount, VAT number"
              value={form.instructions}
              onChange={(e) =>
                setForm((f) => ({ ...f, instructions: e.target.value }))
              }
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              Describe what fields to extract in natural language.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <input
              id="multi-record"
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
              checked={!!form.multi_record}
              onChange={(e) => setForm((f) => ({ ...f, multi_record: e.target.checked }))}
            />
            <div>
              <Label htmlFor="multi-record" className="cursor-pointer font-medium">
                Extract multiple records per document
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enable when a single document can contain several records (e.g. a table of items).
              </p>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Sift"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
