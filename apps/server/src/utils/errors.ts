export type ErrorCode =
  | 'FORBIDDEN_GROUP'
  | 'CONCURRENT_MODIFICATION'
  | 'STALE_SETTLEMENT'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'IDEMPOTENT_REPLAY'
  | 'INVALID_TAX_TYPE'
  | 'DOMAIN_LOCKED'
  | 'DOMAIN_REQUIRED';

export const FORBIDDEN_GROUP = 'FORBIDDEN_GROUP';
export const CONCURRENT_MODIFICATION = 'CONCURRENT_MODIFICATION';
export const STALE_SETTLEMENT = 'STALE_SETTLEMENT';
export const VALIDATION = 'VALIDATION';
export const NOT_FOUND = 'NOT_FOUND';
export const IDEMPOTENT_REPLAY = 'IDEMPOTENT_REPLAY';
export const INVALID_TAX_TYPE = 'INVALID_TAX_TYPE';
export const DOMAIN_LOCKED = 'DOMAIN_LOCKED';
export const DOMAIN_REQUIRED = 'DOMAIN_REQUIRED';

export const ErrorCodes = {
  FORBIDDEN_GROUP,
  CONCURRENT_MODIFICATION,
  STALE_SETTLEMENT,
  VALIDATION,
  NOT_FOUND,
  IDEMPOTENT_REPLAY,
  INVALID_TAX_TYPE,
  DOMAIN_LOCKED,
  DOMAIN_REQUIRED,
} as const;

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ForbiddenGroupError extends AppError {
  constructor(message = 'Access to group forbidden') {
    super(403, FORBIDDEN_GROUP, message);
  }
}

export class ConcurrentModificationError extends AppError {
  constructor(message = 'Concurrent modification detected') {
    super(409, CONCURRENT_MODIFICATION, message);
  }
}

export class StaleSettlementError extends AppError {
  constructor(message = 'Settlement batch is stale') {
    super(409, STALE_SETTLEMENT, message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(400, VALIDATION, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, NOT_FOUND, message);
  }
}

export class IdempotentReplayError extends AppError {
  constructor(message = 'Idempotent request replay') {
    super(409, IDEMPOTENT_REPLAY, message);
  }
}

export class InvalidTaxTypeError extends AppError {
  constructor(message = 'Invalid tax type for domain') {
    super(400, INVALID_TAX_TYPE, message);
  }
}

export class DomainLockedError extends AppError {
  constructor(message = 'Group domain is locked') {
    super(409, DOMAIN_LOCKED, message);
  }
}

export class DomainRequiredError extends AppError {
  constructor(message = 'Tax debts require a tax-configured group') {
    super(400, DOMAIN_REQUIRED, message);
  }
}
