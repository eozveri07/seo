import { Injectable, PipeTransform } from '@nestjs/common';
import { ValidationFailedException } from '../../common/exceptions/validation-failed.exception';

const MD5_HEX = /^[0-9a-f]{32}$/;

/** `:hash` path parametresi: küçük harf 32 karakter md5 hex. */
@Injectable()
export class Md5HashPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!MD5_HEX.test(value)) {
      throw new ValidationFailedException([
        { field: 'hash', errors: ['hash 32 karakterlik md5 hex olmalı'] },
      ]);
    }
    return value;
  }
}
