import { Injectable } from '@nestjs/common';
import { QueryDeepPartialEntity } from 'typeorm';
import { Page, pageOffset } from '../../common/pagination/pagination-query.dto';
import { OrgRole } from '../../common/tenancy/org-role';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { ClientNotFoundError } from './clients.errors';
import { ListClientQueryDto } from './dto/list-client-query.dto';
import { Client } from './entities/client.entity';

export interface CreateClientInput {
  name: string;
  contactEmails?: string[];
  notes?: string;
  branding?: Record<string, unknown>;
  isActive?: boolean;
}

export interface UpdateClientInput {
  name?: string;
  contactEmails?: string[];
  notes?: string;
  branding?: Record<string, unknown>;
  isActive?: boolean;
}

/**
 * Client CRUD'u (ARCHITECTURE §5.2). Tüm erişim `TenantRepository` üzerinden
 * org kapsamlıdır. `client_viewer` yalnız kendi client'ını görür; bu kısıt rol
 * kontrolüyle değil `actor.clientId` ile burada uygulanır.
 */
@Injectable()
export class ClientsService {
  constructor(
    @InjectTenantRepository(Client)
    private readonly clients: TenantRepository<Client>,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: ListClientQueryDto,
    actor: TenantContext,
  ): Promise<Page<Client>> {
    if (actor.role === OrgRole.ClientViewer) {
      const own = actor.clientId ? await this.findScoped(actor) : [];
      return {
        items: own,
        total: own.length,
        page: query.page,
        limit: query.limit,
      };
    }

    const qb = this.clients
      .createQueryBuilder('client')
      .orderBy('client.name', 'ASC')
      .addOrderBy('client.id', 'ASC')
      .skip(pageOffset(query))
      .take(query.limit);
    if (query.search) {
      qb.andWhere('client.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: query.page, limit: query.limit };
  }

  /** `client_viewer` için kendi client'ı 404, diğerleri org kapsamında bulunur. */
  async findOne(id: string, actor: TenantContext): Promise<Client> {
    if (actor.role === OrgRole.ClientViewer && actor.clientId !== id) {
      throw new ClientNotFoundError();
    }
    const client = await this.clients.findOneBy({ id });
    if (!client) {
      throw new ClientNotFoundError();
    }
    return client;
  }

  async create(input: CreateClientInput): Promise<Client> {
    const client = await this.clients.save({
      name: input.name.trim(),
      contactEmails: input.contactEmails ?? [],
      notes: input.notes ?? null,
      branding: input.branding ?? {},
      isActive: input.isActive ?? true,
    });
    await this.audit.record({
      action: AuditAction.ClientCreated,
      entityType: 'client',
      entityId: client.id,
      changes: { name: client.name },
    });
    return client;
  }

  async update(id: string, input: UpdateClientInput): Promise<Client> {
    const client = await this.clients.findOneBy({ id });
    if (!client) {
      throw new ClientNotFoundError();
    }
    const patch: Partial<Client> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.contactEmails !== undefined)
      patch.contactEmails = input.contactEmails;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.branding !== undefined) patch.branding = input.branding;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    // jsonb kolonu TypeORM'un derin partial tipine uymuyor; değer düz JSON.
    await this.clients.update({ id }, patch as QueryDeepPartialEntity<Client>);
    return Object.assign(client, patch);
  }

  async delete(id: string): Promise<void> {
    const client = await this.clients.findOneBy({ id });
    if (!client) {
      throw new ClientNotFoundError();
    }
    await this.clients.delete({ id });
    await this.audit.record({
      action: AuditAction.ClientDeleted,
      entityType: 'client',
      entityId: id,
      changes: { name: client.name },
    });
  }

  private findScoped(actor: TenantContext): Promise<Client[]> {
    return this.clients.findBy({ id: actor.clientId as string });
  }
}
