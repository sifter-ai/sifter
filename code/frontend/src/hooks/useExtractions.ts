import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  cancelIndexing,
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
import type { ChatMessage, CreateAggregationPayload, CreateSiftPayload, PaginatedResponse, Sift, SiftRecord, SiftDocument } from "@/api/types";

const SIFTS_PAGE_SIZE = 50;

// Flat query — for selectors that need all sifts (dropdowns, etc.)
export const useSifts = (limit = 200) =>
  useQuery({
    queryKey: ["sifts", limit],
    queryFn: () => fetchSifts(limit, 0),
    refetchInterval: (query: any) => {
      const data = query.state.data as PaginatedResponse<Sift> | undefined;
      const hasIndexing = Array.isArray(data?.items) && data!.items.some((s) => s?.status === "indexing");
      return hasIndexing ? 3000 : false;
    },
    refetchOnMount: "always",
  });

// Infinite query — for the sifts grid with "Load more"
export const useSiftsInfinite = () =>
  useInfiniteQuery({
    queryKey: ["sifts-infinite"],
    queryFn: ({ pageParam = 0 }) => fetchSifts(SIFTS_PAGE_SIZE, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage: PaginatedResponse<Sift>, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return fetched < lastPage.total ? fetched : undefined;
    },
    refetchOnMount: "always",
  });

type RefetchInterval = number | false | ((query: any) => number | false);

export const useSift = (id: string, options?: { refetchInterval?: RefetchInterval }) =>
  useQuery({
    queryKey: ["sift", id],
    queryFn: () => fetchSift(id),
    refetchInterval: options?.refetchInterval,
    // Optimistic updates (see useUploadDocuments) touch dataUpdatedAt, which can
    // suppress the default refetch-if-stale behaviour. Force a refetch on every
    // mount so navigating list → detail always pulls the latest state.
    refetchOnMount: "always",
  });

const RECORDS_PAGE_SIZE = 50;

export const useSiftRecords = (
  id: string,
  options?: { refetchInterval?: RefetchInterval; limit?: number; offset?: number; hasUncertainFields?: boolean }
) =>
  useQuery({
    queryKey: ["sift-records", id, options?.limit ?? RECORDS_PAGE_SIZE, options?.offset ?? 0, options?.hasUncertainFields ?? false],
    queryFn: () => fetchSiftRecords(id, options?.limit ?? RECORDS_PAGE_SIZE, options?.offset ?? 0, { hasUncertainFields: options?.hasUncertainFields }),
    refetchInterval: options?.refetchInterval,
    refetchOnMount: "always",
  });

export const useSiftDocuments = (
  siftId: string,
  options?: { refetchInterval?: RefetchInterval; limit?: number; offset?: number }
) =>
  useQuery({
    queryKey: ["sift-documents", siftId, options?.limit ?? 50, options?.offset ?? 0],
    queryFn: () => fetchSiftDocuments(siftId, options?.limit ?? 50, options?.offset ?? 0),
    refetchInterval: options?.refetchInterval,
    enabled: !!siftId,
    refetchOnMount: "always",
  });

export const useCreateSift = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSiftPayload) => createSift(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sifts"] });
      qc.invalidateQueries({ queryKey: ["sifts-infinite"] });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sifts"] });
      qc.invalidateQueries({ queryKey: ["sifts-infinite"] });
    },
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
    onMutate: async () => {
      // Flip the sift to "indexing" immediately. The HTTP upload can take
      // several seconds, and for fast workers the backend may transition back
      // to ACTIVE before onSuccess fires — without this optimistic update the
      // UI never reflects the indexing state and the detail-page polling loop
      // (which keys off status === "indexing") never starts.
      await qc.cancelQueries({ queryKey: ["sift", siftId] });
      const previous = qc.getQueryData<any>(["sift", siftId]);
      if (previous) {
        qc.setQueryData(["sift", siftId], { ...previous, status: "indexing" });
      }
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) {
        qc.setQueryData(["sift", siftId], context.previous);
      }
    },
    onSuccess: () => {
      // refetchQueries bypasses staleTime and forces an immediate fetch
      qc.refetchQueries({ queryKey: ["sift", siftId] });
      qc.refetchQueries({ queryKey: ["sifts"] });
      qc.refetchQueries({ queryKey: ["sifts-infinite"] });
      qc.refetchQueries({ queryKey: ["sift-records", siftId] });
      qc.refetchQueries({ queryKey: ["sift-documents", siftId] });
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

export const useCancelIndexing = (siftId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cancelIndexing(siftId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sift", siftId] }),
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
    queryFn: () => fetchAggregations(siftId, 100, 0),
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
