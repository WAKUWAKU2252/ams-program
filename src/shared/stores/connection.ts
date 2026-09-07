import { defineStore } from 'pinia';
import { openAppChanges, type SseStatus, type StreamConnection } from '@/shared/services/sse.service';

/**
 * สาย SSE เดียวของทั้งแอป - เปิดตั้งแต่ล็อกอินจนออกจากระบบ (App.vue คุมจังหวะ)
 *
 * ★ เดิมเป็นสองสาย: /events (EventSource ไม่มี auth ส่งแค่ ping ให้ banner ออนไลน์) กับ
 *   /asset-requests/changes ที่หน้า Draft เปิดเอง - ยุบเป็นสายเดียวเพราะโควตา connection
 *   ของ browser มีจำกัด (~6 ต่อ origin บน HTTP/1.1 และสาย SSE กินแบบไม่คืน) และ /events
 *   ไม่มี auth จึงส่งของจริงไม่ได้อยู่แล้ว ตอนนี้เหลือ 2 สายต่อแท็บ: ตัวนี้ + presence
 *   ของหน้าที่เปิดอยู่ ดูรายละเอียดที่ services/sse.service.ts
 *
 * ★ changeTick เป็นตัวนับ ไม่ใช่ boolean - หน้าที่สนใจใช้ watch() ได้ตรง ๆ โดยไม่ต้อง
 *   ลงทะเบียน callback เอง และ "ก้อนที่สองที่เหมือนก้อนแรก" ก็ยังปลุก watcher (boolean
 *   ที่เป็น true อยู่แล้วจะไม่ trigger แล้วอัปเดตรอบถัดไปจะหายเงียบ)
 */
export const useConnectionStore = defineStore('connection', {
  state: () => ({
    status: 'connecting' as SseStatus,
    /** เพิ่มขึ้น 1 ทุกครั้งที่ backend บอกว่า "ลิสต์งานเปลี่ยนแล้ว" - หน้าที่สนใจ watch ตัวนี้ */
    changeTick: 0,
    conn: null as StreamConnection | null,
  }),
  getters: {
    isConnected: (state): boolean => state.status === 'connected',
    statusText: (state): string => {
      switch (state.status) {
        case 'connected':
          return 'เชื่อมต่อสำเร็จ';
        case 'connecting':
          return 'กำลังเชื่อมต่อ...';
        default:
          return 'การเชื่อมต่อหลุด/เกิดข้อผิดพลาด';
      }
    },
  },
  actions: {
    connect() {
      // กันเปิดซ้ำ - App.vue เรียกจาก watch(loggedIn) ซึ่งยิงซ้ำได้ตอน token ถูกเขียนใหม่
      // เปิดซ้อนแปลว่ากินโควตา connection เพิ่มโดยที่ไม่มีใครถือตัวปิดสายเก่าไว้เลย
      if (this.conn) return;
      this.conn = openAppChanges({
        // แท็บพื้นหลังไม่มีใครมองอยู่ ปล่อยสายคืนโควตา connection ให้แท็บหน้าไปก่อน
        // (สายนี้เป็นผู้ฟังล้วน ๆ ไม่ถือ lock จึงปิดได้โดยไม่กระทบสิทธิ์ของใคร)
        pauseWhenHidden: true,
        // กลับมาเห็นแล้ว ช่วงที่ปิดไปอาจมี event ตกหล่น - นับเหมือนได้ 'changed' หนึ่งก้อน
        // ให้หน้าที่ watch changeTick โหลดใหม่เอง ไม่ต้องมีทางพิเศษของตัวเอง
        onResume: () => {
          this.changeTick += 1;
        },
        onConnection: (s) => {
          this.status = s;
        },
        onChanged: () => {
          this.changeTick += 1;
        },
        // สายหลุดไม่ใช่เรื่องคอขาดบาดตาย - openStream ต่อใหม่ให้เองแบบ backoff
        onError: (e) => console.error('app stream error:', e),
      });
    },
    disconnect() {
      this.conn?.close();
      this.conn = null;
      this.status = 'connecting';
    },
  },
});
