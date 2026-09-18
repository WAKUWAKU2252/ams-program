// ปุ่มแก้ไขรายชิ้น - ใบที่ "บัญชีตีกลับรายชิ้น" ต้องเปิดเฉพาะชิ้นที่ถูกตีกลับ
//
// อาการที่ผู้ทดสอบรายงาน: ใบอนุมัติแล้วและบัญชีตีกลับมาชิ้นเดียว แต่ปุ่มแก้ไขเปิดให้กด
// ได้ทุกชิ้นที่ยังไม่ registered พอกดบันทึกถึงได้ 400 กลับมาว่า "แก้ได้เฉพาะชิ้นที่บัญชี
// ตีกลับ" - ด่านที่ backend ถูกแล้ว แต่หน้าจอไม่ควรปล่อยให้เปิดกล่องตั้งแต่แรก
//
// ★ ทดสอบที่ตาราง ไม่ใช่ที่หน้า - ตรรกะอยู่ที่ canEditSlot ซึ่งรับ editableScope มาจาก
//   DraftFormPage การทดสอบที่หน้าจะวัด "หน้าส่ง prop ถูกไหม" ซึ่งเป็นคนละคำถาม
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RequestTable from '../RequestTable.vue'
import type { AssetSlot, AssetSlotItem } from '@/shared/services/asset.service'

const getAssetSlots = vi.fn()

vi.mock('@/shared/services/asset.service', () => ({
  getAssetSlots: (...args: unknown[]) => getAssetSlots(...args),
}))
vi.mock('@/shared/services/assetRequest.service', () => ({
  declareLine: vi.fn(),
  removeDeclaredLine: vi.fn(),
}))
vi.mock('@/shared/services/master.service', () => ({
  listDepartments: vi.fn(() => Promise.resolve([])),
  listLocations: vi.fn(() => Promise.resolve([])),
  listSubLocations: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/shared/services/attachment.service', () => ({
  fileBlobUrl: vi.fn(() => Promise.resolve('')),
}))

const REQUEST_ID = 7

/** ชิ้นที่กรอกแล้ว - displayStatus คือสิ่งที่ตัดสินว่าปุ่มเปิดหรือไม่ */
function registeredSlot(
  index: number,
  displayStatus: AssetSlot['displayStatus'],
  rejectedOnPiece = false,
): AssetSlot {
  return {
    index,
    status: 'registered',
    displayStatus,
    assetId: 100 + index,
    requestId: REQUEST_ID,
    requestCreatedByName: null,
    unitNo: index,
    grpoLineId: 'grpo-1',
    grpoNo: 'GRPO-001',
    description: `ของชิ้นที่ ${index}`,
    serialNumber: null,
    acquisitionCost: 1000,
    assetNumber: null,
    lifecycle: 'DRAFT',
    rejectReason: null,
    rejectedByName: null,
    rejectedRole: null,
    rejectedOnPiece,
    rejectFixed: false,
    cancelReason: null,
    cancelledByName: null,
  } as unknown as AssetSlot
}

/** ช่องที่ยังไม่ได้กรอก - ไม่มีแถว asset จึงไม่มี requestId/assetId ติดมา */
function pendingSlot(index: number): AssetSlot {
  return {
    index,
    status: 'pending',
    displayStatus: 'pendingCreation',
    unitNo: index,
    grpoLineId: 'grpo-1',
    grpoNo: 'GRPO-001',
  } as unknown as AssetSlot
}

/**
 * ใบเดียว บรรทัด PO เดียว สามชิ้น: ตีกลับ 1 / รออกเลข 1 / ออกเลขแล้ว 1
 * ตรงกับสภาพจริงตอนบัญชีตีกลับมาชิ้นเดียว
 */
function slotsResponse(): { items: AssetSlotItem[] } {
  const items = [
    {
      poItemId: 'po-item-1',
      poLine: 1,
      itemDescription: 'กล้องวงจรปิด',
      quantity: 3,
      unitPrice: 1000,
      lineTotal: 3000,
      receivedQty: 3,
      declaredQty: null,
      declareReason: null,
      grpoLines: [
        {
          // ★ คีย์ต้องชื่อ id ไม่ใช่ grpoLineId - grouped() จับคู่ชิ้นด้วย s.grpoLineId === l.id
          //   ตั้งชื่อผิดแล้วรอบจะไม่มีชิ้นสักตัว แถวปุ่มจึงไม่ถูกเรนเดอร์เลย
          id: 'grpo-1',
          grpoId: 'g-1',
          grpoNo: 'GRPO-001',
          grpoDate: '2026-01-01',
          receivedQty: 3,
          declaredQty: null,
          declaredReason: null,
          invoices: [],
        },
      ],
      slots: [
        registeredSlot(1, 'rejected', true),
        registeredSlot(2, 'approved'),
        registeredSlot(3, 'registered'),
      ],
    },
  ]
  return { items } as unknown as { items: AssetSlotItem[] }
}

let wrapper: ReturnType<typeof mount> | null = null

/**
 * ปุ่มดินสอของแต่ละชิ้น เรียงตามลำดับแถว
 *
 * ★ กรองด้วย title ไม่ใช่ .btn-square เฉย ๆ - ในตารางมีปุ่ม btn-square ตัวอื่นปนอยู่ด้วย
 *   ("แจ้งจำนวนชิ้นของรอบนี้" ที่หัวรอบ) ถ้าเลือกด้วยคลาสอย่างเดียวจะได้ปุ่มนั้นเป็นตัวแรก
 *   แล้วเทสต์จะฟ้องผิดจุดสนิท (เสียเวลาไล่มาแล้วรอบหนึ่ง)
 */
const EDIT_TITLES = [
  'แก้ไขรายละเอียดสินทรัพย์',
  'กรอกรายละเอียดสินทรัพย์',
  'ถูกตีกลับ - แก้ไขแล้วจะกลับเข้าคิวให้เอง',
  'คำขอนี้อนุมัติแล้ว - แก้ได้เฉพาะชิ้นที่บัญชีตีกลับ',
  'ลงทะเบียนใน SAP แล้ว แก้ไขที่นี่ไม่ได้',
  'ชิ้นนี้ถูกปิดถาวร - ให้บัญชีปลดการปิดก่อนจึงจะแก้ได้',
]

function editButtons() {
  return wrapper!
    .findAll('button.btn-square')
    .filter((b) => EDIT_TITLES.includes(b.attributes('title') ?? ''))
}

/**
 * @param extraStubs ทับ stub ตัวใดตัวหนึ่งได้ - เทสต์ที่ต้องดูข้างในกล่องยืนยันต้องใช้
 *   stub ที่เรนเดอร์ slot ให้ (stub: true ทิ้ง slot ทั้งก้อน เนื้อหาในกล่องจึงไม่มีใน DOM เลย)
 */
async function mountTable(
  editableScope: 'all' | 'rejected',
  extraStubs: Record<string, unknown> = {},
) {
  wrapper = mount(RequestTable, {
    props: { requestId: REQUEST_ID, editable: true, editableScope },
    global: {
      stubs: {
        Icon: true,
        InvoiceModal: true,
        AssetFormDialog: true,
        AppConfirmDialog: true,
        PoLineTableHead: true,
        RouterLink: true,
        ...extraStubs,
      },
    },
  })
  await nextTick()
  await nextTick()
  await nextTick()
  // แถวชิ้นซ่อนอยู่ใต้แถว PO line - ต้องกางก่อนถึงจะเรนเดอร์ปุ่ม
  const poRow = wrapper.find('tr.cursor-pointer')
  if (poRow.exists()) await poRow.trigger('click')
  await nextTick()
  return wrapper
}

beforeEach(() => {
  getAssetSlots.mockReset().mockResolvedValue(slotsResponse())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('ใบที่บัญชีตีกลับรายชิ้น (editableScope = rejected)', () => {
  it('★ เปิดปุ่มแก้ไขเฉพาะชิ้นที่ถูกตีกลับ ชิ้นอื่นต้องกดไม่ได้', async () => {
    await mountTable('rejected')

    const buttons = editButtons()
    expect(buttons.length).toBeGreaterThanOrEqual(3)

    // แถวที่ 1 = ตีกลับ → เปิด / แถวที่ 2 = รอออกเลข → ปิด / แถวที่ 3 = ออกเลขแล้ว → ปิด
    expect(buttons[0]!.attributes('disabled')).toBeUndefined()
    expect(buttons[1]!.attributes('disabled')).toBeDefined()
    expect(buttons[2]!.attributes('disabled')).toBeDefined()
  })
})

describe('ใบ DRAFT ปกติ (editableScope = all, ไม่มีชิ้นถูกตีกลับ)', () => {
  it('เปิดทุกชิ้นที่ยังไม่ registered - ของเดิมต้องไม่พัง', async () => {
    // fixture หลักมีชิ้นที่บัญชีตีกลับอยู่หนึ่งชิ้น - เคสนี้ต้องใช้ใบที่ยังไม่มีใครตีกลับ
    const res = slotsResponse()
    const slots = (res.items[0] as unknown as { slots: AssetSlot[] }).slots
    slots[0] = registeredSlot(1, 'saved')
    slots[1] = registeredSlot(2, 'saved')
    getAssetSlots.mockResolvedValue(res)

    await mountTable('all')

    const buttons = editButtons()
    expect(buttons[0]!.attributes('disabled')).toBeUndefined()
    expect(buttons[1]!.attributes('disabled')).toBeUndefined()
    // ออกเลขแล้ว = ปิดเสมอไม่ว่าใบจะอยู่สถานะไหน
    expect(buttons[2]!.attributes('disabled')).toBeDefined()
  })
})

/**
 * ★ เคสผสมที่เป็นบั๊ก: ใบเป็น REJECTED (บัญชีกดยืนยันทั้งที่ยังมีชิ้นที่ตีกลับไว้ - 0018)
 *   แต่มีแค่ชิ้นเดียวที่ถูกตีกลับ "รายชิ้น" จริง ๆ
 *
 *   สถานะใบ REJECTED ทำให้ DraftFormPage ส่ง editableScope = 'all' มา (statusEditable
 *   นับ REJECTED เป็นแก้ได้) ถ้าตัดสินจาก scope อย่างเดียวจะเปิดให้แก้ทุกชิ้น
 *
 *   ★ displayStatus ของทุกชิ้นเป็น 'rejected' เหมือนกันหมดในสถานะใบนี้ (ดู slotDisplayStatus)
 *     ตัวที่แยกได้คือ rejectedOnPiece เท่านั้น - fixture จึงต้องสะท้อนตรงนี้ให้ตรงของจริง
 */
function mixedRejectResponse(): { items: AssetSlotItem[] } {
  const res = slotsResponse()
  const slots = (res.items[0] as unknown as { slots: AssetSlot[] }).slots
  slots[0] = registeredSlot(1, 'rejected', true) // บัญชีตีกลับชิ้นนี้
  slots[1] = registeredSlot(2, 'rejected', false) // แค่พลอยเป็น rejected เพราะใบโดนทั้งใบ
  return res
}

describe('★ ใบ REJECTED ที่มีชิ้นถูกตีกลับรายชิ้นปนอยู่ (บั๊กที่รายงาน)', () => {
  it('เปิดเฉพาะชิ้นที่ถูกตีกลับรายชิ้น แม้ scope จะเป็น all', async () => {
    getAssetSlots.mockResolvedValue(mixedRejectResponse())
    await mountTable('all')

    const buttons = editButtons()
    expect(buttons[0]!.attributes('disabled')).toBeUndefined() // ชิ้นที่บัญชีตีกลับ
    expect(buttons[1]!.attributes('disabled')).toBeDefined() // ชิ้นอื่น - ไม่เกี่ยว
    expect(buttons[2]!.attributes('disabled')).toBeDefined() // ออกเลขแล้ว
  })
})

describe('หัวหน้าตีกลับทั้งใบ - flow เดิมต้องไม่พัง', () => {
  it('ทุกชิ้นแก้ได้ เพราะไม่มีชิ้นไหนถูกตีกลับรายชิ้น', async () => {
    // ★ เคสนี้คือเหตุผลที่ด่านต้องดู rejectedOnPiece ไม่ใช่ displayStatus:
    //   หัวหน้าตีกลับ = ให้กลับไปแก้ทั้งใบ ถ้าล็อกไว้ผู้ขอจะแก้อะไรไม่ได้เลยและส่งใหม่ไม่ได้ด้วย
    const res = slotsResponse()
    const slots = (res.items[0] as unknown as { slots: AssetSlot[] }).slots
    slots[0] = registeredSlot(1, 'rejected', false)
    slots[1] = registeredSlot(2, 'rejected', false)
    getAssetSlots.mockResolvedValue(res)

    await mountTable('all')

    const buttons = editButtons()
    expect(buttons[0]!.attributes('disabled')).toBeUndefined()
    expect(buttons[1]!.attributes('disabled')).toBeUndefined()
    expect(buttons[2]!.attributes('disabled')).toBeDefined()
  })
})

/**
 * ★ หัวหน้าตีกลับทั้งใบ — ผู้ขอต้อง "กลับไปแก้ทั้งใบ" ได้จริง
 *
 * ตีกลับทั้งใบไม่ได้ระบุรายชิ้น สิ่งที่ผู้ขอต้องทำจึงรวมการลงชิ้นที่ยังขาดด้วย
 * (เหตุผลตีกลับที่เจอบ่อยที่สุดคือ "กรอกไม่ครบ") ใบ REJECTED จึงใช้ scope 'all'
 *
 * เคยลองแยกเป็นโหมด 'existing' ที่ล็อกช่องว่างไว้ แล้วพบว่าปิดทางแก้ตามที่หัวหน้าสั่งทั้งหมด
 * — ถอดออกแล้ว เทสต์ชุดนี้เฝ้าไม่ให้ล็อกกลับมาโดยไม่ตั้งใจ
 */
describe('★ หัวหน้าตีกลับทั้งใบ (scope = all)', () => {
  it('ช่องที่ยังไม่ได้กรอกต้องกดลงชิ้นใหม่ได้', async () => {
    const res = slotsResponse()
    const slots = (res.items[0] as unknown as { slots: AssetSlot[] }).slots
    slots[0] = registeredSlot(1, 'rejected') // ลงไว้แล้ว
    slots[1] = pendingSlot(2) // ยังไม่ได้กรอก — ต้องลงได้
    getAssetSlots.mockResolvedValue(res)

    await mountTable('all')

    const buttons = editButtons()
    expect(buttons[0]!.attributes('disabled')).toBeUndefined()
    expect(buttons[1]!.attributes('disabled')).toBeUndefined()
    // ออกเลขแล้ว = ปิดเสมอไม่ว่าใบจะอยู่สถานะไหน
    expect(buttons[2]!.attributes('disabled')).toBeDefined()
  })

  it('ปุ่ม "แจ้งจำนวน" ต้องกดได้ — หัวหน้าอาจตีกลับเพราะจำนวนไม่ถูก', async () => {
    await mountTable('all')

    const declareBtn = wrapper!
      .findAll('button.btn-square')
      .find((b) => (b.attributes('title') ?? '').includes('จำนวนชิ้นของรอบนี้'))
    expect(declareBtn?.attributes('disabled')).toBeUndefined()
  })
})

/**
 * ★ invoice กับ "แจ้งจำนวน" เป็นคนละสิทธิ์ - เคยรวมเป็น canEditRound ตัวเดียว
 *
 * เคสที่ตัน: บัญชีตีกลับชิ้นด้วยเหตุผล "ขอ invoice ด้วย" → ใบเป็น APPROVED → scope
 * 'rejected' → ปุ่ม invoice จางกดไม่ได้เลย → ผู้ขอทำตามที่บัญชีสั่งไม่ได้
 * (ฝั่ง backend PATCH /grpo/:id/invoice ไม่เคยมีด่านสถานะใบ - จอเข้มกว่า API ฝ่ายเดียว)
 */
function roundButton(label: string) {
  return wrapper!.findAll('button').find((b) => b.text().includes(label))
}

describe('สิทธิ์ระดับรอบ: invoice แยกจากการแจ้งจำนวน', () => {
  it('★ ใบที่บัญชีตีกลับ - ปุ่ม invoice ต้องกดได้ (ไปแนบตามที่บัญชีสั่ง)', async () => {
    await mountTable('rejected')

    const invoiceBtn = roundButton('invoice')
    expect(invoiceBtn?.attributes('disabled')).toBeUndefined()
  })

  it('ใบ DRAFT/ตีกลับทั้งใบ - ปุ่ม invoice กดได้ตามปกติ', async () => {
    await mountTable('all')

    expect(roundButton('invoice')?.attributes('disabled')).toBeUndefined()
  })

  it('ปุ่ม "แจ้งจำนวน" ยังล็อกตามเดิม - จำนวนชิ้นกระทบชิ้นที่อนุมัติไปแล้ว', async () => {
    await mountTable('rejected')

    const declareBtn = wrapper!
      .findAll('button.btn-square')
      .find((b) => (b.attributes('title') ?? '').includes('จำนวนชิ้นของรอบนี้'))
    expect(declareBtn?.attributes('disabled')).toBeDefined()
  })

  it('ใบ DRAFT ปกติ - ทั้งสองปุ่มกดได้', async () => {
    await mountTable('all')

    expect(roundButton('invoice')?.attributes('disabled')).toBeUndefined()
    const declareBtn = wrapper!
      .findAll('button.btn-square')
      .find((b) => (b.attributes('title') ?? '').includes('จำนวนชิ้นของรอบนี้'))
    expect(declareBtn?.attributes('disabled')).toBeUndefined()
  })
})

// ═══ รอบที่ SAP รับมาเป็นเศษ ต้องปัดขึ้นให้เป็นจำนวนชิ้นเสมอ ═══
//
// บั๊กที่เฝ้า (เจอจริง 2026-09-09): grouped() เอา receivedQty ดิบมาเป็น qty แล้ว openDeclare
// ยัดค่านั้นลงช่องกรอกตรง ๆ — backend รับเฉพาะ t.Integer จึงได้ 422 ตั้งแต่กดบันทึกครั้งแรก
// ทั้งที่ผู้ใช้ไม่ได้แตะอะไรเลย = แจ้งจำนวนในรอบพวกนั้นไม่ได้เลยสักรอบ
// วัดจากของจริง: grpo_line 45 จาก 960 แถวเป็นเศษ (0.4 · 0.5151 · 1.8 ฯลฯ)
//
// ★ ต้อง "ปัดขึ้น" ให้ตรงกับ backend ซึ่งปัดขึ้นทั้ง slotCount และ remain — ปัดลงไม่ได้
//   เพราะเศษส่วนใหญ่น้อยกว่า 1 (อาคารที่ตัดรับเป็น 0.4 + 0.6) ปัดลงแล้วจะไม่มีช่องให้กรอกเลย
describe('รอบที่ receivedQty เป็นทศนิยม', () => {
  /** PO บรรทัดเดียว รอบเดียว รับมา 0.4 ยังไม่มีใครกรอกอะไร */
  function fractionalResponse() {
    const res = slotsResponse()
    const item = res.items[0] as unknown as {
      grpoLines: { receivedQty: number }[]
      slots: AssetSlot[]
      quantity: number
      receivedQty: number
    }
    item.grpoLines[0]!.receivedQty = 0.4
    item.receivedQty = 0.4
    item.quantity = 1
    item.slots = [pendingSlot(1)]
    return res
  }

  it('★ หัวรอบต้องโชว์จำนวนเต็ม ไม่ใช่ค่าดิบ 0.4', async () => {
    getAssetSlots.mockResolvedValue(fractionalResponse())
    await mountTable('all')

    const text = wrapper!.text()
    expect(text).not.toContain('0.4 ชิ้น')
    expect(text).toContain('/ 1 ชิ้น')
  })

  it('★ ช่องกรอกในกล่องแจ้งจำนวนต้องเริ่มที่จำนวนเต็ม (ไม่งั้นกดบันทึกได้ 422)', async () => {
    getAssetSlots.mockResolvedValue(fractionalResponse())
    // ต้องให้กล่องยืนยันเรนเดอร์ slot จริง ไม่งั้นช่องกรอกไม่มีใน DOM ให้ตรวจ
    await mountTable('all', { AppConfirmDialog: { template: '<div><slot /></div>' } })

    const declareBtn = wrapper!
      .findAll('button.btn-square')
      .find((b) => (b.attributes('title') ?? '').includes('จำนวนชิ้นของรอบนี้'))
    await declareBtn!.trigger('click')
    await nextTick()

    const qtyInput = wrapper!.find('input[type="number"]')
    expect(qtyInput.exists()).toBe(true)
    // ค่าที่ seed ไว้ต้องเป็นจำนวนเต็มเสมอ — Number.isInteger กันทั้ง 0.4 และ '0.4'
    expect(Number.isInteger(Number((qtyInput.element as HTMLInputElement).value))).toBe(true)
    expect((qtyInput.element as HTMLInputElement).value).toBe('1')
  })
})
