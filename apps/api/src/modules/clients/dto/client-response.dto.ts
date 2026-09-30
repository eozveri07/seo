import { Client } from '../entities/client.entity';

export class ClientResponseDto {
  id!: string;
  name!: string;
  contactEmails!: string[];
  notes!: string | null;
  branding!: Record<string, unknown>;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(client: Client): ClientResponseDto {
    return {
      id: client.id,
      name: client.name,
      contactEmails: client.contactEmails,
      notes: client.notes,
      branding: client.branding,
      isActive: client.isActive,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }
}

export class ClientListResponseDto {
  items!: ClientResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
