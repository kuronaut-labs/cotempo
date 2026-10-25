import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { asUser, at, db, deps, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import {
  archiveContact,
  clientFigures,
  createContact,
  getClient,
  listClients,
  setPrimaryContact,
  updateClientDetails,
} from '~/server/services/clients'
import { archiveProject } from '~/server/services/structure'
import { createInterval } from '~/server/services/intervals'
import * as schema from '../../drizzle/schema'

beforeEach(resetDb)

describe('listClients', () => {
  it('defaults: both seeded clients, sorted by name, nextCursor null', async () => {
    const page = await listClients(deps(), asUser('billing'), { sort: 'name', status: 'active', limit: 50 })
    expect(page.rows.map((r) => r.name)).toEqual(['Acme Aerospace', 'Nimbus Freight'])
    expect(page.nextCursor).toBeNull()
  })

  it('q matches case-insensitively and escapes LIKE wildcards', async () => {
    const acme = await listClients(deps(), asUser('billing'), { status: 'active', sort: 'name', q: 'acme', limit: 50 })
    expect(acme.rows.map((r) => r.id)).toEqual([ids.c1])
    const nim = await listClients(deps(), asUser('billing'), { status: 'active', sort: 'name', q: 'nim', limit: 50 })
    expect(nim.rows.map((r) => r.id)).toEqual([ids.c2])
    const pct = await listClients(deps(), asUser('billing'), { status: 'active', sort: 'name', q: '%', limit: 50 })
    expect(pct.rows).toEqual([])
  })

  it('status filter: archived only after archiving', async () => {
    deps().now = () => at(20, 12)
    await deps().db.update(schema.clients).set({ archivedAt: new Date(at(20, 12)) }).where(eq(schema.clients.id, ids.c2))
    const archived = await listClients(deps(), asUser('billing'), { status: 'archived', sort: 'name', limit: 50 })
    expect(archived.rows.map((r) => r.id)).toEqual([ids.c2])
    const all = await listClients(deps(), asUser('billing'), { status: 'all', sort: 'name', limit: 50 })
    expect(all.rows).toHaveLength(2)
  })

  it('effortMin and lastActivityMs come from seeded intervals', async () => {
    const c1 = (await listClients(deps(), asUser('billing'), { sort: 'name', status: 'active', limit: 50 })).rows.find((r) => r.id === ids.c1)!
    // opWorker j1 180 + j2 60 + 240 + 240, agent1 j1 480 → 1200
    expect(c1.effortMin).toBe(1200)
    expect(c1.lastActivityMs).toBe(at(2, 14).getTime())
    expect(c1.projectCount).toBe(1)
    expect(c1.liveProjectCount).toBe(1)
  })

  it('operator effort is scoped and has no billableCents key', async () => {
    const ctx = asUser('operator')
    await createInterval(deps(), asUser('admin'), {
      workerId: ids.billingWorker,
      jobId: ids.j1,
      startedAt: new Date(at(4, 8)).toISOString(),
      endedAt: new Date(at(4, 9)).toISOString(),
    })
    const page = await listClients(deps(), ctx, { sort: 'name', status: 'active', limit: 50 })
    const c1 = page.rows.find((r) => r.id === ids.c1)!
    expect(c1.effortMin).toBe(1200) // billingWorker's 60 min excluded
    expect('billableCents' in c1).toBe(false)
  })

  it('billing sees billableCents rounded once from minuteCents', async () => {
    const c1 = (await listClients(deps(), asUser('billing'), { sort: 'name', status: 'active', limit: 50 })).rows.find((r) => r.id === ids.c1)!
    // j1 14000/h: iv01 180 + iv03 480 + iv07 240 = 900 min → 900*14000/60 = 210000; j2 9000/h: 300 min → 45000
    expect(c1.billableCents).toBe(210000 + 45000)
  })

  it('keyset paging and cursor validation', async () => {
    const first = await listClients(deps(), asUser('billing'), { sort: 'name', status: 'active', limit: 1 })
    expect(first.rows).toHaveLength(1)
    expect(first.nextCursor).not.toBeNull()
    const second = await listClients(deps(), asUser('billing'), { sort: 'name', status: 'active', limit: 1, cursor: first.nextCursor! })
    expect(second.rows).toHaveLength(1)
    expect(second.rows[0]!.id).not.toBe(first.rows[0]!.id)
    await expect(listClients(deps(), asUser('billing'), { sort: 'name', status: 'active', limit: 50, cursor: 'garbage' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_CURSOR',
    })
  })
})

describe('client contacts (Task 2.1)', () => {
  it('admin sets address; primary switch is exclusive; contacts primary-first', async () => {
    await updateClientDetails(deps(), asUser('admin'), {
      id: ids.c1,
      addressLine1: '12 Wray Ave',
      city: 'Perth',
      postcode: '6000',
      country: 'Australia',
    })
    // seeded: demo-0000-contact-1 Jane Okafor (primary), demo-0000-contact-2 Sam Reyes
    await setPrimaryContact(deps(), asUser('admin'), { id: 'demo-0000-contact-2', clientId: ids.c1 })
    const detail = await getClient(deps(), asUser('operator'), { id: ids.c1 })
    expect(detail.addressLine1).toBe('12 Wray Ave')
    // Sam (now primary) sorts first despite name order
    expect(detail.contacts.map((c) => c.name)).toEqual(['Sam Reyes', 'Jane Okafor'])
    expect(detail.contacts.filter((c) => c.isPrimary)).toHaveLength(1)
    expect(detail.contacts.find((c) => c.name === 'Sam Reyes')!.isPrimary).toBe(true)
  })

  it('setPrimaryContact refuses a contact from another client and leaves the primary alone', async () => {
    // demo-0000-contact-3 belongs to c2
    await expect(setPrimaryContact(deps(), asUser('admin'), { id: 'demo-0000-contact-3', clientId: ids.c1 })).rejects.toMatchObject({
      status: 404,
      code: 'CONTACT_NOT_FOUND',
    })
    const detail = await getClient(deps(), asUser('admin'), { id: ids.c1 })
    expect(detail.contacts.filter((c) => c.isPrimary).map((c) => c.name)).toEqual(['Jane Okafor'])
  })

  it('archive hides a contact', async () => {
    await archiveContact(deps(), asUser('admin'), { id: 'demo-0000-contact-2' })
    const detail = await getClient(deps(), asUser('admin'), { id: ids.c1 })
    expect(detail.contacts.map((c) => c.name)).toEqual(['Jane Okafor'])
  })

  it('operator can read contacts but gets 403 on write', async () => {
    await expect(getClient(deps(), asUser('operator'), { id: ids.c1 })).resolves.toMatchObject({ id: ids.c1 })
    await expect(
      createContact(deps(), asUser('operator'), { clientId: ids.c1, name: 'N' }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('q finds a client by contact name and by contact email domain (LD8)', async () => {
    await createContact(deps(), asUser('admin'), { clientId: ids.c2, name: 'Mara Voss', email: 'mara@nimbus.example' })
    const byName = await listClients(deps(), asUser('billing'), { q: 'mara', sort: 'name', status: 'active', limit: 50 })
    expect(byName.rows.map((r) => r.id)).toEqual([ids.c2])
    const byDomain = await listClients(deps(), asUser('billing'), { q: 'acme.example', sort: 'name', status: 'active', limit: 50 })
    expect(byDomain.rows.map((r) => r.id)).toEqual([ids.c1])
  })
})

describe('client figures (Task 2.3)', () => {
  it('all-time trio and project breakdown', async () => {
    const f = await clientFigures(deps(), asUser('billing'), { id: ids.c1 })
    expect(f.allTime.effortMin).toBe(1200)
    expect(f.allTime.wallClockMin).toBe(1140)
    expect(f.allTime.premiumMin).toBe(60)
    expect(f.byProject.map((p) => p.id)).toEqual([ids.p1])
    expect(f.byProject[0]!.period.effortMin).toBe(1200)
    expect(f.byWorker.length).toBe(2)
    expect(f.byWorker.map((w) => w.workerId)).toEqual(
      expect.arrayContaining([ids.opWorker, ids.agent1]),
    )
    expect(f.weeks.length).toBeGreaterThan(0)
    expect(f.recent.length).toBeLessThanOrEqual(20)
  })

  it('period filter narrows the period recon', async () => {
    const f = await clientFigures(deps(), asUser('billing'), { id: ids.c1, from: '2026-08-31', to: '2026-09-06' })
    const weeksTotal = f.weeks.reduce((n, w) => n + w.recon.effortMin, 0)
    expect(weeksTotal).toBe(1200)
    expect(f.period.effortMin).toBe(1200)
  })

  it('operator gets no cents key and stays scoped', async () => {
    const f = await clientFigures(deps(), asUser('operator'), { id: ids.c1 })
    expect(JSON.stringify(f).includes('cents')).toBe(false)
    const money = await clientFigures(deps(), asUser('billing'), { id: ids.c1 })
    expect('cents' in money.allTime && money.allTime.cents).toBeGreaterThan(0)
  })

  it('archived project still appears in byProject', async () => {
    await archiveProject(deps(), asUser('admin'), { id: ids.p1 })
    const f = await clientFigures(deps(), asUser('billing'), { id: ids.c1 })
    expect(f.byProject.map((p) => p.id)).toContain(ids.p1)
    expect(f.byProject[0]!.archivedAt).not.toBeNull()
  })
})

describe('detail pages past the first 200 rows', () => {
  it('getClient finds a client that sorts after 200 others, with all its projects', async () => {
    const now = new Date()
    const name = (i: number) => `AAA ${String(i).padStart(3, '0')}` // sorts ahead of the demo rows
    // chunks of 20 stay under D1's 100 bound parameters
    for (let i = 0; i < 205; i += 20) {
      const n = Array.from({ length: Math.min(20, 205 - i) }, (_, k) => i + k)
      await db.insert(schema.clients).values(n.map((k) => ({ id: `bulk-c-${k}`, name: name(k), createdAt: now })))
      await db.insert(schema.projects).values(n.map((k) => ({ id: `bulk-p-${k}`, clientId: ids.c1, name: name(k), createdAt: now })))
    }
    const detail = await getClient(deps(), asUser('admin'), { id: ids.c1 })
    expect(detail.name).toBe('Acme Aerospace')
    expect(detail.effortMin).toBeGreaterThan(0)
    expect(detail.projects).toHaveLength(206)
  })
})
