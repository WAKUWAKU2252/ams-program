// ═══ สถานะของกระดิ่ง - ป้ายตัวเลข + รายการในกล่อง ═══
//
// ★ แยก store จาก connection โดยตั้งใจ: connection ถือ "สายติดไหม" ซึ่งเป็นเรื่องของ
//   โครงสร้างพื้นฐาน ส่วนที่นี่ถือเนื้อข้อความ - รวมกันแล้วหน้าที่จะพันกันทันทีที่มีสายที่สอง
//
// ★★ ป้ายตัวเลขกับรายการโหลดคนละเส้นและคนละจังหวะโดยตั้งใจ
//
//   ป้าย    โหลดตอนเข้าแอป + ทุกครั้งที่สายส่งสัญญาณมา (ถี่) - ยิง /unread-count ซึ่งคืนเลขเดียว
//   รายการ  โหลดเฉพาะตอนกดเปิดกล่อง (นาน ๆ ครั้ง) - ยิง /notifications ที่คืนข้อความจริง
//
//   ถ้ารวมเป็นเส้นเดียว ทุกสัญญาณจะดึงข้อความ 15 ใบมาทิ้งโดยไม่มีใครเปิดดู
import { defineStore } from 'pinia'
import {
  fetchUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  type NotificationItem,
} from '@/shared/services/notification.service'
import { getTokenRole } from '@/shared/services/auth.token'

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    unread: 0,
    items: [] as NotificationItem[],
    loading: false,
    /** ข้อความ error ของการโหลดรายการ - ป้ายตัวเลขล้มเงียบได้ แต่กล่องที่เปิดค้างต้องบอก */
    loadError: '',
  }),
  getters: {
    /**
     * role นี้มีกระดิ่งไหม - ผู้ตรวจภายนอก (AUDIT) ไม่มี
     *
     * ★ ทั้ง /notifications และ /notifications/unread-count ไม่อยู่ใน AUDIT_ALLOWED ของ
     *   auditScopeGuard = role นี้ได้ 403 ทุกเส้นของกระดิ่ง ป้ายจึงค้างที่ 0 ตลอดกาล
     *   และกดเปิดกล่องทีไรก็เจอแต่ข้อความ error ที่ตัวเองแก้อะไรไม่ได้
     *
     * ★ ตัวจริงที่กันคือ backend ตัวนี้เป็นเรื่องหน้าจอล้วน ๆ - ซ่อนของที่ใช้ไม่ได้ทิ้ง
     *   และหยุดยิงคำขอที่รู้อยู่แล้วว่าจะโดนปฏิเสธ
     *
     * ★ อยู่ที่ store ไม่ใช่ที่ NotificationBell เพราะคนยิง refreshUnread มีสามทาง
     *   (mount ของกระดิ่ง / สัญญาณ SSE / กลับมาเปิดแท็บ) - ดักที่ปลายทางเดียวครอบหมด
     *   ถ้าดักแค่ในคอมโพเนนต์ การกลับมาโฟกัสแท็บจะยิง 403 ทุกครั้งทั้งที่ไม่มีกระดิ่งให้ดู
     */
    enabled: (): boolean => getTokenRole() !== 'AUDIT',
  },
  actions: {
    /**
     * โหลดเฉพาะตัวเลข - เรียกได้ถี่
     *
     * ★ ล้มแล้วเงียบ ไม่ขึ้น error ให้ผู้ใช้เห็น: ป้ายที่ค้างเลขเก่าไว้ไม่ได้ทำให้ใครเสียหาย
     *   ส่วน toast แดงเด้งทุกครั้งที่เน็ตสะดุดคือสิ่งที่ทำให้คนเลิกใช้แอป
     */
    async refreshUnread() {
      if (!this.enabled) return
      try {
        this.unread = (await fetchUnreadCount()).unread
      } catch {
        /* เงียบโดยตั้งใจ */
      }
    },

    /** โหลดรายการ - เรียกตอนกดเปิดกล่องเท่านั้น */
    async loadList() {
      if (!this.enabled) return
      this.loading = true
      this.loadError = ''
      try {
        const res = await listNotifications({ page: 1, limit: 15 })
        this.items = res.items
        // ★ เอาเลขจากก้อนเดียวกับรายการ ไม่ยิง /unread-count ซ้ำ - ไม่งั้นป้ายกับรายการ
        //   จะมาจากคนละวินาทีแล้วเห็น "3" ทั้งที่ในกล่องมีที่ยังไม่อ่าน 2 ใบ
        this.unread = res.unread
      } catch (e) {
        this.loadError = e instanceof Error ? e.message : 'โหลดการแจ้งเตือนไม่สำเร็จ'
      } finally {
        this.loading = false
      }
    },

    /**
     * มาร์คที่เห็นอยู่ว่าอ่านแล้ว - ยิงครั้งเดียวต่อการเปิดกล่องหนึ่งครั้ง
     *
     * ★ อัปเดตในเครื่องก่อนแล้วค่อยยิง (optimistic): การมาร์คอ่านเป็นการกระทำที่ผิดแล้ว
     *   ไม่เสียหาย และคนกดเปิดกล่องคาดหวังให้ป้ายหายทันที ไม่ใช่รอ round-trip
     * ★ ไม่ rollback เมื่อล้ม - รอบหน้าที่เปิดกล่อง ของจริงจาก server จะทับให้เอง
     */
    async markSeen() {
      const ids = this.items.filter((i) => i.readAt === null).map((i) => i.id)
      if (ids.length === 0) return

      const now = new Date().toISOString()
      for (const item of this.items) if (item.readAt === null) item.readAt = now
      this.unread = Math.max(0, this.unread - ids.length)

      try {
        await markNotificationsRead(ids)
      } catch {
        /* เงียบ - ดูเหตุผลข้างบน */
      }
    },

    async markAll() {
      const now = new Date().toISOString()
      for (const item of this.items) if (item.readAt === null) item.readAt = now
      this.unread = 0
      try {
        await markAllNotificationsRead()
      } catch {
        await this.refreshUnread()
      }
    },

    /** ออกจากระบบแล้วต้องล้าง - ไม่งั้นคนถัดไปที่ล็อกอินบนแท็บเดิมเห็นของคนก่อน */
    reset() {
      this.unread = 0
      this.items = []
      this.loadError = ''
    },
  },
})
