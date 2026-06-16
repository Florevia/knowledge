/** Replacement used for characters that are unsafe in common filesystems. */
const UNSAFE_FILENAME_REPLACEMENT = "_";

/** Windows and POSIX reserved path characters. */
const UNSAFE_FILENAME_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/g;

/** Keep output filenames compact enough for nested paths on most filesystems. */
const MAX_FILENAME_LENGTH = 120;

/**
 * Creates a readable filename while removing path separators and invalid chars.
 */
export const createSafeFilename = (title: string): string => {
  const normalized = title
    .normalize("NFKC")
    .trim()
    .replace(UNSAFE_FILENAME_PATTERN, UNSAFE_FILENAME_REPLACEMENT)
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .replace(/^[_ .]+|[_ .]+$/g, "");

  if (!normalized) {
    return "untitled";
  }

  return normalized.slice(0, MAX_FILENAME_LENGTH);
};
