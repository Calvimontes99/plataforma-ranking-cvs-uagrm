export interface IdempotencyResult {
  applicationId: string;
  resumeId: string;
}

export interface IdempotencyPort {
  find(key: string): Promise<IdempotencyResult | null>;
  claim(key: string): Promise<boolean>;
  save(key: string, result: IdempotencyResult): Promise<void>;
  release(key: string): Promise<void>;
}
