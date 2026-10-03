import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { asUser, at, deps, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import {
  archiveContact,
  createContact,
  getClient,
  listClients,
  setPrimaryContact,
  updateClientDetails,
} from '~/server/services/clients'
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
