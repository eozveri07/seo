import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export interface ValidationErrorDetail {
  field: string;
  errors: string[];
}

export class ValidationFailedException extends DomainException {
  constructor(details: ValidationErrorDetail[]) {
    super(
      'VALIDATION_ERROR',
      'Gönderilen veri geçersiz.',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}
