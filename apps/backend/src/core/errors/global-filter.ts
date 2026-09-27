import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { AppError } from './app-error';

interface ErrorBody {
  error: {
    code: string;
    message: string;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const { statusCode, body } = this.mapException(exception);

    this.logError(exception, request.url, statusCode);

    response.status(statusCode).json(body);
  }

  private mapException(exception: unknown): { statusCode: number; body: ErrorBody } {
    if (exception instanceof AppError) {
      return {
        statusCode: exception.statusCode,
        body: { error: { code: exception.code, message: exception.message } },
      };
    }

    if (exception instanceof ZodError) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: exception.issues.map((i) => i.message).join(', '),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : (res as { message?: string | string[] }).message;
      return {
        statusCode: status,
        body: {
          error: {
            code: exception.name.replace('Exception', '').toUpperCase(),
            message: Array.isArray(message) ? message.join(', ') : (message ?? exception.message),
          },
        },
      };
    }

    return {
      statusCode: 500,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Terjadi kesalahan internal.',
        },
      },
    };
  }

  private logError(exception: unknown, url: string, statusCode: number): void {
    if (statusCode >= 500) {
      this.logger.error(`[${url}] ${exception}`);
    } else {
      this.logger.warn(`[${url}] ${JSON.stringify(exception)}`);
    }
  }
}
