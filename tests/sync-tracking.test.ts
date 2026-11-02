// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { db, updateSettings, wipeLocalData } from '../src/lib/db'
import { deleteAllData, deleteFood, newFood, saveEntry, saveFood, toggleFoodFavourite } from '../src/lib/repo'
import { addStarterFoods } from '../src/lib/starter'
import { changeTimestamp, observeTimestamp, skipTracking } from '../src/lib/sync/tracking'
import { uid } from '../src/lib/utils'

const outbox = async () =>
  (await db.outbox.toArray()).map((o) => `${o.op} ${o.collection}/${o.recordId}`).sort()

beforeEach(async () => {
  await wipeLocalData()
})

describe('change tracking', () => {
  it('records puts and deletes from the repo', async () => {
    const food = newFood({ name: 'Labneh' })
    await saveFood(food)
    expect(await outbox()).toEqual([`put foods/${food.id}`])

    await deleteFood(food.id)
    expect(await outbox()).toEqual([`delete foods/${food.id}`])
  })

  it('catches writes outside the repo (update, settings, starter foods)', async () => {
    const food = newFood({ name: 'Hummus' })
    await saveFood(food)
    await db.outbox.clear()

    await toggleFoodFavourite(food.id)
    await updateSettings({ timeZone: 'Asia/Beirut' })
    expect(await outbox()).toEqual([`put foods/${food.id}`, 'put settings/app'])

    await db.outbox.clear()
    const n = await addStarterFoods()
    expect(await db.outbox.count()).toBe(n)
  })

  it('tracks every record touched by one entry save (entry, photo, usage counters)', async () => {
    const food = newFood({ name: 'Halloumi' })
    await saveFood(food)
    await db.outbox.clear()
    const photo = { id: uid(), blob: new Blob(['f']), thumb: new Blob(['t']), width: 2, height: 2, createdAt: 1 }
    const entryId = uid()
    await saveEntry(
      {
        id: entryId,
        date: '2026-11-02',
        time: '08:00',
        category: 'breakfast',
        name: 'Halloumi',
        photoIds: [photo.id],
        items: [{ id: uid(), name: 'Halloumi', ingredients: [], conversions: [], sourceFoodId: food.id }],
        source: { kind: 'food', refId: food.id },
        createdAt: 1,
        updatedAt: 1,
      },
      [photo],
    )
    expect(await outbox()).toEqual([`put entries/${entryId}`, `put foods/${food.id}`, `put photos/${photo.id}`].sort())
  })

  it('turns a clear() into tombstones for every record', async () => {
    const a = newFood({ name: 'A' })
    const b = newFood({ name: 'B' })
    await saveFood(a)
    await saveFood(b)
    await updateSettings({ patientName: 'Sam' })
    await deleteAllData()
    expect(await outbox()).toEqual([`delete foods/${a.id}`, `delete foods/${b.id}`, 'delete settings/app'].sort())
  })

  it('coalesces repeated changes of one record into its latest', async () => {
    const food = newFood({ name: 'v1' })
    await saveFood(food)
    const first = (await db.outbox.toArray())[0]!.queuedAt
    await saveFood({ ...food, name: 'v2' })
    const rows = await db.outbox.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.queuedAt).toBeGreaterThan(first)
  })

  it('does not track writes applied from the server', async () => {
    await db.transaction('rw', db.foods, async (tx) => {
      skipTracking(tx)
      await db.foods.put(newFood({ name: 'From laptop' }))
    })
    expect(await db.foods.count()).toBe(1)
    expect(await db.outbox.count()).toBe(0)
  })

  it('never stamps a change older than one already seen from another device', () => {
    const future = Date.now() + 60_000
    observeTimestamp(future)
    expect(changeTimestamp()).toBeGreaterThan(future)
  })
})
