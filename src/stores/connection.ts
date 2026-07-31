import { defineStore } from 'pinia';
import { connectSse, disconnectSse, type SseStatus } from '@/services/sse.service';
import { useMessageStore } from './Message';

// state ของ SSE connection ที่ใช้ร่วมทั้งแอป — component ไหนก็อ่าน status ได้ (เช่น disable ฟอร์มตอนสายหลุด)
export const useConnectionStore = defineStore('connection', {
  state: () => ({
    status: 'connecting' as SseStatus,
  }),
  getters: {
    isConnected: (state): boolean => state.status === 'connected',
    // ข้อความไทยไว้ที่เดียว — App.vue แค่เอาไปแสดง
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
      const messages = useMessageStore();
      connectSse({
        onStatus: (s) => {
          this.status = s;
        },
        onMessage: (data) => messages.addMessages(data),
      });
    },
    disconnect() {
      disconnectSse();
    },
  },
});
