import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, Receipt, Zap, User, FileCheck, Landmark,
  ShoppingCart, Pill, Package, Shield, X,
} from "lucide-react";
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

const ICON_MAP: Record<string, React.ReactNode> = {
  "file-text": <FileText className="h-4 w-4" />,
  "receipt": <Receipt className="h-4 w-4" />,
  "zap": <Zap className="h-4 w-4" />,
  "user": <User className="h-4 w-4" />,
  "file-check": <FileCheck className="h-4 w-4" />,
  "landmark": <Landmark className="h-4 w-4" />,
  "shopping-cart": <ShoppingCart className="h-4 w-4" />,
  "pill": <Pill className="h-4 w-4" />,
  "package": <Package className="h-4 w-4" />,
  "shield": <Shield className="h-4 w-4" />,
};

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: Template;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border text-center shrink-0 transition-all text-xs font-medium ${
        selected
          ? "border-primary bg-primary/8 text-primary ring-1 ring-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
      title={template.description}
    >
      <span className={selected ? "text-primary" : "text-muted-foreground"}>
        {ICON_MAP[template.icon] ?? <FileText className="h-4 w-4" />}
      </span>
      <span className="whitespace-nowrap leading-tight">{template.name}</span>
    </button>
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

          {/* Template selector */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Start from a template (optional)</Label>
                {selectedTemplate && (
                  <button
                    type="button"
                    onClick={() => { setSelectedTemplate(null); setForm((f) => ({ ...f, instructions: "" })); }}
                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    selected={selectedTemplate?.id === t.id}
                    onSelect={() => handleSelectTemplate(t)}
                  />
                ))}
              </div>
              {selectedTemplate && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {selectedTemplate.description}
                </p>
              )}
            </div>
          )}

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
            <Label htmlFor="instructions">Instructions *</Label>
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
