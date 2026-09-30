import { ValidationError } from '@nestjs/common';
import {
  ValidationErrorDetail,
  ValidationFailedException,
} from './exceptions/validation-failed.exception';

function flattenErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const ownErrors: ValidationErrorDetail[] = error.constraints
      ? [{ field, errors: Object.values(error.constraints) }]
      : [];
    const childErrors = error.children?.length
      ? flattenErrors(error.children, field)
      : [];
    return [...ownErrors, ...childErrors];
  });
}

export function validationExceptionFactory(
  errors: ValidationError[],
): ValidationFailedException {
  return new ValidationFailedException(flattenErrors(errors));
}
