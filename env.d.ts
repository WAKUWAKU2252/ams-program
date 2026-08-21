/// <reference types="vite/client" />

// ── ชนิดของ qrcode แบบเท่าที่ใช้จริง ────────────────────────────────────────
// ไม่ใช้ @types/qrcode เพราะบรรทัดแรกของมันคือ `/// <reference types="node" />` ซึ่งลาก
// global ของ Node เข้ามาทั้งชุดในโปรเจกต์ที่เป็น DOM ล้วน ผลที่เห็นทันทีคือ setTimeout
// เปลี่ยนไปคืน NodeJS.Timeout แล้วโค้ดเดิมที่เก็บเป็น number พังทั้งไฟล์ (auth.token.ts)
// — และที่แย่กว่านั้นคือ Buffer/process จะโผล่มาให้เรียกได้ทั้งที่ browser ไม่มีให้ใช้
//
// เราใช้แค่ toDataURL ตัวเดียว ประกาศเท่าที่ใช้จึงคุ้มกว่าและไม่มีอะไรให้ drift มากนัก
declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    /** ขอบขาวรอบรูป นับเป็นจำนวนโมดูล (ไม่ใช่พิกเซล) */
    margin?: number
    /** ความกว้างรูปที่ได้ (พิกเซล) */
    width?: number
    /** ระดับการกู้คืนเมื่อรูปเสียหาย: L ~7% / M ~15% / Q ~25% / H ~30% */
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  }
  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>
  const _default: { toDataURL: typeof toDataURL }
  export default _default
}
