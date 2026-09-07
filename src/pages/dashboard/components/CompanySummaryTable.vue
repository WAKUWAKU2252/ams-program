<script setup lang="ts">
// ตารางสรุปรายบริษัท - แทนที่ตารางสรุปรายแผนกเมื่อดู "ทุกบริษัท"
//
// ── ทำไมไม่ใช้ตารางรายแผนกตอนดูทุกบริษัท ────────────────────────────────────
//
// ที่ scope นั้น byDepartment คือแผนกของทุกบริษัทรวมกัน (40 แผนก) และชื่อแผนกซ้ำข้าม
// บริษัทจริง 55 ชื่อ - 'Finance' / 'Executive' / 'Chief Finance Officer' โผล่ครบทั้งสามบริษัท
// ตารางที่ไม่มีคอลัมน์บริษัทจึงมีแถวหน้าตาเหมือนกันเป๊ะสามแถวโดยแยกไม่ออกว่าของใคร
//
// แก้ด้วยการเปลี่ยนแกน ไม่ใช่เติมคอลัมน์บริษัท - ตอนดูทั้งเครือ คำถามคือ "บริษัทไหนเป็นยังไง"
// ไม่ใช่ "แผนกไหนของบริษัทไหนเป็นยังไง" ส่วนตารางรายแผนกยังอยู่ครบ แค่โผล่ตอนเลือก
// บริษัทเดียว ซึ่งไม่มีชื่อซ้ำโดยโครงสร้าง
//
// ★ ไม่มีการแบ่งหน้า ต่างจากตารางรายแผนก - บริษัทที่เปิด sync มีสามแห่ง แสดงครบในหน้าเดียว
//   ได้สบาย การแบ่งหน้าจะกลายเป็นแถบเปล่าที่ไม่มีอะไรให้กด
//
// ★ ไม่มีคอลัมน์ %Active โดยตั้งใจ - การ์ด "สถานะสินทรัพย์" ข้าง ๆ โชว์เป็นแถบเทียบกัน
//   อยู่แล้ว เอามาซ้ำในตารางคือให้คนอ่านตัวเลขเดียวกันสองที่แล้วต้องเช็คว่าตรงกันไหม
import { computed } from 'vue'
import type { CompanySummary } from '@/shared/services/dashboard.service'
import { formatMoney } from '@/shared/utils/money'

const props = defineProps<{ rows: CompanySummary[] }>()

/** เรียงตามจำนวนชิ้น - แกนเดียวกับโดนัทข้างบน ลำดับบนจอจึงตรงกันทั้งหน้า */
const ranked = computed(() => [...props.rows].sort((a, b) => b.assets - a.assets))

/**
 * ราคาทุนเฉลี่ยต่อชิ้น - ตอบ "บริษัทไหนถือของแพง" ซึ่งยอดรวมบอกไม่ได้
 *
 * ★ ต้องเป็น "ราคาทุน" ห้ามใช้มูลค่าคงเหลือ
 *
 * มูลค่าคงเหลือผสมสองเรื่องเข้าด้วยกัน - "ของแพงแค่ไหน" กับ "ของเก่าแค่ไหน" - แล้วตอบ
 * ไม่ตรงสักอัน ราคาทุนคือราคาที่จ่ายจริงตอนซื้อ ไม่ขยับตามอายุ จึงตอบคำถามแรกได้ตรงตัว
 *
 * วัด 2026-09-07 อันดับสลับกันจริง ไม่ใช่ความต่างในทางทฤษฎี:
 *   ราคาทุน/ชิ้น : UBA 142,568 > UBP 83,278 > MIG 48,571
 *   NBV/ชิ้น     : UBA  96,760 > MIG 47,630 > UBP 44,950   ← MIG แซง
 * MIG แซง UBP เพราะของใหม่กว่า (ตัดค่าเสื่อมไป 2% เทียบ 46%) ไม่ใช่เพราะของแพงกว่า
 *
 * ส่วนแกน "ของเก่าแค่ไหน" มีที่อยู่แล้วที่ป้าย "ตัดแล้ว N%" ปลายแท่งในกราฟข้างบน
 *
 * ★ หารด้วย assets (ของทั้งหมด) ไม่ใช่เฉพาะชิ้นที่มีตัวเลขบัญชี - ตัวหารเป็นจำนวนที่
 *   คนเห็นอยู่ในคอลัมน์ "ชิ้น" ข้าง ๆ หารเองตรวจได้ แลกกับค่าที่ต่ำกว่าความจริงเล็กน้อย
 *   เมื่อมีชิ้นที่ SAP ยังไม่ส่งตัวเลขมา (หารด้วยเฉพาะชิ้นที่มีตัวเลขจะเทียบข้ามบริษัทไม่ได้
 *   เพราะตัวหารเป็นคนละชุดกัน)
 *
 * null = ไม่มีของเลย (ไม่ใช่ 0 บาท) - หน้าจอต้องขึ้น '-' ไม่ใช่เลขศูนย์
 */
const perAsset = (row: CompanySummary): number | null =>
  row.assets === 0 ? null : (row.bookedCost ?? 0) / row.assets
</script>

<template>
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3 text-left">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="card-title text-base">
          สรุปรายบริษัท
          <span class="badge badge-ghost badge-sm">{{ ranked.length }}</span>
        </h2>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm table-pin-rows table-freeze-first">
          <thead>
            <tr>
              <th class="freeze-col">บริษัท</th>
              <th class="text-center">ชิ้น</th>
              <th class="text-right">Active</th>
              <th class="text-right">ราคาทุน</th>
              <th class="text-right">ค่าเสื่อมสะสม</th>
              <th class="text-right">มูลค่าคงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            <!-- บริษัทที่ยังไม่มีของ จางลงทั้งแถว - กวาดตาหาบริษัทที่มีของได้เร็ว
                 แต่ยังอ่านออกว่ามีบริษัทนี้อยู่ (แพทเทิร์นเดียวกับตารางรายแผนก) -->
            <tr
              v-for="row in ranked"
              :key="row.companyCode"
              class="hover:bg-base-200"
              :class="row.assets === 0 ? 'text-base-content/45' : ''"
            >
              <td class="freeze-col">
                {{ row.companyName || row.companyCode }}
                <!-- รหัสกำกับไว้ด้วย - ตัวเลือกบริษัทข้างบนกับเลขเอกสารทั้งระบบใช้รหัส
                     ไม่ใช่ชื่อเต็ม ถ้าโชว์แต่ชื่อ คนจะเทียบกับที่อื่นไม่ติด -->
                
              </td>
              <td class="text-center tabular-nums">
                <span v-if="row.assets === 0" class="badge badge-ghost badge-sm">ยังไม่มีของ</span>
                <template v-else>{{ row.assets.toLocaleString('th-TH') }}</template>
              </td>
              <td class="text-right tabular-nums">{{ row.active.toLocaleString('th-TH') }}</td>
              <td class="text-right tabular-nums">{{ formatMoney(row.bookedCost) }}</td>
              <td class="text-right tabular-nums">
                {{ formatMoney(row.accumulatedDepreciation) }}
              </td>
              <td class="text-right font-medium tabular-nums">
                {{ formatMoney(row.netBookValue) }}
              </td>
            </tr>

            <tr v-if="!ranked.length">
              <td colspan="7" class="py-10 text-center text-base-content/50">
                ยังไม่มีสินทรัพย์ในขอบเขตนี้
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- คุณถอดเชิงอรรถใต้ตารางออกไปแล้ว - คำอธิบายสูตรจึงอยู่ที่ title ของหัวคอลัมน์แทน
           (ยอดเงินนับเฉพาะชิ้นที่มีตัวเลขบัญชี ส่วนตัวหารนับทุกชิ้น จึงคูณกลับไม่ลงตัว) -->

    </div>
  </div>
</template>
