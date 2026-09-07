// เรขาคณิตของขอบเขตห้อง - ตรรกะที่ทดสอบผ่านหน้าจอไม่ได้
//
// jsdom ไม่โหลดรูปจริง แผนที่จึงไม่มี naturalWidth ให้คำนวณพิกัด การกดจริงบนแผนที่
// ใน component test เลยทำไม่ได้ - สองฟังก์ชันนี้ถูกแยกออกมาเพื่อให้ทดสอบตรง ๆ ได้
import { describe, expect, it } from 'vitest';
import { pointInPolygon, polygonBounds, type Point } from '../polygon';

/** ห้องสี่เหลี่ยมธรรมดา - แบบที่ 57 ห้องในระบบเป็นอยู่ตอนนี้ */
const square: Point[] = [
  [0.2, 0.2],
  [0.4, 0.2],
  [0.4, 0.5],
  [0.2, 0.5],
];

/** ห้องรูปตัว L - กรอบสี่เหลี่ยมหุ้มกินพื้นที่ที่ไม่ใช่ห้องด้วย */
const lShape: Point[] = [
  [0.0, 0.0],
  [0.6, 0.0],
  [0.6, 0.2],
  [0.2, 0.2],
  [0.2, 0.6],
  [0.0, 0.6],
];

describe('pointInPolygon', () => {
  it('จุดกลางห้องอยู่ใน', () => {
    expect(pointInPolygon(square, 0.3, 0.35)).toBe(true);
  });

  it('จุดนอกห้องอยู่นอก', () => {
    expect(pointInPolygon(square, 0.5, 0.35)).toBe(false);
    expect(pointInPolygon(square, 0.3, 0.9)).toBe(false);
  });

  it('ห้องรูปตัว L - จุดในแขนของตัว L อยู่ใน', () => {
    expect(pointInPolygon(lShape, 0.5, 0.1)).toBe(true);
    expect(pointInPolygon(lShape, 0.1, 0.5)).toBe(true);
  });

  it('ห้องรูปตัว L - จุดในมุมเว้าอยู่นอก ทั้งที่อยู่ในกรอบหุ้ม', () => {
    // (0.45, 0.45) อยู่ในกรอบ 0..0.6 ทั้งสองแกน แต่ไม่ได้อยู่ในตัวห้อง
    // นี่คือเหตุผลที่ต้องเทียบรูปจริง ไม่ใช่กรอบหุ้ม
    const b = polygonBounds(lShape);
    expect(0.45 >= b.x0 && 0.45 <= b.x1 && 0.45 >= b.y0 && 0.45 <= b.y1).toBe(true);
    expect(pointInPolygon(lShape, 0.45, 0.45)).toBe(false);
  });
});

describe('polygonBounds', () => {
  it('คืนกรอบหุ้มและจุดกึ่งกลางของห้องสี่เหลี่ยม', () => {
    const b = polygonBounds(square);
    expect(b).toMatchObject({ x0: 0.2, y0: 0.2, x1: 0.4, y1: 0.5 });
    expect(b.cx).toBeCloseTo(0.3, 5);
    expect(b.cy).toBeCloseTo(0.35, 5);
    expect(b.w).toBeCloseTo(0.2, 5);
    expect(b.h).toBeCloseTo(0.3, 5);
  });

  it('ห้องแคบมากในแกนเดียวยังคืนค่าได้ ไม่พังตอนหาร', () => {
    const sliver: Point[] = [
      [0.5, 0.5],
      [0.5001, 0.5],
      [0.5001, 0.8],
      [0.5, 0.8],
    ];
    const b = polygonBounds(sliver);
    expect(b.w).toBeGreaterThan(0);
    expect(b.h).toBeCloseTo(0.3, 5);
  });
});
