import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ValidationFailedException } from '../exceptions/validation-failed.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(): {
  host: ArgumentsHost;
  json: jest.Mock;
  status: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method: 'GET', originalUrl: '/api/v1/whatever' };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('ValidationFailedException için VALIDATION_ERROR gövdesi üretir', () => {
    const { host, json, status } = createHost();
    const exception = new ValidationFailedException([
      { field: 'email', errors: ['email must be an email'] },
    ]);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Gönderilen veri geçersiz.',
        details: [{ field: 'email', errors: ['email must be an email'] }],
      },
    });
  });

  it('HttpException için status bazlı bir kod üretir', () => {
    const { host, json, status } = createHost();
    const exception = new NotFoundException('proje bulunamadı');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_FOUND',
        message: 'proje bulunamadı',
      },
    });
  });

  it('bilinmeyen bir hata için 500 ve INTERNAL_ERROR döner, stack sızdırmaz', () => {
    const { host, json, status } = createHost();
    const exception = new Error('beklenmedik ve gizli bir sebep');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Beklenmeyen bir hata oluştu.',
      },
    });
    const [[body]] = json.mock.calls as [[{ error: { message: string } }]];
    expect(JSON.stringify(body)).not.toContain(
      'beklenmedik ve gizli bir sebep',
    );
  });

  it('BadRequestException için BAD_REQUEST kodu üretir', () => {
    const { host, json, status } = createHost();
    const exception = new BadRequestException('geçersiz istek');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'BAD_REQUEST',
        message: 'geçersiz istek',
      },
    });
  });
});
