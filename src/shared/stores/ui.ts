import { defineStore } from 'pinia'
import { nextTick, ref } from 'vue'
import { isDark, toggleTheme as applyToggleTheme } from '@/shared/utils/theme'

export const useUiStore = defineStore('ui', () => {
  // ผูกกับ checkbox `drawer-toggle` ของ daisyUI ใน MainLayout โดยตรง
  // (บนจอ lg ขึ้นไป drawer เปิดค้างด้วย lg:drawer-open - ค่านี้จึงมีผลเฉพาะจอเล็ก)
  const isSidebarOpen = ref(false)

  function toggleSidebar(): void {
    isSidebarOpen.value = !isSidebarOpen.value
  }

  function closeSidebar(): void {
    isSidebarOpen.value = false
  }

  // --- พับ sidebar บนจอใหญ่ ---
  //
  // ★ **คนละตัวกับ isSidebarOpen ข้างบน ห้ามยุบรวมกัน** — สองอันนี้คุมคนละ breakpoint และ
  //   ทำงานคนละกลไก:
  //     isSidebarOpen       จอเล็ก - daisyUI เลื่อน drawer เข้า/ออกด้วย CSS จาก checkbox
  //     isSidebarCollapsed  จอ lg ขึ้นไป - ถอดคลาส lg:drawer-open ทิ้ง (ดู MainLayout)
  //   บนจอ lg ตัว lg:drawer-open ตรึง sidebar ให้เปิดค้างเสมอ ไม่ว่า checkbox จะเป็นอะไร
  //   การกด hamburger บนจอใหญ่จึงไม่เคยทำอะไรเลยก่อนหน้านี้ — ต้องถอดคลาสนั้นเท่านั้น
  //
  // ★ ไม่ได้จำลง localStorage โดยตั้งใจ - รีโหลดแล้วกลับมาเห็นเมนู ซึ่งเป็นสถานะที่อธิบาย
  //   ตัวเองได้ ต่างจากธีมที่ผู้ใช้ตั้งใจเลือกไว้ถาวร (ถ้าวันหลังอยากให้จำ ใส่ที่นี่ที่เดียว)
  const isSidebarCollapsed = ref(false)

  function toggleSidebarCollapsed(): void {
    isSidebarCollapsed.value = !isSidebarCollapsed.value
    // ★ ปิด checkbox ของจอเล็กไปด้วยตอนพับ - ถ้ามันค้างเป็น true อยู่ (ผู้ใช้เคยเปิดเมนู
    //   บนจอเล็กแล้วขยายหน้าต่าง) พอ lg:drawer-open ถูกถอด drawer จะเด้งกลับมาเป็นแบบ
    //   overlay ทับเนื้อหาทันที = กดพับแล้วเมนูไม่หาย
    if (isSidebarCollapsed.value) isSidebarOpen.value = false
    announceLayoutChange()
  }

  /**
   * บอกทั้งหน้าว่า "ความกว้างของเนื้อหาเพิ่งเปลี่ยน" ด้วย resize event ปลอมของ window
   *
   * ★ **จำเป็น ไม่ใช่ของแถม** - การพับเมนูเปลี่ยนความกว้างของทุกอย่างในหน้าโดยที่ window
   *   ไม่ขยับสักพิกเซล ของที่วัดขนาดตัวเองไว้ตอน render จึงไม่มีทางรู้ว่าต้องวัดใหม่
   *   ตัวที่เจ็บสุดคือกราฟ ApexCharts บน Dashboard: มันเขียนความกว้างเป็น px ลง <svg>
   *   ที่สร้างเอง พอกางเมนูกลับ การ์ดแคบลงแต่กราฟยังกว้างเท่าเดิม = ทะลุออกนอกการ์ด
   *   ไปดันแถบเลื่อนแนวนอนของทั้งหน้า (ซึ่งคือเหตุผลที่ "ย่อ-ขยายหน้าต่างแล้วหายเอง")
   *
   * ★ **ทำไมไม่พึ่ง ResizeObserver ที่ AppApexChart มีอยู่แล้ว** - วัดจริงแล้วมันไม่ยิงตอน
   *   คลาส lg:drawer-open ถูกถอด/ใส่ ทั้งที่ clientWidth ของกล่องเปลี่ยนจาก 788 เป็น 618
   *   (นับ callback ไว้ตรง ๆ: ค้างที่เลขเดิมตลอด 4 รอบพับ-กาง) ส่วน resize event ปลอม
   *   ตัวนี้แก้ได้ในครั้งเดียว วัดคู่กันในหน้าเดียวกัน:
   *     ก่อน dispatch  host=618 canvas=788px scrollWidth=1490/1425  ล้น 9 element
   *     หลัง dispatch  host=618 canvas=618px scrollWidth=1425/1425  ไม่ล้น
   *   ResizeObserver ยังอยู่ในฐานะตาข่ายรับเคสอื่น แต่เคสนี้ต้องมีตัวนี้ถึงจะแน่นอน
   *
   * ★ ต้องรอ nextTick + หนึ่งเฟรม - ตอนฟังก์ชันนี้ทำงาน Vue ยังไม่ได้เขียนคลาสใหม่ลง DOM
   *   ยิงตอนนั้นทุกคนจะไปวัดความกว้าง "ก่อนเปลี่ยน" แล้วได้ค่าเดิมกลับมา
   *
   * ★ ของที่ได้ประโยชน์ไม่ได้มีแต่กราฟ - FloorPlanMap ก็ผูก window resize ไว้เพื่อคำนวณ
   *   fit() ใหม่เหมือนกัน (หน้า Audit / ผังชั้น)
   */
  function announceLayoutChange(): void {
    if (typeof window === 'undefined') return
    void nextTick(() => {
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    })
  }

  // --- Profile menu popup (UserItem overlay) ---
  const isProfileMenuOpen = ref(false)

  function toggleProfileMenu(): void {
    isProfileMenuOpen.value = !isProfileMenuOpen.value
  }

  function openProfileMenu(): void {
    isProfileMenuOpen.value = true
  }

  function closeProfileMenu(): void {
    isProfileMenuOpen.value = false
  }

  // --- ธีมสว่าง/มืด ---
  //
  // ★ ต้องอยู่ใน store ไม่ใช่ ref ของใครของมัน — ปุ่มสลับธีมมีสองที่ (TopBar กับกล่องโปรไฟล์
  //   ใน Sidebar) ถ้าต่างคนต่างถือ ref เอง กดที่หนึ่งแล้วอีกที่จะวาดสถานะเก่าค้างไว้จนกว่า
  //   จะ remount — เพราะ data-theme บน <html> เป็น attribute ธรรมดา ไม่ใช่ reactive source
  //   ที่ Vue เฝ้าให้ได้ (เหตุผลเดียวกับที่ theme.ts ต้องมีคนจำสถานะให้)
  //
  // ★ ตัวที่เขียน data-theme + localStorage จริงคือ theme.ts ที่นี่แค่จำว่าตอนนี้มืดอยู่ไหม
  const isDarkTheme = ref(isDark())

  function toggleTheme(): void {
    applyToggleTheme()
    isDarkTheme.value = isDark()
  }

  return {
    // state
    isSidebarOpen,
    isSidebarCollapsed,
    isProfileMenuOpen,
    isDarkTheme,
    toggleTheme,
    toggleSidebarCollapsed,
    // sidebar actions
    toggleSidebar,
    closeSidebar,
    // profile menu actions
    toggleProfileMenu,
    openProfileMenu,
    closeProfileMenu,
  }
})
