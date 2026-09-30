import { ValidateBy, ValidationOptions } from 'class-validator';
import { CronExpressionParser } from 'cron-parser';

/** Standart 5 alanlı cron ifadesinin `cron-parser` ile ayrıştırılabildiğini doğrular. */
export function IsValidCron(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidCron',
      validator: {
        validate: (value: unknown): boolean => {
          if (typeof value !== 'string' || !value.trim()) {
            return false;
          }
          try {
            CronExpressionParser.parse(value);
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage: () => '$property geçerli bir cron ifadesi olmalı',
      },
    },
    validationOptions,
  );
}

/** IANA saat dilimi kimliğinin `Intl` tarafından tanındığını doğrular. */
export function IsIanaTimezone(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isIanaTimezone',
      validator: {
        validate: (value: unknown): boolean => {
          if (typeof value !== 'string' || !value.trim()) {
            return false;
          }
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage: () => '$property geçerli bir IANA saat dilimi olmalı',
      },
    },
    validationOptions,
  );
}
