---
title: "UI not updated while indexing"
status: resolved
author: "bruno.fortunato@applica.guru"
created-at: "2026-04-16T09:22:52.202Z"
---

## Description

Quando faccio indexing (caricamento documenti in una folder collegata a uno sift, o reindex), l'interfaccia grafica non mostra il progresso e non si aggiorna finché l'operazione non termina.

## Root Causes

### BUG 1 (Critical): `process_single_document` sovrascrive i contatori e imposta prematuramente ACTIVE

`code/server/sifter/services/sift_service.py` — nel metodo `process_single_document()`, dopo ogni singolo documento:
- `total_documents` viene sovrascritto con il count dei risultati (`count = await self.results_service.count(sift_id)`), azzerando il totale reale
- `status` viene impostato a `ACTIVE` dopo ogni documento, non alla fine

**Effetto**: dopo il primo documento di 10, il sift diventa `processed=1, total=1, status=active`. La progress bar mostra 100%, il polling si ferma.

### BUG 2 (Critical): Gli upload via folder non impostano mai lo status a "indexing"

`code/server/sifter/api/folders.py`:
- Upload documento in folder (linee ~316-321): i documenti vengono accodati alla processing queue, ma lo sift resta `"active"` — `total_documents` e `processed_documents` non vengono aggiornati
- Link sift a folder (linee ~146-168): stesso problema

**Effetto**: il sift non passa mai a `"indexing"`, il polling condizionale in `SiftDetailPage` non si attiva, la progress bar non appare.

### BUG 3 (Moderate): SiftsPage non ha polling

`code/frontend/src/hooks/useExtractions.ts` — `useSifts()` non ha `refetchInterval`. Se l'utente è nella lista durante l'indexing, status badge e contatori restano stale.

### BUG 4 (Minor): Records table non fa polling durante indexing

`useSiftRecords(id)` non ha `refetchInterval` — i record appaiono nella tabella solo dopo il completamento o navigazione manuale.

## Affected Code Paths

| Path | Trigger | Buggy? |
|------|---------|--------|
| A — Direct upload to sift | `POST /api/sifts/{id}/upload` | **OK** — usa `process_documents()` con progress incrementale |
| B — Reindex | `POST /api/sifts/{id}/reindex` | **BUG 1** — docs da queue usano `process_single_document()` |
| C — Folder upload | `POST /api/folders/{id}/documents` | **BUG 1 + BUG 2** |
| D — Link sift to folder | `POST /api/folders/{id}/sifts` | **BUG 1 + BUG 2** |

## Key Files

- `code/server/sifter/services/sift_service.py` — `process_single_document()` sovrascrive contatori
- `code/server/sifter/api/folders.py` — folder upload/link non aggiornano stato sift
- `code/server/sifter/services/document_processor.py` — worker chiama `process_single_document()`
- `code/frontend/src/pages/SiftDetailPage.tsx` — polling condizionale su `status === "indexing"`
- `code/frontend/src/pages/SiftsPage.tsx` — nessun polling nella lista
- `code/frontend/src/hooks/useExtractions.ts` — hook senza polling per lista e records

## Suggested Fix

1. **Backend**: In `process_single_document()`, incrementare `processed_documents` atomicamente senza sovrascrivere `total_documents`. Impostare `status=ACTIVE` solo quando `processed_documents == total_documents`.
2. **Backend**: In folder upload e link sift, impostare `status=INDEXING`, `total_documents=N`, `processed_documents=0` prima di accodare i task.
3. **Frontend**: Aggiungere polling condizionale a `useSifts()` nella lista sift e a `useSiftRecords()` durante indexing.
