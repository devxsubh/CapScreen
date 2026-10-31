import multer from "multer";

/** In-memory multipart parsers; the services stream the buffer to file storage. */

const megabytes = (envVar: string, fallback: number) =>
  parseInt(process.env[envVar] ?? String(fallback), 10) * 1024 * 1024;

export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: megabytes("DOCUMENT_UPLOAD_MAX_MB", 25) },
});

const RAG_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/csv",
];
const RAG_EXTENSIONS = ["pdf", "docx", "doc", "txt", "csv"];

/** Only formats lib/rag/parseDocument can turn into text. */
export const ragUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: megabytes("RAG_UPLOAD_MAX_MB", 20) },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "";
    if (RAG_MIME_TYPES.includes(file.mimetype) || RAG_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});
