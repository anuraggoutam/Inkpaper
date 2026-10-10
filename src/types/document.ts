export type BlockType = "heading" | "paragraph" | "question" | "list";

export interface DocumentBlock {
  id: string;
  type: BlockType;
  /** Text as written by the user (only structural markers like "# " or "- " are removed). */
  text: string;
  /** Heading level (1-3) or list nesting level (0-based). */
  level?: number;
  listKind?: "ordered" | "unordered";
  /** Leading indentation in space characters (paragraphs and lists). */
  indent?: number;
  /** 0-based line in the source text this block came from (syncs editor and preview). */
  sourceLine: number;
}

export interface AssignmentMetadata {
  studentName: string;
  rollNumber: string;
  course: string;
  subject: string;
  date: string;
}

/**
 * The editable document. `text` is the single source of truth; blocks are derived from it
 * with `parseTextToBlocks`, so the editor, the preview and the export always agree.
 */
export interface AssignmentDocument {
  title: string;
  sourceFileName: string;
  text: string;
  metadata: AssignmentMetadata;
}

export const EMPTY_METADATA: AssignmentMetadata = {
  studentName: "",
  rollNumber: "",
  course: "",
  subject: "",
  date: "",
};
