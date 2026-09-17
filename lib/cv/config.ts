export const MAX_CV_BYTES = 10 * 1024 * 1024;
export const CV_ACCEPT = ".pdf,.docx";

export type CVMetadata = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};
