import { IReview, isReview } from "./schema";
import { ERRORS } from "./errors";

// The model may wrap JSON in ```json ... ``` fences or add prose.
// Extract just the object.
export function extractJson(rawText: string): string {
  const fence = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return rawText.slice(start, end + 1);
  }
  return rawText.trim();
}

export function parseReview(rawText: string): IReview {
  const extracted = extractJson(rawText);
  let data: unknown;
  try {
    data = JSON.parse(extracted);
  } catch {
    throw ERRORS.parseInvalidJson(rawText);
  }
  if (!isReview(data)) {
    throw ERRORS.parseSchemaMismatch(rawText);
  }
  return data;
}
