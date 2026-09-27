export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'INTERNAL_ERROR',
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      404,
      id ? `${resource} dengan ID ${id} tidak ditemukan` : `${resource} tidak ditemukan`,
      'NOT_FOUND',
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string) {
    super(409, message, code);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class NotFoundAppError extends AppError {
  constructor(message: string, code = 'NOT_FOUND') {
    super(404, message, code);
  }
}

export class ConflictAppError extends AppError {
  constructor(message: string, code: string) {
    super(409, message, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Akses tidak diizinkan') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super(401, 'Username atau password salah.', 'INVALID_CREDENTIALS');
  }
}
