"""
Document management service: Folders, Documents, FolderSift links,
DocumentSiftStatus tracking. Single-tenant — no org_id.
"""
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.document import (
    Document,
    DocumentSiftStatus,
    DocumentSiftStatusEnum,
    Folder,
    FolderSift,
)

logger = structlog.get_logger()


class DocumentService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def ensure_indexes(self):
        await self.db["folders"].create_index("parent_id", name="parent_id_idx", sparse=True)
        await self.db["folders"].create_index("path", name="path_unique_idx", unique=True, sparse=True)
        await self.db["documents"].create_index([("folder_id", 1), ("filename", 1)], unique=True)

        # Drop stale indexes
        for idx_name in [
            "folder_id_1_extraction_id_1",
            "folder_id_sift_id_unique",
            "folder_id_1_sift_id_1",
            "folder_sift_unique",
        ]:
            try:
                await self.db["folder_extractors"].drop_index(idx_name)
            except Exception:
                pass

        for idx_name in [
            "document_id_1_extraction_id_1",
            "document_id_1_sift_id_1",
            "document_sift_unique",
            "document_sift_id_unique",
        ]:
            try:
                await self.db["document_sift_statuses"].drop_index(idx_name)
            except Exception:
                pass

        await self.db["folder_extractors"].create_index(
            [("folder_id", 1), ("sift_id", 1)], unique=True, name="folder_sift_unique"
        )
        await self.db["document_sift_statuses"].create_index(
            [("document_id", 1), ("sift_id", 1)], unique=True, name="document_sift_unique"
        )

    # ---- Folders ----

    @staticmethod
    def _normalize_segment(name: str) -> str:
        """Normalize a single path segment: lowercase, replace spaces with underscores."""
        return name.strip().lower().replace(" ", "_")

    async def _compute_path(self, name: str, parent_id: Optional[str]) -> str:
        segment = self._normalize_segment(name)
        if not parent_id:
            return f"/{segment}"
        parent = await self.get_folder(parent_id)
        parent_path = parent.path if parent and parent.path else f"/{self._normalize_segment(parent.name)}" if parent else ""
        return f"{parent_path}/{segment}"

    async def create_folder(self, name: str, description: str, parent_id: Optional[str] = None) -> Folder:
        path = await self._compute_path(name, parent_id)
        folder = Folder(name=name, description=description, parent_id=parent_id, path=path)
        result = await self.db["folders"].insert_one(folder.to_mongo())
        folder.id = str(result.inserted_id)
        return folder

    async def list_folders(
        self, skip: int = 0, limit: int = 200, parent_id: Optional[str] = "ALL"
    ) -> tuple[list[Folder], int]:
        """List folders. parent_id='ALL' returns all (default), None returns roots,
        a string ID returns direct children of that folder."""
        query: dict = {}
        if parent_id != "ALL":
            query["parent_id"] = parent_id  # None → {parent_id: null} which matches missing/null
        total = await self.db["folders"].count_documents(query)
        docs = await self.db["folders"].find(query).skip(skip).limit(limit).to_list(length=limit)
        return [Folder.from_mongo(d) for d in docs], total

    async def get_folder(self, folder_id: str) -> Optional[Folder]:
        doc = await self.db["folders"].find_one({"_id": ObjectId(folder_id)})
        return Folder.from_mongo(doc) if doc else None

    async def get_folder_path(self, folder_id: str) -> list[Folder]:
        """Return ancestor chain from root down to (not including) folder_id. Max depth 10."""
        path: list[Folder] = []
        current_id = folder_id
        for _ in range(10):
            folder = await self.get_folder(current_id)
            if not folder or not folder.parent_id:
                break
            parent = await self.get_folder(folder.parent_id)
            if not parent:
                break
            path.insert(0, parent)
            current_id = folder.parent_id
        return path

    async def get_folder_by_path(self, path: str) -> Optional[Folder]:
        """Find a folder by its unique path."""
        doc = await self.db["folders"].find_one({"path": path})
        return Folder.from_mongo(doc) if doc else None

    async def get_or_create_folder_by_path(self, path: str) -> Folder:
        """Return the folder at `path`, creating intermediate folders as needed."""
        path = path.strip()
        if not path.startswith("/"):
            path = f"/{path}"
        # Remove trailing slash
        path = path.rstrip("/") or "/"

        existing = await self.get_folder_by_path(path)
        if existing:
            return existing

        segments = [s for s in path.split("/") if s]
        current_path = ""
        parent_id: Optional[str] = None
        folder: Optional[Folder] = None
        for segment in segments:
            current_path = f"{current_path}/{segment}"
            folder = await self.get_folder_by_path(current_path)
            if not folder:
                folder = Folder(name=segment, description="", parent_id=parent_id, path=current_path)
                result = await self.db["folders"].insert_one(folder.to_mongo())
                folder.id = str(result.inserted_id)
                if parent_id:
                    for sid in await self.collect_effective_sift_ids(parent_id):
                        await self.link_extractor(folder.id, sid)
            parent_id = folder.id

        return folder  # type: ignore[return-value]

    async def update_folder(self, folder_id: str, updates: dict) -> Optional[Folder]:
        result = await self.db["folders"].find_one_and_update(
            {"_id": ObjectId(folder_id)},
            {"$set": updates},
            return_document=True,
        )
        return Folder.from_mongo(result) if result else None

    async def delete_folder(self, folder_id: str) -> bool:
        # Recursively delete children first
        children = await self.db["folders"].find({"parent_id": folder_id}).to_list(length=None)
        for child in children:
            await self.delete_folder(str(child["_id"]))
        # Delete documents in this folder
        docs = await self.db["documents"].find({"folder_id": folder_id}).to_list(length=None)
        for doc in docs:
            doc_id = str(doc["_id"])
            await self._delete_document_files(doc)
            await self.db["document_sift_statuses"].delete_many({"document_id": doc_id})
            await self.db["processing_queue"].delete_many({"document_id": doc_id})
        await self.db["documents"].delete_many({"folder_id": folder_id})
        await self.db["folder_extractors"].delete_many({"folder_id": folder_id})
        result = await self.db["folders"].delete_one({"_id": ObjectId(folder_id)})
        return result.deleted_count > 0

    async def get_subfolder_ids(self, folder_id: str) -> list[str]:
        result: list[str] = []
        children = await self.db["folders"].find({"parent_id": folder_id}).to_list(length=None)
        for child in children:
            child_id = str(child["_id"])
            result.append(child_id)
            result.extend(await self.get_subfolder_ids(child_id))
        return result

    async def collect_effective_sift_ids(self, folder_id: str) -> list[str]:
        """Collect sift IDs from this folder and all ancestor folders (max depth 10)."""
        seen: set[str] = set()
        sift_ids: list[str] = []
        current_id: Optional[str] = folder_id
        for _ in range(10):
            if not current_id:
                break
            links = await self.list_folder_extractors(current_id)
            for link in links:
                if link.sift_id not in seen:
                    seen.add(link.sift_id)
                    sift_ids.append(link.sift_id)
            folder = await self.get_folder(current_id)
            if not folder or not folder.parent_id:
                break
            current_id = folder.parent_id
        return sift_ids

    async def list_inherited_extractors(self, folder_id: str) -> list[FolderSift]:
        """Return sift links inherited from parent/ancestor folders (not directly linked)."""
        direct_ids = {l.sift_id for l in await self.list_folder_extractors(folder_id)}
        inherited: list[FolderSift] = []
        current_id: Optional[str] = None
        folder = await self.get_folder(folder_id)
        if folder and folder.parent_id:
            current_id = folder.parent_id
        for _ in range(10):
            if not current_id:
                break
            links = await self.list_folder_extractors(current_id)
            for link in links:
                if link.sift_id not in direct_ids:
                    inherited.append(link)
                    direct_ids.add(link.sift_id)
            parent = await self.get_folder(current_id)
            if not parent or not parent.parent_id:
                break
            current_id = parent.parent_id
        return inherited

    # ---- Folder ↔ Sift links ----

    async def link_extractor(self, folder_id: str, sift_id: str) -> FolderSift:
        existing = await self.db["folder_extractors"].find_one(
            {"folder_id": folder_id, "sift_id": sift_id}
        )
        if existing:
            return FolderSift.from_mongo(existing)
        link = FolderSift(folder_id=folder_id, sift_id=sift_id)
        result = await self.db["folder_extractors"].insert_one(link.to_mongo())
        link.id = str(result.inserted_id)
        return link

    async def unlink_extractor(self, folder_id: str, sift_id: str) -> bool:
        result = await self.db["folder_extractors"].delete_one(
            {"folder_id": folder_id, "sift_id": sift_id}
        )
        return result.deleted_count > 0

    async def list_folder_extractors(self, folder_id: str) -> list[FolderSift]:
        docs = await self.db["folder_extractors"].find(
            {"folder_id": folder_id}
        ).to_list(length=None)
        return [FolderSift.from_mongo(d) for d in docs]

    # ---- Documents ----

    async def save_document(
        self,
        filename: str,
        content_type: str,
        folder_id: str,
        size_bytes: int,
        storage_path: str,
    ) -> Document:
        """Persist document metadata. The caller is responsible for saving
        the file bytes to the storage backend before calling this method."""
        doc = Document(
            folder_id=folder_id,
            filename=filename,
            original_filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            storage_path=storage_path,
        )
        result = await self.db["documents"].insert_one(doc.to_mongo())
        doc.id = str(result.inserted_id)

        await self.db["folders"].update_one(
            {"_id": ObjectId(folder_id)},
            {"$inc": {"document_count": 1}},
        )

        logger.info("document_saved", doc_id=doc.id, folder_id=folder_id, filename=filename)
        return doc

    async def list_documents(
        self, folder_id: str, skip: int = 0, limit: int = 50
    ) -> tuple[list[dict[str, Any]], int]:
        """List documents with per-sift status for each."""
        query = {"folder_id": folder_id}
        total = await self.db["documents"].count_documents(query)
        docs = await self.db["documents"].find(query).skip(skip).limit(limit).to_list(length=limit)

        result = []
        for doc in docs:
            doc_id = str(doc["_id"])
            statuses = await self.db["document_sift_statuses"].find(
                {"document_id": doc_id}
            ).to_list(length=None)
            result.append({
                "id": doc_id,
                "filename": doc["filename"],
                "original_filename": doc.get("original_filename", doc["filename"]),
                "content_type": doc.get("content_type", ""),
                "size_bytes": doc.get("size_bytes", 0),
                "uploaded_at": doc["uploaded_at"].isoformat() if doc.get("uploaded_at") else None,
                "sift_statuses": [
                    {
                        "sift_id": s.get("sift_id") or s.get("extraction_id"),
                        "status": s["status"],
                        "started_at": s["started_at"].isoformat() if s.get("started_at") else None,
                        "completed_at": s["completed_at"].isoformat() if s.get("completed_at") else None,
                        "error_message": s.get("error_message"),
                        "filter_reason": s.get("filter_reason"),
                        "sift_record_id": s.get("sift_record_id") or s.get("extraction_record_id"),
                    }
                    for s in statuses
                ],
            })
        return result, total

    async def get_document(self, document_id: str) -> Optional[Document]:
        doc = await self.db["documents"].find_one({"_id": ObjectId(document_id)})
        return Document.from_mongo(doc) if doc else None

    async def delete_document(self, document_id: str) -> bool:
        doc = await self.db["documents"].find_one({"_id": ObjectId(document_id)})
        if not doc:
            return False
        await self._delete_document_files(doc)
        await self.db["document_sift_statuses"].delete_many({"document_id": document_id})
        from .sift_results import SiftResultsService
        await SiftResultsService(self.db).delete_by_document_id(document_id)
        result = await self.db["documents"].delete_one({"_id": ObjectId(document_id)})
        if result.deleted_count > 0:
            await self.db["folders"].update_one(
                {"_id": ObjectId(doc["folder_id"])},
                {"$inc": {"document_count": -1}},
            )
        return result.deleted_count > 0

    async def _delete_document_files(self, doc: dict):
        storage_path = doc.get("storage_path")
        if not storage_path:
            return
        from ..storage import get_storage_backend
        backend = get_storage_backend()
        try:
            await backend.delete(storage_path)
        except Exception:
            pass

    # ---- DocumentSiftStatus ----

    async def create_sift_status(
        self, document_id: str, sift_id: str
    ) -> DocumentSiftStatus:
        status = DocumentSiftStatus(
            document_id=document_id,
            sift_id=sift_id,
            status=DocumentSiftStatusEnum.PENDING,
        )
        result = await self.db["document_sift_statuses"].insert_one(status.to_mongo())
        status.id = str(result.inserted_id)
        return status

    # Legacy alias
    async def create_extraction_status(
        self, document_id: str, sift_id: str
    ) -> DocumentSiftStatus:
        return await self.create_sift_status(document_id, sift_id)

    async def update_sift_status(
        self,
        document_id: str,
        sift_id: str,
        status: DocumentSiftStatusEnum,
        error_message: Optional[str] = None,
        sift_record_id: Optional[str] = None,
        filter_reason: Optional[str] = None,
    ) -> None:
        updates: dict = {"status": status}
        now = datetime.now(timezone.utc)
        if status == DocumentSiftStatusEnum.PROCESSING:
            updates["started_at"] = now
        elif status in (DocumentSiftStatusEnum.DONE, DocumentSiftStatusEnum.ERROR, DocumentSiftStatusEnum.DISCARDED):
            updates["completed_at"] = now
        if error_message is not None:
            updates["error_message"] = error_message
        if sift_record_id is not None:
            updates["sift_record_id"] = sift_record_id
        if filter_reason is not None:
            updates["filter_reason"] = filter_reason
        await self.db["document_sift_statuses"].update_one(
            {"document_id": document_id, "sift_id": sift_id},
            {"$set": updates},
        )

    # Legacy alias
    async def update_extraction_status(
        self,
        document_id: str,
        sift_id: str,
        status: DocumentSiftStatusEnum,
        error_message: Optional[str] = None,
        extraction_record_id: Optional[str] = None,
    ) -> None:
        return await self.update_sift_status(
            document_id, sift_id, status, error_message, extraction_record_id
        )

    async def get_document_statuses(self, document_id: str) -> list[DocumentSiftStatus]:
        docs = await self.db["document_sift_statuses"].find(
            {"document_id": document_id}
        ).to_list(length=None)
        return [DocumentSiftStatus.from_mongo(d) for d in docs]
