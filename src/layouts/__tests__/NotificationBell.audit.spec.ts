// กระดิ่งแจ้งเตือน - role ไหนเห็นบ้าง
//
// อาการที่เทสต์นี้กันไว้: ผู้ตรวจภายนอก (AUDIT) เห็นกระดิ่งที่ป้ายค้าง 0 ตลอดกาล และกด
// เปิดทีไรก็เจอแต่ข้อความ error - เพราะทั้ง /notifications และ /notifications/unread-count
// ไม่อยู่ใน AUDIT_ALLOWED ของ auditScopeGuard (ฝั่ง backend มี audit-role-scope.test.ts เฝ้าอยู่)
//
// ★ วัดสองอย่าง ไม่ใช่อย่างเดียว: "ไม่เห็นปุ่ม" กับ "ไม่ยิงคำขอ" - ซ่อนปุ่มอย่างเดียว
//   ยังเหลือ refreshUnread ที่ยิง 403 ทุกครั้งที่กลับมาโฟกัสแท็บ (connection store เรียก
//   ตอน onResume) ซึ่งมองไม่เห็นจากหน้าจอเลย
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NotificationBell from '../components/NotificationBell.vue'
import { useNotificationStore } from '@/shared/stores/notification'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: '/audit', fullPath: '/audit' }),
}))

const getTokenRole = vi.fn<() => string | null>()

vi.mock('@/shared/services/auth.token', () => ({
  getTokenRole: () => getTokenRole(),
  getToken: () => 'test-token',
  isTokenValid: () => true,
}))

const fetchUnreadCount = vi.fn(() => Promise.resolve({ unread: 3 }))
const listNotifications = vi.fn(() => Promise.resolve({ items: [], unread: 0 }))

vi.mock('@/shared/services/notification.service', () => ({
  fetchUnreadCount: () => fetchUnreadCount(),
  listNotifications: () => listNotifications(),
  markAllNotificationsRead: vi.fn(),
  markNotificationsRead: vi.fn(),
}))

let wrapper: VueWrapper | null = null

beforeEach(() => {
  setActivePinia(createPinia())
  getTokenRole.mockReset()
  fetchUnreadCount.mockClear()
  listNotifications.mockClear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function mountAs(role: string | null) {
  getTokenRole.mockReturnValue(role)
  wrapper = mount(NotificationBell, { global: { stubs: { Icon: true } } })
  return wrapper
}

describe('กระดิ่งแจ้งเตือนบน Topbar', () => {
  it('AUDIT ไม่เห็นกระดิ่งเลย - ไม่ใช่กระดิ่งที่กดแล้ว error', () => {
    const w = mountAs('AUDIT')
    expect(w.find('button').exists()).toBe(false)
  })

  it('AUDIT ไม่ยิง /unread-count ตอน mount', () => {
    mountAs('AUDIT')
    expect(fetchUnreadCount).not.toHaveBeenCalled()
  })

  it('AUDIT ยิงไม่ออกแม้มีใครเรียก action ตรง ๆ (เคส onResume ของสาย SSE)', async () => {
    mountAs('AUDIT')
    await useNotificationStore().refreshUnread()
    await useNotificationStore().loadList()
    expect(fetchUnreadCount).not.toHaveBeenCalled()
    expect(listNotifications).not.toHaveBeenCalled()
  })

  it.each(['FINANCE', 'ADMIN', 'MANAGER', 'EMPLOYEE'])('%s เห็นกระดิ่งตามปกติ', (role) => {
    const w = mountAs(role)
    expect(w.find('button').exists()).toBe(true)
    expect(fetchUnreadCount).toHaveBeenCalled()
  })
})
