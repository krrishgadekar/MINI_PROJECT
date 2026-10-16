import { Request, Response } from 'express';
import {
  AppError,
  FORBIDDEN_GROUP,
  CONCURRENT_MODIFICATION,
  STALE_SETTLEMENT,
  VALIDATION,
  NOT_FOUND,
  IDEMPOTENT_REPLAY,
  ErrorCodes,
  ForbiddenGroupError,
  ConcurrentModificationError,
} from '../src/utils/errors';
import { errorHandler } from '../src/middleware/errorHandler';

describe('AppError and Error Handler Middleware', () => {
  describe('AppError class', () => {
    it('instantiates correctly with statusCode, code, and message', () => {
      const err = new AppError(403, FORBIDDEN_GROUP, 'Forbidden from group');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN_GROUP');
      expect(err.message).toBe('Forbidden from group');
      expect(err.name).toBe('AppError');
    });

    it('exports all required slice A error codes', () => {
      expect(FORBIDDEN_GROUP).toBe('FORBIDDEN_GROUP');
      expect(CONCURRENT_MODIFICATION).toBe('CONCURRENT_MODIFICATION');
      expect(STALE_SETTLEMENT).toBe('STALE_SETTLEMENT');
      expect(VALIDATION).toBe('VALIDATION');
      expect(NOT_FOUND).toBe('NOT_FOUND');
      expect(IDEMPOTENT_REPLAY).toBe('IDEMPOTENT_REPLAY');

      expect(ErrorCodes.FORBIDDEN_GROUP).toBe('FORBIDDEN_GROUP');
      expect(ErrorCodes.CONCURRENT_MODIFICATION).toBe('CONCURRENT_MODIFICATION');
      expect(ErrorCodes.STALE_SETTLEMENT).toBe('STALE_SETTLEMENT');
      expect(ErrorCodes.VALIDATION).toBe('VALIDATION');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCodes.IDEMPOTENT_REPLAY).toBe('IDEMPOTENT_REPLAY');
    });

    it('supports specific helper error subclasses', () => {
      const forbidden = new ForbiddenGroupError('Custom forbidden');
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.code).toBe(FORBIDDEN_GROUP);
      expect(forbidden.message).toBe('Custom forbidden');

      const conflict = new ConcurrentModificationError();
      expect(conflict.statusCode).toBe(409);
      expect(conflict.code).toBe(CONCURRENT_MODIFICATION);
    });
  });

  describe('errorHandler middleware', () => {
    const mockRequest = {} as Request;
    let mockResponse: Partial<Response>;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;
    const nextMock = jest.fn();

    beforeEach(() => {
      jsonMock = jest.fn();
      statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      mockResponse = {
        status: statusMock,
        json: jsonMock,
      };
    });

    it('formats typed AppError with { success: false, code, message }', () => {
      const err = new AppError(403, FORBIDDEN_GROUP, 'Access denied');
      errorHandler(err, mockRequest, mockResponse as Response, nextMock);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'FORBIDDEN_GROUP',
          message: 'Access denied',
        })
      );
    });

    it('formats 409 CONCURRENT_MODIFICATION correctly', () => {
      const err = new AppError(409, CONCURRENT_MODIFICATION, 'CAS version mismatch');
      errorHandler(err, mockRequest, mockResponse as Response, nextMock);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'CONCURRENT_MODIFICATION',
          message: 'CAS version mismatch',
        })
      );
    });

    it('keeps current behaviour for untyped errors without code property', () => {
      const genericError = new Error('Database connection failed');
      errorHandler(genericError, mockRequest, mockResponse as Response, nextMock);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Database connection failed',
        })
      );
      // Verify code is not included in untyped error responses
      const responseData = jsonMock.mock.calls[0][0];
      expect(responseData.code).toBeUndefined();
    });

    it('keeps custom statusCode for untyped errors with statusCode set', () => {
      const customUntypedError = new Error('Unauthorized') as Error & { statusCode: number };
      customUntypedError.statusCode = 401;
      errorHandler(customUntypedError, mockRequest, mockResponse as Response, nextMock);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Unauthorized',
        })
      );
    });
  });
});
