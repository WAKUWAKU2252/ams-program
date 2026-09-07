// การจับคู่หมวด -> ไอคอน
//
// เฝ้ากฎข้อเดียวที่พังเงียบได้: หมวดที่ซ้ำกันใน master data (ที่ดิน / ที่ดิน (2)) ต้องได้
// ไอคอนเดียวกัน ถ้าวันหลังมีคนแก้ regex ตัดหางแล้วพลาด ของสองหมวดที่หมายถึงสิ่งเดียวกัน
// จะโชว์คนละไอคอนโดยไม่มีใครสังเกต
import { describe, expect, it } from 'vitest';
import { categoryIcon, FALLBACK_CATEGORY_ICON } from '../category-icon';

describe('categoryIcon', () => {
  it('หมวดที่รู้จักได้ไอคอนเฉพาะของมัน', () => {
    expect(categoryIcon('เครื่องใช้สำนักงาน')).toBe('lucide:monitor');
    expect(categoryIcon('เครื่องจักรและอุปกรณ์')).toBe('lucide:cog');
    expect(categoryIcon('ยานพาหนะ')).toBe('lucide:car');
    expect(categoryIcon('อาคารและสิ่งปลูกสร้าง')).toBe('lucide:building-2');
    expect(categoryIcon('ส่วนปรับปรุงอาคาร')).toBe('lucide:hammer');
  });

  it('หมวดที่ซ้ำกันใน master data ใช้ไอคอนเดียวกัน', () => {
    // สองคู่นี้มีอยู่จริงในตาราง category (id 1/3 และ 2/4)
    expect(categoryIcon('ที่ดิน (2)')).toBe(categoryIcon('ที่ดิน'));
    expect(categoryIcon('ส่วนปรับปรุงที่ดิน (2)')).toBe(categoryIcon('ส่วนปรับปรุงที่ดิน'));
    expect(categoryIcon('ที่ดิน')).toBe('lucide:land-plot');
    expect(categoryIcon('ส่วนปรับปรุงที่ดิน')).toBe('lucide:fence');
  });

  it('เลขซ้ำเลขอื่นก็ตัดหางเหมือนกัน ไม่ได้ฮาร์ดโค้ดแค่ (2)', () => {
    expect(categoryIcon('ยานพาหนะ (3)')).toBe('lucide:car');
    expect(categoryIcon('ยานพาหนะ  (12) ')).toBe('lucide:car');
  });

  it('ไม่รู้หมวด / ยังไม่ระบุ ใช้ไอคอนสำรอง', () => {
    expect(categoryIcon(null)).toBe(FALLBACK_CATEGORY_ICON);
    expect(categoryIcon(undefined)).toBe(FALLBACK_CATEGORY_ICON);
    expect(categoryIcon('')).toBe(FALLBACK_CATEGORY_ICON);
    expect(categoryIcon('หมวดที่ยังไม่เคยมี')).toBe(FALLBACK_CATEGORY_ICON);
  });
});
