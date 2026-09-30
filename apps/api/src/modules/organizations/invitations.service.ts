import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { createHash, randomBytes } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  IsNull,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import {
  Page,
  PaginationQueryDto,
  pageOffset,
} from '../../common/pagination/pagination-query.dto';
import { OrgRole } from '../../common/tenancy/org-role';
import { runInTenant } from '../../common/tenancy/run-in-tenant';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { EnvironmentVariables } from '../../config/environment-variables';
import { MailService } from '../../infra/mail/mail.service';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { normalizeEmail } from '../users/email';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { Invitation } from './entities/invitation.entity';
import { Membership } from './entities/membership.entity';
import { Organization } from './entities/organization.entity';
import {
  MembershipsService,
  normalizeClientScope,
} from './memberships.service';
import {
  AlreadyMemberError,
  InvitationAccountExistsError,
  InvitationAlreadyAcceptedError,
  InvitationEmailMismatchError,
  InvitationExpiredError,
  InvitationNotFoundError,
  OwnerRoleRequiredError,
} from './organizations.errors';

export const INVITATION_TTL_DAYS = 7;
const TOKEN_BYTES = 32;
const DAY_MS = 24 * 60 * 60 * 1000;
const MEMBERSHIP_UNIQUE_CONSTRAINT = 'UQ_memberships_org_id_user_id';

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreateInvitationInput {
  email: string;
  role: OrgRole;
  clientId?: string | null;
}

export interface CreatedInvitation {
  invitation: Invitation;
  /** Mail gönderilemediyse false; davet yine de geçerlidir, tekrar gönderilebilir. */
  emailSent: boolean;
}

export interface InvitationPreview {
  organization: Organization;
  invitation: Invitation;
  userExists: boolean;
}

export interface AcceptedInvitation {
  membership: Membership;
}

export interface SignupInput {
  token: string;
  name: string;
  passwordHash: string;
}

export interface SignupResult {
  user: User;
  membership: Membership;
}

/**
 * Davetler (ARCHITECTURE §4.4). Token opak rastgele bir değerdir; DB'de
 * SHA-256 hash'i durur, 7 gün geçerlidir ve tek kullanımlıktır.
 *
 * Kabul akışları X-Org-Id olmadan gelir: org, token'dan bulunan davetten alınır
 * ve `runInTenant` ile CLS'e yazılır. Token'ın kendisi yetki belgesidir.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @InjectTenantRepository(Invitation)
    private readonly invitations: TenantRepository<Invitation>,
    @InjectRepository(Invitation)
    private readonly allInvitations: Repository<Invitation>,
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly memberships: MembershipsService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly audit: AuditService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  /**
   * Davet oluşturur ve mail gönderir. Aynı e-postaya bekleyen eski davetler
   * silinir (yeniden gönderim). owner davetini yalnız owner yapabilir.
   */
  async create(
    input: CreateInvitationInput,
    actor: TenantContext,
  ): Promise<CreatedInvitation> {
    const clientId = normalizeClientScope(input.role, input.clientId);
    if (input.role === OrgRole.Owner && actor.role !== OrgRole.Owner) {
      throw new OwnerRoleRequiredError();
    }
    const email = normalizeEmail(input.email);
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser && (await this.memberships.isMember(existingUser.id))) {
      throw new AlreadyMemberError();
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const invitation = await this.dataSource.transaction(async (manager) => {
      const repository = this.invitations.withManager(manager);
      await repository.delete({ email, acceptedAt: IsNull() });
      const saved = await repository.save({
        email,
        role: input.role,
        clientId,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * DAY_MS),
        acceptedAt: null,
        invitedBy: this.cls.get('userId') ?? null,
      });
      await this.audit.record(
        {
          action: AuditAction.InvitationCreated,
          entityType: 'invitation',
          entityId: saved.id,
          changes: { email, role: input.role, clientId },
        },
        manager,
      );
      return saved;
    });
    delete (invitation as Partial<Invitation>).tokenHash;

    const organization = await this.organizations.findOneBy({
      id: actor.orgId,
    });
    const emailSent = await this.sendInvitationMail(
      email,
      organization?.name ?? '',
      token,
    );
    return { invitation, emailSent };
  }

  /** Kabul edilmemiş davetler (süresi dolmuşlar dahil), en yeni önce. */
  async listPending(query: PaginationQueryDto): Promise<Page<Invitation>> {
    const [items, total] = await this.invitations.findAndCount({
      where: { acceptedAt: IsNull() },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: pageOffset(query),
      take: query.limit,
    });
    return { items, total, page: query.page, limit: query.limit };
  }

  /** Bekleyen daveti geri çeker. owner davetini yalnız owner geri çekebilir. */
  async revoke(id: string, actor: TenantContext): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = this.invitations.withManager(manager);
      const invitation = await repository.findOneBy({
        id,
        acceptedAt: IsNull(),
      });
      if (!invitation) {
        throw new InvitationNotFoundError();
      }
      if (invitation.role === OrgRole.Owner && actor.role !== OrgRole.Owner) {
        throw new OwnerRoleRequiredError();
      }
      await repository.delete({ id: invitation.id });
      await this.audit.record(
        {
          action: AuditAction.InvitationRevoked,
          entityType: 'invitation',
          entityId: invitation.id,
          changes: { email: invitation.email, role: invitation.role },
        },
        manager,
      );
    });
  }

  /** Panelin kabul ekranı için: davet geçerliyse org adı, e-posta ve rol. */
  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.findByToken(token);
    assertUsable(invitation);
    const organization = await this.organizations.findOneByOrFail({
      id: invitation.orgId,
    });
    const user = await this.usersService.findByEmail(invitation.email);
    return { organization, invitation, userExists: user !== null };
  }

  /** Oturumdaki mevcut kullanıcı daveti kabul eder; e-postası davetinkiyle aynı olmalı. */
  async accept(token: string, userId: string): Promise<AcceptedInvitation> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new InvitationEmailMismatchError();
    }

    return this.withClaimedInvitation(token, async (invitation, manager) => {
      if (invitation.email !== user.email) {
        throw new InvitationEmailMismatchError();
      }
      if (await this.memberships.isMember(user.id)) {
        throw new AlreadyMemberError();
      }
      const membership = await this.addMember(invitation, user.id, manager);
      return { membership };
    });
  }

  /**
   * Davetli kayıt (T1.1 register'ının davetli yolu): davetteki e-postayla
   * hesap açar ve üyeliği ekler. Hesap zaten varsa kullanıcı giriş yapıp
   * `accept` ile kabul etmelidir.
   */
  async acceptWithSignup(input: SignupInput): Promise<SignupResult> {
    return this.withClaimedInvitation(
      input.token,
      async (invitation, manager) => {
        if (await this.usersService.findByEmail(invitation.email, manager)) {
          throw new InvitationAccountExistsError();
        }
        const user = await this.usersService.create(
          {
            email: invitation.email,
            name: input.name,
            passwordHash: input.passwordHash,
          },
          manager,
        );
        const membership = await this.addMember(invitation, user.id, manager);
        return { user, membership };
      },
    );
  }

  /**
   * Daveti kilitleyip tek kullanımlık olarak işaretler ve `fn`'i davetin
   * org'unun tenant context'inde, aynı transaction'da çalıştırır. `fn` hata
   * verirse davet kullanılmamış kalır.
   */
  private async withClaimedInvitation<T>(
    token: string,
    fn: (invitation: Invitation, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(Invitation);
        const invitation = await repository.findOne({
          where: { tokenHash: hashInvitationToken(token) },
          lock: { mode: 'pessimistic_write' },
        });
        assertUsable(invitation);
        await repository.update(
          { id: invitation.id, acceptedAt: IsNull() },
          { acceptedAt: new Date() },
        );
        return runInTenant(this.cls, invitation.orgId, () =>
          fn(invitation, manager),
        );
      });
    } catch (error) {
      if (isMembershipConflict(error)) {
        throw new AlreadyMemberError();
      }
      throw error;
    }
  }

  private addMember(
    invitation: Invitation,
    userId: string,
    manager: EntityManager,
  ): Promise<Membership> {
    return this.memberships.add(
      {
        orgId: invitation.orgId,
        userId,
        role: invitation.role,
        clientId: invitation.clientId,
        invitedBy: invitation.invitedBy,
      },
      manager,
    );
  }

  private findByToken(token: string): Promise<Invitation | null> {
    // Token tüm org'lar arasında aranır: token'ın kendisi yetki belgesidir.
    return this.allInvitations.findOneBy({
      tokenHash: hashInvitationToken(token),
    });
  }

  private async sendInvitationMail(
    email: string,
    organizationName: string,
    token: string,
  ): Promise<boolean> {
    const link = `${this.panelUrl()}/invitations/accept?token=${encodeURIComponent(token)}`;
    const subject = `${organizationName} organizasyonuna davet edildiniz`;
    try {
      await this.mailService.send({
        to: email,
        subject,
        text: `${organizationName} organizasyonuna katılmak için bağlantıyı açın: ${link}\n\nBağlantı ${INVITATION_TTL_DAYS} gün geçerlidir.`,
        html: `<p><strong>${escapeHtml(organizationName)}</strong> organizasyonuna katılmak için <a href="${escapeHtml(link)}">daveti kabul edin</a>.</p><p>Bağlantı ${INVITATION_TTL_DAYS} gün geçerlidir.</p>`,
      });
      return true;
    } catch (error) {
      // token loglanmaz
      this.logger.error(
        `Davet maili gönderilemedi (to=${email}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private panelUrl(): string {
    const url =
      this.configService.get('PANEL_URL', { infer: true }) ??
      this.configService.get('PANEL_ORIGIN', { infer: true }) ??
      '';
    return url.replace(/\/+$/, '');
  }
}

function assertUsable(
  invitation: Invitation | null,
): asserts invitation is Invitation {
  if (!invitation) {
    throw new InvitationNotFoundError();
  }
  if (invitation.acceptedAt) {
    throw new InvitationAlreadyAcceptedError();
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new InvitationExpiredError();
  }
}

function isMembershipConflict(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { constraint?: string } | undefined)?.constraint ===
      MEMBERSHIP_UNIQUE_CONSTRAINT
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
