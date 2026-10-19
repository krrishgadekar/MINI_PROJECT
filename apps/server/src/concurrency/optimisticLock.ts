import { Model, Document } from 'mongoose';
import { ConcurrentModificationError } from '../utils/errors';

export async function casUpdate<T extends Document>(
  model: Model<T>,
  id: unknown,
  expectedVersion: number,
  set: Record<string, unknown>,
): Promise<void> {
  const result = await model.updateOne(
    { _id: id, version: expectedVersion } as any,
    {
      $set: set,
      $inc: { version: 1 },
    } as any,
  );

  if (result.matchedCount === 0) {
    throw new ConcurrentModificationError(
      `Concurrent modification detected on ${model.modelName} (id: ${id}, expected version: ${expectedVersion}).`,
    );
  }
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  maxRetries = 3,
  minDelayMs = 50,
  maxDelayMs = 200,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (error: any) {
      attempt++;
      const isCasError =
        error instanceof ConcurrentModificationError ||
        error?.code === 'CONCURRENT_MODIFICATION' ||
        error?.statusCode === 409;

      if (isCasError && attempt < maxRetries) {
        const jitter = Math.floor(minDelayMs + Math.random() * (maxDelayMs - minDelayMs));
        const delay = jitter * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
