import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { DataSource, EntityManager, FindOperator, Repository } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { OrgRole } from '../../common/tenancy/org-role';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { EnvironmentVariables } from '../../config/environment-variables';
import { MailService, SendMailInput } from '../../infra/mail/mail.service';
import { AuditService } from '../audit-logs/audit.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { Invitation } from './entities/invitation.entity';
import { Organization } from './entities/organization.entity';
import {
  hashInvitationToken,
  INVITATION_TTL_DAYS,
  InvitationsService,
} from './invitations.service';
import { MembershipsService } from './memberships.service';
import {
  AlreadyMemberError,
  InvalidClientScopeError,
  InvitationAccountExistsError,
  InvitationAlreadyAcceptedError,
  InvitationEmailMismatchError,
  InvitationExpiredError,
  InvitationNotFoundError,
  OwnerRoleRequiredError,
} from './organizations.errors';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const INVITER = '0190f0e4-0000-7000-8000-0000000000a1';
const CLIENT = '0190f0e4-0000-7000-8000-00000000c001';
const DAY_MS = 86_400_000;

const asOwner: TenantContext = {
  orgId: ORG,
  role: OrgRole.Owner,
  clientId: null,
};
const asAdmin: TenantContext = {
  orgId: ORG,
  role: OrgRole.Admin,
  clientId: null,
};

function user(overrides: Partial<User> = {}): User {
  return {
    id: '0190f0e4-0000-7000-8000-0000000000b1',
    email: 'davetli@example.com',
    name: 'Davetli',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

/** invitations tablosu: tek org'un satırları, token hash'iyle aranabilir. */
function setup() {
  const rows: Invitation[] = [];
  const clsStore: Partial<AppClsStore> = { userId: INVITER, orgId: ORG };

  const tenantInvitations = {
    withManager: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    save: jest.fn((values: Partial<Invitation>) => {
      const row = {
        ...values,
        id: `inv-${rows.length + 1}`,
        orgId: ORG,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Invitation;
      rows.push(row);
      return Promise.resolve({ ...row });
    }),
  };
  tenantInvitations.withManager.mockReturnValue(tenantInvitations);
  const byHash = (where: { tokenHash?: string }) =>
    rows.find((row) => row.tokenHash === where.tokenHash) ?? null;
  const allInvitations = {
    findOneBy: jest.fn((where: { tokenHash: string }) =>
      Promise.resolve(byHash(where)),
    ),
  };
  const transactionalInvitations = {
    findOne: jest.fn((options: { where: { tokenHash: string } }) =>
      Promise.resolve(
        byHash(options.where) ? { ...byHash(options.where) } : null,
      ),
    ),
    update: jest.fn(
      (
        where: { id: string; acceptedAt: unknown },
        patch: Partial<Invitation>,
      ) => {
        const row = rows.find((r) => r.id === where.id);
        if (
          row &&
          where.acceptedAt instanceof FindOperator &&
          !row.acceptedAt
        ) {
          Object.assign(row, patch);
        }
        return Promise.resolve({ affected: 1 });
      },
    ),
  };
  const manager = {
    getRepository: jest.fn(() => transactionalInvitations),
  };
  const dataSource = {
    transaction: jest.fn(async <T>(cb: (m: EntityManager) => Promise<T>) => {
      const snapshot = rows.map((row) => ({ ...row }) as Invitation);
      try {
        return await cb(manager as unknown as EntityManager);
      } catch (error) {
        rows.splice(0, rows.length, ...snapshot);
        throw error;
      }
    }),
  };
  const organizations = {
    findOneBy: jest.fn().mockResolvedValue({ id: ORG, name: 'Acme <Ajans>' }),
    findOneByOrFail: jest
      .fn()
      .mockResolvedValue({ id: ORG, name: 'Acme <Ajans>' }),
  };
  const memberships = {
    isMember: jest.fn().mockResolvedValue(false),
    add: jest.fn((input: { orgId: string; userId: string; role: OrgRole }) =>
      Promise.resolve({ id: 'm-1', clientId: null, ...input }),
    ),
  };
  const usersService = {
    findByEmail: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(user()),
    create: jest.fn((input: { email: string; name: string }) =>
      Promise.resolve(user({ email: input.email, name: input.name })),
    ),
  };
  const sentMails: SendMailInput[] = [];
  const mailService = {
    send: jest.fn((input: SendMailInput) => {
      sentMails.push(input);
      return Promise.resolve();
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const env: Record<string, string> = {
    PANEL_URL: 'https://panel.example.com/',
    PANEL_ORIGIN: 'http://localhost:5173',
  };
  const cls = {
    get: jest.fn((key: 'userId' | 'orgId') => clsStore[key]),
    set: jest.fn((key: 'userId' | 'orgId', value: unknown) => {
      (clsStore as Record<string, unknown>)[key] = value;
    }),
    run: jest.fn((_options: unknown, fn: () => unknown) => fn()),
  };

  const service = new InvitationsService(
    tenantInvitations as unknown as TenantRepository<Invitation>,
    allInvitations as unknown as Repository<Invitation>,
    organizations as unknown as Repository<Organization>,
    dataSource as unknown as DataSource,
    memberships as unknown as MembershipsService,
    usersService as unknown as UsersService,
    mailService as unknown as MailService,
    audit as unknown as AuditService,
    { get: (key: string) => env[key] } as unknown as ConfigService<
      EnvironmentVariables,
      true
    >,
    cls as unknown as ClsService<AppClsStore>,
  );

  const tokenOf = (mail: SendMailInput) =>
    decodeURIComponent(/token=([^\s&"]+)/.exec(mail.text)?.[1] ?? '');

  return {
    service,
    rows,
    sentMails,
    tokenOf,
    tenantInvitations,
    memberships,
    usersService,
    mailService,
    audit,
    cls,
    clsStore,
    env,
  };
}

async function invited(ctx: ReturnType<typeof setup>, role = OrgRole.Analyst) {
  await ctx.service.create({ email: 'Davetli@Example.com', role }, asOwner);
  return ctx.tokenOf(ctx.sentMails[ctx.sentMails.length - 1]);
}

describe('InvitationsService', () => {
  describe('create', () => {
    it("token'ın yalnız SHA-256 hash'ini saklar ve 7 gün geçerli kılar", async () => {
      const ctx = setup();

      const { invitation, emailSent } = await ctx.service.create(
        { email: 'Davetli@Example.com', role: OrgRole.Analyst },
        asOwner,
      );

      const token = ctx.tokenOf(ctx.sentMails[0]);
      expect(token.length).toBeGreaterThanOrEqual(43);
      expect(ctx.rows[0].tokenHash).toBe(hashInvitationToken(token));
      expect(ctx.rows[0].tokenHash).not.toContain(token);
      expect(invitation).not.toHaveProperty('tokenHash');
      expect(emailSent).toBe(true);
      expect(ctx.rows[0]).toMatchObject({
        email: 'davetli@example.com',
        role: OrgRole.Analyst,
        clientId: null,
        acceptedAt: null,
        invitedBy: INVITER,
      });
      const ttl = ctx.rows[0].expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(INVITATION_TTL_DAYS * DAY_MS - 5_000);
      expect(ttl).toBeLessThanOrEqual(INVITATION_TTL_DAYS * DAY_MS);
    });

    it('bağlantı PANEL_URL’e gider; aynı e-postanın bekleyen daveti silinir', async () => {
      const ctx = setup();

      await ctx.service.create(
        { email: 'davetli@example.com', role: OrgRole.Admin },
        asOwner,
      );

      expect(ctx.sentMails[0].to).toBe('davetli@example.com');
      expect(ctx.sentMails[0].text).toContain(
        'https://panel.example.com/invitations/accept?token=',
      );
      expect(ctx.sentMails[0].html).toContain('Acme &lt;Ajans&gt;');
      const [criteria] = ctx.tenantInvitations.delete.mock.calls[0] as [
        { email: string; acceptedAt: FindOperator<unknown> },
      ];
      expect(criteria.email).toBe('davetli@example.com');
      expect(criteria.acceptedAt.type).toBe('isNull');
      expect(ctx.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invitation.created' }),
        expect.anything(),
      );
    });

    it('mail gönderilemezse davet kalır ve emailSent false döner', async () => {
      const ctx = setup();
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      ctx.mailService.send.mockRejectedValueOnce(new Error('SMTP kapalı'));

      const result = await ctx.service.create(
        { email: 'davetli@example.com', role: OrgRole.Analyst },
        asOwner,
      );

      expect(result.emailSent).toBe(false);
      expect(ctx.rows).toHaveLength(1);
      // token log'a yazılmaz
      const logged = error.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).not.toMatch(/token=/);
      error.mockRestore();
    });

    it('client_viewer davetinde clientId zorunlu, diğer rollerde verilemez', async () => {
      const ctx = setup();

      await expect(
        ctx.service.create(
          { email: 'x@example.com', role: OrgRole.ClientViewer },
          asOwner,
        ),
      ).rejects.toBeInstanceOf(InvalidClientScopeError);
      await expect(
        ctx.service.create(
          { email: 'x@example.com', role: OrgRole.Analyst, clientId: CLIENT },
          asOwner,
        ),
      ).rejects.toBeInstanceOf(InvalidClientScopeError);

      await ctx.service.create(
        {
          email: 'x@example.com',
          role: OrgRole.ClientViewer,
          clientId: CLIENT,
        },
        asOwner,
      );
      expect(ctx.rows[0].clientId).toBe(CLIENT);
    });

    it('admin owner davet edemez', async () => {
      const ctx = setup();

      await expect(
        ctx.service.create(
          { email: 'x@example.com', role: OrgRole.Owner },
          asAdmin,
        ),
      ).rejects.toBeInstanceOf(OwnerRoleRequiredError);
      expect(ctx.rows).toHaveLength(0);
    });

    it('zaten üye olan kullanıcı davet edilemez', async () => {
      const ctx = setup();
      ctx.usersService.findByEmail.mockResolvedValue(user());
      ctx.memberships.isMember.mockResolvedValue(true);

      await expect(
        ctx.service.create(
          { email: 'davetli@example.com', role: OrgRole.Analyst },
          asOwner,
        ),
      ).rejects.toBeInstanceOf(AlreadyMemberError);
    });
  });

  describe('acceptWithSignup (yeni kullanıcı)', () => {
    it('davetteki e-postayla hesap açar, üyeliği davetin org’unda ekler', async () => {
      const ctx = setup();
      const token = await invited(ctx);
      ctx.clsStore.orgId = undefined; // kabul X-Org-Id olmadan gelir

      const result = await ctx.service.acceptWithSignup({
        token,
        name: 'Davetli',
        passwordHash: '$argon2id$hash',
      });

      expect(ctx.usersService.create).toHaveBeenCalledWith(
        {
          email: 'davetli@example.com',
          name: 'Davetli',
          passwordHash: '$argon2id$hash',
        },
        expect.anything(),
      );
      expect(ctx.memberships.add).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG,
          userId: result.user.id,
          role: OrgRole.Analyst,
          invitedBy: INVITER,
        }),
        expect.anything(),
      );
      expect(ctx.cls.set).toHaveBeenCalledWith('orgId', ORG);
      expect(ctx.rows[0].acceptedAt).toBeInstanceOf(Date);
    });

    it('token tek kullanımlık', async () => {
      const ctx = setup();
      const token = await invited(ctx);
      const input = { token, name: 'Davetli', passwordHash: 'h' };
      await ctx.service.acceptWithSignup(input);

      await expect(ctx.service.acceptWithSignup(input)).rejects.toBeInstanceOf(
        InvitationAlreadyAcceptedError,
      );
      expect(ctx.usersService.create).toHaveBeenCalledTimes(1);
    });

    it('süresi dolmuş davet reddedilir', async () => {
      const ctx = setup();
      const token = await invited(ctx);
      ctx.rows[0].expiresAt = new Date(Date.now() - 1000);

      await expect(
        ctx.service.acceptWithSignup({ token, name: 'D', passwordHash: 'h' }),
      ).rejects.toBeInstanceOf(InvitationExpiredError);
      expect(ctx.usersService.create).not.toHaveBeenCalled();
    });

    it('bilinmeyen token reddedilir', async () => {
      const ctx = setup();

      await expect(
        ctx.service.acceptWithSignup({
          token: 'uydurma',
          name: 'D',
          passwordHash: 'h',
        }),
      ).rejects.toBeInstanceOf(InvitationNotFoundError);
    });

    it('hesap zaten varsa açılmaz ve davet kullanılmamış kalır', async () => {
      const ctx = setup();
      const token = await invited(ctx);
      ctx.usersService.findByEmail.mockResolvedValue(user());

      await expect(
        ctx.service.acceptWithSignup({ token, name: 'D', passwordHash: 'h' }),
      ).rejects.toBeInstanceOf(InvitationAccountExistsError);
      expect(ctx.rows[0].acceptedAt).toBeNull();
    });
  });

  describe('accept (mevcut kullanıcı)', () => {
    it('oturumdaki kullanıcının e-postası eşleşirse üyelik eklenir', async () => {
      const ctx = setup();
      const token = await invited(ctx, OrgRole.Admin);

      const { membership } = await ctx.service.accept(token, user().id);

      expect(membership).toMatchObject({
        orgId: ORG,
        userId: user().id,
        role: OrgRole.Admin,
      });
      expect(ctx.rows[0].acceptedAt).toBeInstanceOf(Date);
    });

    it('başka e-postalı kullanıcı kabul edemez; davet kullanılmamış kalır', async () => {
      const ctx = setup();
      const token = await invited(ctx);
      ctx.usersService.findById.mockResolvedValue(
        user({ email: 'baskasi@example.com' }),
      );

      await expect(ctx.service.accept(token, user().id)).rejects.toBeInstanceOf(
        InvitationEmailMismatchError,
      );
      expect(ctx.rows[0].acceptedAt).toBeNull();
      expect(ctx.memberships.add).not.toHaveBeenCalled();
    });

    it('zaten üyeyse ALREADY_MEMBER', async () => {
      const ctx = setup();
      const token = await invited(ctx);
      ctx.memberships.isMember.mockResolvedValue(true);

      await expect(ctx.service.accept(token, user().id)).rejects.toBeInstanceOf(
        AlreadyMemberError,
      );
    });
  });

  it('önizleme süresi dolmuş daveti göstermez', async () => {
    const ctx = setup();
    const token = await invited(ctx);
    ctx.rows[0].expiresAt = new Date(Date.now() - 1000);

    await expect(ctx.service.preview(token)).rejects.toBeInstanceOf(
      InvitationExpiredError,
    );
  });
});
