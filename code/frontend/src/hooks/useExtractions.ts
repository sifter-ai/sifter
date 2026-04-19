import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  chatWithSift,
  createSift,
  deleteSift,
  exportSiftCsv,
  fetchSift,
  fetchSiftFolders,
  fetchSiftRecords,
  fetchSifts,
  querySift,
  reindexSift,
  resetSift,
  updateSift,
  uploadDocuments,
} from "@/api/extractions";
import { linkExtractor } from "@/api/folders";
import {
  createAggregation,
  deleteAggregation,
  fetchAggregationResult,
  fetchAggregations,
  regenerateAggregation,
} from "@/api/aggregations";
import { fetchSiftDocuments } from "@/api/extractions";
import type { ChatMessage, CreateAggregationPayload, CreateSiftPayload } from "@/api/types";

export const useSifts = () =>
  useQuery({
    queryKey: ["sifts"],
    queryFn: fetchSifts,
    refetchInterval: (query: any) => {
      const hasIndexing = (query.state.data as any)?.items?.some((s: any) => s.status === "indexing");
      return hasIndexing ? 3000 : false;
    },
  });

type RefetchInterval = number | false | ((query: any) => number | false);

export const useSift = (id: string, options?: { refetchInterval?: RefetchInterval }) =>
  useQuery({
    queryKey: ["sift", id],
    queryFn: () => fetchSift(id),
    refetchInterval: options?.refetchInterval,
  });

export const useSiftRecords = (id: string, options?: { refetchInterval?: RefetchInterval }) =>
  useQuery({
    queryKey: ["sift-records", id],
    queryFn: () => fetchSiftRecords(id),
    refetchInterval: options?.refetchInterval,
  });

export const useSiftDocuments = (siftId: string, options?: { refetchInterval?: RefetchInterval }) =>
  useQuery({
    queryKey: ["sift-documents", siftId],
    queryFn: () => fetchSiftDocuments(siftId),
    refetchInterval: options?.refetchInterval,
    enabled: !!siftId,
  });

export const useCreateSift = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSiftPayload) => createSift(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sifts"] }),
  });
};

export const useUpdateSift = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name?: string; instructions?: string; description?: string; schema?: string; multi_record?: boolean }) =>
      updateSift(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sift", id] });
      qc.invalidateQueries({ queryKey: ["sifts"] });
    },
  });
};

export const useDeleteSift = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSift(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sifts"] }),
  });
};

export const useSiftFolders = (id: string, enabled: boolean = true) =>
  useQuery({
    queryKey: ["sift-folders", id],
    queryFn: () => fetchSiftFolders(id),
    enabled: !!id && enabled,
  });

export const useLinkFolderToSift = (siftId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderId: string) => linkExtractor(folderId, siftId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sift-folders", siftId] });
      qc.invalidateQueries({ queryKey: ["sift", siftId] });
    },
  });
};

export const useUploadDocuments = (siftId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => uploadDocuments(siftId, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sift", siftId] });
      qc.invalidateQueries({ queryKey: ["sift-records", siftId] });
      qc.invalidateQueries({ queryKey: ["sift-documents", siftId] });
    },
  });
};

export const useReindexSift = (siftId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reindexSift(siftId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sift", siftId] });
      qc.invalidateQueries({ queryKey: ["sift-records", siftId] });
    },
  });
};

export const useResetSift = (siftId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resetSift(siftId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sift", siftId] }),
  });
};

export const useQuerySift = () =>
  useMutation({
    mutationFn: ({ id, query }: { id: string; query: string }) => querySift(id, query),
  });

export const useExportCsv = () =>
  useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => exportSiftCsv(id, name),
  });

export const useSiftChat = (siftId: string) =>
  useMutation({
    mutationFn: ({ message, history }: { message: string; history: ChatMessage[] }) =>
      chatWithSift(siftId, message, history),
  });

export const useAggregations = (siftId: string, options?: { refetchInterval?: number | false | ((query: any) => number | false) }) =>
  useQuery({
    queryKey: ["aggregations", siftId],
    queryFn: () => fetchAggregations(siftId),
    refetchInterval: options?.refetchInterval,
    enabled: !!siftId,
  });

export const useCreateAggregation = (siftId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAggregationPayload) => createAggregation(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aggregations", siftId] }),
  });
};

export const useRunAggregation = (siftId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aggId: string) => fetchAggregationResult(aggId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aggregations", siftId] }),
  });
};

export const useRegenerateAggregation = (siftId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aggId: string) => regenerateAggregation(aggId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aggregations", siftId] }),
  });
};

export const useDeleteAggregation = (siftId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aggId: string) => deleteAggregation(aggId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aggregations", siftId] }),
  });
};

// Legacy aliases — keep for any remaining consumers
export const useExtractions = useSifts;
export const useExtraction = useSift;
export const useExtractionRecords = useSiftRecords;
export const useCreateExtraction = useCreateSift;
export const useUpdateExtraction = useUpdateSift;
export const useDeleteExtraction = useDeleteSift;
export const useReindexExtraction = useReindexSift;
export const useResetExtraction = useResetSift;
export const useQueryExtraction = useQuerySift;
export const useExtractionChat = useSiftChat;
