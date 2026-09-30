// ป้ายชื่อ/การกรองสถานที่ตามบริษัท (0037) - ชื่อซ้ำกันข้ามบริษัทได้จริง (UBA/UBP ซ้ำ 14 ชื่อ)
import { describe, expect, it } from 'vitest'
import type { LocationOption } from '@/shared/services/master.service'
import { locationLabel, locationsForCompany } from '../location'

const ubaQa: LocationOption = { id: 1, name: 'QA', outPlan: false, companyCode: 'UBA' }
const ubpQa: LocationOption = { id: 2, name: 'QA', outPlan: false, companyCode: 'UBP' }
const ubaHr: LocationOption = { id: 3, name: 'ทรัพยากรบุคคล 2', outPlan: false, companyCode: 'UBA' }
const shared: LocationOption = { id: 4, name: 'ยังไม่ระบุที่ตั้ง', outPlan: false, companyCode: null }
const ALL = [ubaQa, ubpQa, ubaHr, shared]

describe('locationsForCompany', () => {
  it('เลือกบริษัท = ของบริษัทนั้น + แถวใช้ร่วม ไม่มีของบริษัทอื่นปน', () => {
    expect(locationsForCompany(ALL, 'UBP').map((l) => l.id)).toEqual([2, 4])
  })

  it('ยังไม่เลือกบริษัท = ทั้งหมด', () => {
    expect(locationsForCompany(ALL, '')).toHaveLength(4)
    expect(locationsForCompany(ALL, undefined)).toHaveLength(4)
  })
})

describe('locationLabel', () => {
  it('ชื่อที่ซ้ำกันข้ามบริษัทแปะรหัสบริษัท ชื่อไม่ซ้ำโชว์ตามเดิม', () => {
    expect(locationLabel(ubaQa, ALL)).toBe('QA (UBA)')
    expect(locationLabel(ubpQa, ALL)).toBe('QA (UBP)')
    expect(locationLabel(ubaHr, ALL)).toBe('ทรัพยากรบุคคล 2')
    expect(locationLabel(shared, ALL)).toBe('ยังไม่ระบุที่ตั้ง')
  })

  it('ลิสต์ที่กรองบริษัทแล้วไม่มีชื่อซ้ำ = ไม่ต้องแปะ', () => {
    const ubpOnly = locationsForCompany(ALL, 'UBP')
    expect(locationLabel(ubpQa, ubpOnly)).toBe('QA')
  })
})
