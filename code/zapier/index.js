const { version: platformVersion } = require("zapier-platform-core");
const packageJson = require("./package.json");

// Auth
const authentication = {
  type: "custom",
  test: async (z, bundle) => {
    const resp = await z.request({
      url: `${bundle.authData.api_url}/api/sifts?limit=1`,
      headers: { "X-API-Key": bundle.authData.api_key },
    });
    return resp.data;
  },
  fields: [
    {
      key: "api_url",
      label: "API URL",
      required: true,
      default: "https://api.sifter.ai",
      helpText: "Your Sifter instance URL. Use https://api.sifter.ai for the hosted version.",
    },
    {
      key: "api_key",
      label: "API Key",
      required: true,
      type: "password",
      helpText: "Find your API key at Settings → API Keys.",
    },
  ],
  connectionLabel: (z, bundle) => bundle.authData.api_url,
};

// ---- Shared helpers ----

function apiUrl(bundle) {
  return (bundle.authData.api_url || "https://api.sifter.ai").replace(/\/$/, "");
}

function headers(bundle) {
  return { "X-API-Key": bundle.authData.api_key, "Content-Type": "application/json" };
}

async function siftChoices(z, bundle) {
  const resp = await z.request({
    url: `${apiUrl(bundle)}/api/sifts?limit=100`,
    headers: headers(bundle),
  });
  return (resp.data.items || []).map((s) => ({ id: s.id, label: s.name }));
}

async function folderChoices(z, bundle) {
  const resp = await z.request({
    url: `${apiUrl(bundle)}/api/folders?limit=100`,
    headers: headers(bundle),
  });
  return (resp.data.items || []).map((f) => ({ id: f.id, label: f.name }));
}

// ---- Triggers ----

const triggerRecordCreated = {
  key: "record_created",
  noun: "Record",
  display: {
    label: "New Record Created",
    description: "Triggers when a new record is extracted from a document.",
  },
  operation: {
    type: "hook",
    performSubscribe: async (z, bundle) => {
      const resp = await z.request({
        method: "POST",
        url: `${apiUrl(bundle)}/api/webhooks`,
        headers: headers(bundle),
        body: {
          url: bundle.targetUrl,
          events: ["sift.document.processed"],
          sift_id: bundle.inputData.sift_id || undefined,
        },
      });
      return resp.data;
    },
    performUnsubscribe: async (z, bundle) => {
      await z.request({
        method: "DELETE",
        url: `${apiUrl(bundle)}/api/webhooks/${bundle.subscribeData.id}`,
        headers: headers(bundle),
      });
      return {};
    },
    perform: (z, bundle) => [bundle.cleanedRequest.body],
    performList: async (z, bundle) => {
      const resp = await z.request({
        url: `${apiUrl(bundle)}/api/sifts/${bundle.inputData.sift_id}/records?limit=3`,
        headers: headers(bundle),
      });
      return (resp.data.items || []);
    },
    inputFields: [
      { key: "sift_id", label: "Sift", dynamic: "sift_choices.id.name", required: false },
    ],
    sample: { id: "sample-record-id", sift_id: "sample-sift-id", extracted_data: {} },
  },
};

const triggerSiftCompleted = {
  key: "sift_completed",
  noun: "Sift",
  display: {
    label: "Sift Completed",
    description: "Triggers when a sift finishes processing all documents.",
  },
  operation: {
    type: "hook",
    performSubscribe: async (z, bundle) => {
      const resp = await z.request({
        method: "POST",
        url: `${apiUrl(bundle)}/api/webhooks`,
        headers: headers(bundle),
        body: { url: bundle.targetUrl, events: ["sift.completed"] },
      });
      return resp.data;
    },
    performUnsubscribe: async (z, bundle) => {
      await z.request({
        method: "DELETE",
        url: `${apiUrl(bundle)}/api/webhooks/${bundle.subscribeData.id}`,
        headers: headers(bundle),
      });
      return {};
    },
    perform: (z, bundle) => [bundle.cleanedRequest.body],
    performList: async (z, bundle) => {
      const resp = await z.request({
        url: `${apiUrl(bundle)}/api/sifts?limit=3`,
        headers: headers(bundle),
      });
      return (resp.data.items || []);
    },
    sample: { id: "sample-sift-id", name: "My Sift", status: "active" },
  },
};

const triggerDocumentProcessed = {
  key: "document_processed",
  noun: "Document",
  display: {
    label: "Document Processed",
    description: "Triggers when a document finishes processing.",
  },
  operation: {
    type: "hook",
    performSubscribe: async (z, bundle) => {
      const resp = await z.request({
        method: "POST",
        url: `${apiUrl(bundle)}/api/webhooks`,
        headers: headers(bundle),
        body: { url: bundle.targetUrl, events: ["sift.document.processed"] },
      });
      return resp.data;
    },
    performUnsubscribe: async (z, bundle) => {
      await z.request({
        method: "DELETE",
        url: `${apiUrl(bundle)}/api/webhooks/${bundle.subscribeData.id}`,
        headers: headers(bundle),
      });
      return {};
    },
    perform: (z, bundle) => [bundle.cleanedRequest.body],
    performList: async (z, bundle) => [],
    sample: { id: "sample-doc-id", filename: "invoice.pdf", status: "done" },
  },
};

// ---- Actions ----

const actionUploadDocument = {
  key: "upload_document",
  noun: "Document",
  display: {
    label: "Upload Document",
    description: "Upload a file to a Sifter folder.",
  },
  operation: {
    inputFields: [
      { key: "folder_id", label: "Folder", dynamic: "folder_choices.id.name", required: true },
      { key: "file", label: "File", type: "file", required: true },
      { key: "filename", label: "Filename", required: false },
    ],
    perform: async (z, bundle) => {
      const form = new FormData();
      form.append("file", bundle.inputData.file, bundle.inputData.filename || "document");
      const resp = await z.request({
        method: "POST",
        url: `${apiUrl(bundle)}/api/folders/${bundle.inputData.folder_id}/documents`,
        headers: { "X-API-Key": bundle.authData.api_key },
        body: form,
      });
      return resp.data;
    },
    sample: { id: "sample-doc-id", filename: "invoice.pdf" },
  },
};

const actionCreateSift = {
  key: "create_sift",
  noun: "Sift",
  display: {
    label: "Create Sift",
    description: "Create a new sift with extraction instructions.",
  },
  operation: {
    inputFields: [
      { key: "name", label: "Name", required: true },
      { key: "instructions", label: "Instructions", required: true, type: "text" },
      { key: "description", label: "Description", required: false },
    ],
    perform: async (z, bundle) => {
      const resp = await z.request({
        method: "POST",
        url: `${apiUrl(bundle)}/api/sifts`,
        headers: headers(bundle),
        body: {
          name: bundle.inputData.name,
          instructions: bundle.inputData.instructions,
          description: bundle.inputData.description || "",
        },
      });
      return resp.data;
    },
    sample: { id: "sample-sift-id", name: "My Sift", status: "active" },
  },
};

const actionRunExtraction = {
  key: "run_extraction",
  noun: "Extraction",
  display: {
    label: "Run Extraction",
    description: "Trigger extraction of a document against a sift.",
  },
  operation: {
    inputFields: [
      { key: "sift_id", label: "Sift", dynamic: "sift_choices.id.name", required: true },
      { key: "document_id", label: "Document ID", required: true },
    ],
    perform: async (z, bundle) => {
      const resp = await z.request({
        method: "POST",
        url: `${apiUrl(bundle)}/api/sifts/${bundle.inputData.sift_id}/extract`,
        headers: headers(bundle),
        body: { document_id: bundle.inputData.document_id },
      });
      return resp.data;
    },
    sample: { task_id: "sample-task-id", status: "queued" },
  },
};

// ---- Searches ----

const searchFindRecords = {
  key: "find_records",
  noun: "Record",
  display: {
    label: "Find Records",
    description: "Search records in a sift.",
  },
  operation: {
    inputFields: [
      { key: "sift_id", label: "Sift", dynamic: "sift_choices.id.name", required: true },
      { key: "filter", label: "Filter (JSON)", required: false, helpText: 'e.g. {"amount": {"$gt": 100}}' },
      { key: "limit", label: "Limit", required: false, default: "10" },
    ],
    perform: async (z, bundle) => {
      const params = new URLSearchParams({ limit: bundle.inputData.limit || "10" });
      if (bundle.inputData.filter) params.set("filter", bundle.inputData.filter);
      const resp = await z.request({
        url: `${apiUrl(bundle)}/api/sifts/${bundle.inputData.sift_id}/records?${params}`,
        headers: headers(bundle),
      });
      return (resp.data.items || []);
    },
    sample: { id: "sample-record-id", extracted_data: {} },
  },
};

const searchGetRecord = {
  key: "get_record",
  noun: "Record",
  display: {
    label: "Get Record",
    description: "Fetch a single record by ID.",
  },
  operation: {
    inputFields: [
      { key: "sift_id", label: "Sift", dynamic: "sift_choices.id.name", required: true },
      { key: "record_id", label: "Record ID", required: true },
    ],
    perform: async (z, bundle) => {
      const resp = await z.request({
        url: `${apiUrl(bundle)}/api/sifts/${bundle.inputData.sift_id}/records/${bundle.inputData.record_id}`,
        headers: headers(bundle),
      });
      return [resp.data];
    },
    sample: { id: "sample-record-id", extracted_data: {} },
  },
};

// ---- Dynamic dropdowns (internal triggers) ----

const siftChoicesTrigger = {
  key: "sift_choices",
  noun: "Sift",
  display: { label: "Sift Choices (internal)", description: "Dynamic dropdown.", hidden: true },
  operation: {
    perform: siftChoices,
    sample: { id: "sample-id", name: "Sample Sift" },
  },
};

const folderChoicesTrigger = {
  key: "folder_choices",
  noun: "Folder",
  display: { label: "Folder Choices (internal)", description: "Dynamic dropdown.", hidden: true },
  operation: {
    perform: folderChoices,
    sample: { id: "sample-id", name: "Sample Folder" },
  },
};

// ---- App export ----

module.exports = {
  version: packageJson.version,
  platformVersion,
  authentication,
  triggers: {
    [triggerRecordCreated.key]: triggerRecordCreated,
    [triggerSiftCompleted.key]: triggerSiftCompleted,
    [triggerDocumentProcessed.key]: triggerDocumentProcessed,
    [siftChoicesTrigger.key]: siftChoicesTrigger,
    [folderChoicesTrigger.key]: folderChoicesTrigger,
  },
  actions: {
    [actionUploadDocument.key]: actionUploadDocument,
    [actionCreateSift.key]: actionCreateSift,
    [actionRunExtraction.key]: actionRunExtraction,
  },
  searches: {
    [searchFindRecords.key]: searchFindRecords,
    [searchGetRecord.key]: searchGetRecord,
  },
};
