import {
  createE2eApp,
  describeWithDatabase,
  E2eContext,
  invitationTokenFrom,
  TEST_PASSWORD,
} from './support/e2e-app';
import { membershipCacheKey } from '../src/modules/organizations/membership-cache';

/**
 * PLAN.md T1.2 akışları gerçek DB'ye karşı: org oluşturma, davet (yeni ve
 * mevcut kullanıcı), token'ın tek kullanımlık ve süreli olması, rol değişimi
 * ve çıkarmada membership cache'inin silinmesi, son owner kuralı ve audit.
 * Çalıştırma: `test/support/e2e-app.ts`.
 */

interface ErrorBody {
  error: { code: string };
}

const CLIENT_ID = '0190f0e4-0000-7000-8000-00000000c001';

describeWithDatabase('Organizasyonlar ve davetler (e2e, test DB)', () => {
  let ctx: E2eContext;
  let ownerToken: string;
  let orgId: string;

  const as = (token: string) => ({
    get: (path: string) =>
      ctx
        .http()
        .get(`/api/v1${path}`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Org-Id', orgId),
    post: (path: string, body: object) =>
      ctx
        .http()
        .post(`/api/v1${path}`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Org-Id', orgId)
        .send(body),
    patch: (path: string, body: object) =>
      ctx
        .http()
        .patch(`/api/v1${path}`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Org-Id', orgId)
        .send(body),
    delete: (path: string) =>
      ctx
        .http()
        .delete(`/api/v1${path}`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Org-Id', orgId),
  });

  async function invite(
    email: string,
    role: string,
    extra: object = {},
  ): Promise<string> {
    const response = await as(ownerToken).post('/invitations', {
      email,
      role,
      ...extra,
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      email: email.toLowerCase(),
      role,
      emailSent: true,
    });
    expect(response.body).not.toHaveProperty('tokenHash');
    return invitationTokenFrom(ctx.sentMails[ctx.sentMails.length - 1]);
  }

  /** Davetle yeni hesap açar; access token döner. */
  async function registerInvited(email: string, role: string) {
    const token = await invite(email, role);
    const response = await ctx
      .http()
      .post('/api/v1/auth/register-invited')
      .send({ token, name: 'Davetli', password: TEST_PASSWORD });
    expect(response.status).toBe(201);
    const body = response.body as {
      accessToken: string;
      user: { id: string };
    };
    return { accessToken: body.accessToken, userId: body.user.id };
  }

  beforeAll(async () => {
    ctx = await createE2eApp();
  });

  beforeEach(async () => {
    await ctx.reset();
    await ctx.createUser('owner@example.com');
    ownerToken = await ctx.login('owner@example.com');
    const created = await ctx
      .http()
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Acme Ajans Şube' });
    expect(created.status).toBe(201);
    orgId = (created.body as { id: string }).id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('oluşturan owner olur, slug addan üretilir, /me X-Org-Id istemez', async () => {
    const list = await ctx
      .http()
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.body).toMatchObject({
      total: 1,
      items: [{ id: orgId, slug: 'acme-ajans-sube', role: 'owner' }],
    });

    const me = await ctx
      .http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(me.status).toBe(200);

    const duplicate = await ctx
      .http()
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Başka', slug: 'acme-ajans-sube' });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as ErrorBody).error.code).toBe('ORG_SLUG_TAKEN');
  });

  describe('davet', () => {
    it('yeni kullanıcı: önizleme → davetli kayıt → üyelik; token ikinci kez kullanılamaz', async () => {
      const token = await invite('Yeni@Example.com', 'analyst');
      const mail = ctx.sentMails[0];
      expect(mail.to).toBe('yeni@example.com');
      expect(mail.text).toContain(
        'http://localhost:5173/invitations/accept?token=',
      );

      const [row] = await ctx.dataSource.query<{ token_hash: string }[]>(
        'SELECT token_hash FROM invitations',
      );
      expect(row.token_hash).not.toBe(token);
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);

      const preview = await ctx
        .http()
        .post('/api/v1/invitations/preview')
        .send({ token });
      expect(preview.body).toMatchObject({
        organizationName: 'Acme Ajans Şube',
        email: 'yeni@example.com',
        role: 'analyst',
        userExists: false,
      });

      const registered = await ctx
        .http()
        .post('/api/v1/auth/register-invited')
        .send({ token, name: 'Yeni', password: TEST_PASSWORD });
      expect(registered.status).toBe(201);
      const accessToken = (registered.body as { accessToken: string })
        .accessToken;
      const current = await as(accessToken).get('/organizations/current');
      expect(current.status).toBe(200);

      const reused = await ctx
        .http()
        .post('/api/v1/auth/register-invited')
        .send({ token, name: 'Tekrar', password: TEST_PASSWORD });
      expect(reused.status).toBe(409);
      expect((reused.body as ErrorBody).error.code).toBe(
        'INVITATION_ALREADY_ACCEPTED',
      );
    });

    it('mevcut kullanıcı: giriş yapıp kabul eder; başka e-posta kabul edemez', async () => {
      await ctx.createUser('mevcut@example.com');
      await ctx.createUser('baskasi@example.com');
      const token = await invite('mevcut@example.com', 'admin');

      const preview = await ctx
        .http()
        .post('/api/v1/invitations/preview')
        .send({ token });
      expect(preview.body).toMatchObject({ userExists: true });

      const signup = await ctx
        .http()
        .post('/api/v1/auth/register-invited')
        .send({ token, name: 'X', password: TEST_PASSWORD });
      expect((signup.body as ErrorBody).error.code).toBe(
        'INVITATION_ACCOUNT_EXISTS',
      );

      const otherToken = await ctx.login('baskasi@example.com');
      const mismatch = await ctx
        .http()
        .post('/api/v1/invitations/accept')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ token });
      expect(mismatch.status).toBe(403);
      expect((mismatch.body as ErrorBody).error.code).toBe(
        'INVITATION_EMAIL_MISMATCH',
      );

      const userToken = await ctx.login('mevcut@example.com');
      const accepted = await ctx
        .http()
        .post('/api/v1/invitations/accept')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ token });
      expect(accepted.status).toBe(200);
      expect(accepted.body).toEqual({
        organizationId: orgId,
        role: 'admin',
        clientId: null,
      });

      const again = await ctx
        .http()
        .post('/api/v1/invitations/accept')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ token });
      expect(again.status).toBe(409);
    });

    it('süresi dolmuş davet kabul edilmez', async () => {
      const token = await invite('gec@example.com', 'analyst');
      await ctx.dataSource.query(
        `UPDATE invitations SET expires_at = now() - interval '1 minute'`,
      );

      const response = await ctx
        .http()
        .post('/api/v1/auth/register-invited')
        .send({ token, name: 'Geç', password: TEST_PASSWORD });

      expect(response.status).toBe(410);
      expect((response.body as ErrorBody).error.code).toBe(
        'INVITATION_EXPIRED',
      );
      const users = await ctx.dataSource.query<unknown[]>(
        `SELECT id FROM users WHERE email = 'gec@example.com'`,
      );
      expect(users).toHaveLength(0);
    });

    it('client_viewer davetinde clientId zorunlu; üyelik client kapsamını taşır', async () => {
      const missing = await as(ownerToken).post('/invitations', {
        email: 'musteri@example.com',
        role: 'client_viewer',
      });
      expect(missing.status).toBe(400);
      expect((missing.body as ErrorBody).error.code).toBe(
        'INVALID_CLIENT_SCOPE',
      );

      const token = await invite('musteri@example.com', 'client_viewer', {
        clientId: CLIENT_ID,
      });
      await ctx
        .http()
        .post('/api/v1/auth/register-invited')
        .send({ token, name: 'Müşteri', password: TEST_PASSWORD })
        .expect(201);

      const members = await as(ownerToken).get('/members');
      expect(members.body).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            email: 'musteri@example.com',
            role: 'client_viewer',
            clientId: CLIENT_ID,
          }),
        ]) as unknown,
      });
    });

    it('admin owner davet edemez', async () => {
      const admin = await registerInvited('admin@example.com', 'admin');

      const response = await as(admin.accessToken).post('/invitations', {
        email: 'yeni-owner@example.com',
        role: 'owner',
      });

      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).error.code).toBe(
        'OWNER_ROLE_REQUIRED',
      );
    });
  });

  describe('membership cache', () => {
    it('rol düşürülünce eski rol cache’ten okunmaz', async () => {
      const admin = await registerInvited('admin@example.com', 'admin');
      expect((await as(admin.accessToken).get('/members')).status).toBe(200);
      expect(ctx.cache.has(membershipCacheKey(orgId, admin.userId))).toBe(true);

      const changed = await as(ownerToken).patch(`/members/${admin.userId}`, {
        role: 'analyst',
      });
      expect(changed.status).toBe(200);
      expect(ctx.cache.has(membershipCacheKey(orgId, admin.userId))).toBe(
        false,
      );

      const denied = await as(admin.accessToken).get('/members');
      expect(denied.status).toBe(403);
      expect((denied.body as ErrorBody).error.code).toBe('INSUFFICIENT_ROLE');
    });

    it('çıkarılan üye cache’teki üyelikle erişemez', async () => {
      const analyst = await registerInvited('analist@example.com', 'analyst');
      expect(
        (await as(analyst.accessToken).get('/organizations/current')).status,
      ).toBe(200);

      const removed = await as(ownerToken).delete(`/members/${analyst.userId}`);
      expect(removed.status).toBe(204);

      const denied = await as(analyst.accessToken).get(
        '/organizations/current',
      );
      expect(denied.status).toBe(403);
      expect((denied.body as ErrorBody).error.code).toBe('ORG_ACCESS_DENIED');
    });
  });

  describe('son owner', () => {
    it('son owner çıkarılamaz ve rolü düşürülemez; ikinci owner varken düşürülebilir', async () => {
      const ownerId = (
        await ctx.dataSource.query<{ id: string }[]>(
          `SELECT id FROM users WHERE email = 'owner@example.com'`,
        )
      )[0].id;

      const remove = await as(ownerToken).delete(`/members/${ownerId}`);
      expect(remove.status).toBe(409);
      expect((remove.body as ErrorBody).error.code).toBe('LAST_OWNER');

      const demote = await as(ownerToken).patch(`/members/${ownerId}`, {
        role: 'admin',
      });
      expect(demote.status).toBe(409);
      expect((demote.body as ErrorBody).error.code).toBe('LAST_OWNER');

      const second = await registerInvited('ikinci@example.com', 'owner');
      const demoteNow = await as(second.accessToken).patch(
        `/members/${ownerId}`,
        { role: 'admin' },
      );
      expect(demoteNow.status).toBe(200);
    });

    it('iki owner aynı anda birbirini düşüremez: en az bir owner kalır', async () => {
      const ownerId = (
        await ctx.dataSource.query<{ id: string }[]>(
          `SELECT id FROM users WHERE email = 'owner@example.com'`,
        )
      )[0].id;
      const second = await registerInvited('ikinci@example.com', 'owner');

      const responses = await Promise.all([
        as(ownerToken).patch(`/members/${second.userId}`, { role: 'admin' }),
        as(second.accessToken).patch(`/members/${ownerId}`, { role: 'admin' }),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const owners = await ctx.dataSource.query<unknown[]>(
        `SELECT id FROM memberships WHERE org_id = $1 AND role = 'owner'`,
        [orgId],
      );
      expect(owners).toHaveLength(1);
    });
  });

  it('üye, rol ve silme işlemleri audit_logs’a yazılır', async () => {
    const analyst = await registerInvited('analist@example.com', 'analyst');
    await as(ownerToken)
      .patch(`/members/${analyst.userId}`, { role: 'admin' })
      .expect(200);
    await as(ownerToken).delete(`/members/${analyst.userId}`).expect(204);
    await as(ownerToken).delete('/organizations/current').expect(204);

    const logs = await ctx.dataSource.query<
      { action: string; org_id: string }[]
    >('SELECT action, org_id FROM audit_logs ORDER BY created_at, id');
    expect(logs.map((log) => log.action)).toEqual([
      'organization.created',
      'member.added',
      'invitation.created',
      'member.added',
      'member.role_changed',
      'member.removed',
      'organization.deleted',
    ]);
    expect(logs.every((log) => log.org_id === orgId)).toBe(true);

    const organizations = await ctx.dataSource.query<unknown[]>(
      'SELECT id FROM organizations',
    );
    expect(organizations).toHaveLength(0);
  });
});
