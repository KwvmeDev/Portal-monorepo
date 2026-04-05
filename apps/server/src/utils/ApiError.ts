/**
 * Custom application error class that carries an HTTP status code and
 * a machine-readable error code alongside the human-readable message.
 *
 * Usage:
 *   throw ApiError.notFound('User not found')
 *   throw new ApiError('Custom message', 418, 'im_a_teapot')
 */
export class ApiError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(message: string, statusCode: number, code: string) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code

    // Maintains proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype)
  }

  static badRequest(message: string): ApiError {
    return new ApiError(message, 400, 'bad_request')
  }

  static unauthorized(message: string): ApiError {
    return new ApiError(message, 401, 'unauthorized')
  }

  static forbidden(message: string): ApiError {
    return new ApiError(message, 403, 'forbidden')
  }

  static notFound(message: string): ApiError {
    return new ApiError(message, 404, 'not_found')
  }

  static conflict(message: string): ApiError {
    return new ApiError(message, 409, 'conflict')
  }

  static tooManyRequests(message: string): ApiError {
    return new ApiError(message, 429, 'too_many_requests')
  }

  static internal(message: string): ApiError {
    return new ApiError(message, 500, 'internal_error')
  }
}
