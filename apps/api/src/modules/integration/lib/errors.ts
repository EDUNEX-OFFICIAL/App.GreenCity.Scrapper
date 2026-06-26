export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly errors?: unknown[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, errors?: unknown[]): AppError {
    return new AppError(message, 400, errors);
  }

  static unauthorized(message = 'Invalid or missing API key'): AppError {
    return new AppError(message, 401);
  }

  static notFound(message: string): AppError {
    return new AppError(message, 404);
  }

  static conflict(message: string, errors?: unknown[]): AppError {
    return new AppError(message, 409, errors);
  }

  static tooManyRequests(message = 'Rate limit exceeded'): AppError {
    return new AppError(message, 429);
  }
}
