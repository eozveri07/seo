import { Body, Controller, Module, Post } from '@nestjs/common';
import { IsEmail, IsString } from 'class-validator';

// Sadece ValidationPipe'ı e2e'de doğrulamak için tanımlanan test-only DTO ve controller.
// Üretim kodunda gerçek bir endpoint değildir.
class ValidationTestDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;
}

@Controller('test-validation')
class ValidationTestController {
  @Post()
  create(@Body() dto: ValidationTestDto): ValidationTestDto {
    return dto;
  }
}

@Module({
  controllers: [ValidationTestController],
})
export class ValidationTestModule {}
