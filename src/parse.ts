import { isReview } from "./schema";
import { normalizeReview, INormalizeResult } from "./normalize";
import { ERRORS } from "./errors";

// The model may wrap JSON in ```json ... ``` fences or add prose.
// Extract just the object.
export function extractJson(rawText: string): string {
  // Prefer an explicit ```json block — some models (e.g. Gemma) emit reasoning code
  // blocks first and the real JSON in a json-labelled fence later. Take the LAST such
  // fence, since the final json block is the answer (earlier ones may be examples).
  const jsonFences = [...rawText.matchAll(/```json\s*([\s\S]*?)```/gi)];
  if (jsonFences.length) return jsonFences[jsonFences.length - 1][1].trim();
  const fence = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return rawText.slice(start, end + 1);
  }
  return rawText.trim();
}

export function parseReview(rawText: string): INormalizeResult {
  const extracted = extractJson(rawText);
  let data: unknown;
  try {
    data = JSON.parse(extracted);
  } catch {
    throw ERRORS.parseInvalidJson(rawText);
  }
  const result = normalizeReview(data);
  if (result === null || !isReview(result.review)) {
    throw ERRORS.parseSchemaMismatch(rawText);
  }
  return result;
}
