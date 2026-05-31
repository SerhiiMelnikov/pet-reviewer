// Common contract for any LLM review engine.
export interface IReviewProvider {
  // Takes a ready prompt, returns the RAW text of the model's response.
  review(prompt: string): Promise<string>;
}
