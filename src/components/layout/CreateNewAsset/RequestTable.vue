<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import HeadtableCreateNewAsset from '@/components/common/PolineTable/HeadtableCreateNewAsset.vue';
import AppConfirmDialog from '@/components/common/AppConfirmDialog.vue';
import { getAssetSlots, type AssetSlot, type AssetSlotItem } from '@/services/asset.service';
import { declareLine, removeDeclaredLine } from '@/services/assetRequest.service';
import { ApiError } from '@/services/httpClient';
import { formatDate } from '@/utils/date';

const props = withDefaults(defineProps<{ requestId: number; editable?: boolean }>(), {
  editable: true,
});

const items = ref<AssetSlotItem[]>([]);
const loading = ref(true);
const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await getAssetSlots(props.requestId);
    items.value = res.items;
  } catch (e) {
    console.error('โหลดรายการ asset ไม่สำเร็จ:', e);
    loadError.value = 'โหลดรายการไม่สำเร็จ';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.requestId, load);

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ฿';
}

const expandedIds = ref(new Set<string>());
const collapsedRounds = ref(new Set<string>());

function toggleExpand(poItemId: string) {
  const next = new Set(expandedIds.value);
  if (next.has(poItemId)) next.delete(poItemId);
  else next.add(poItemId);
  expandedIds.value = next;
}

function isExpanded(poItemId: string) {
  return expandedIds.value.has(poItemId);
}

function toggleRound(grpoLineId: string) {
  const next = new Set(collapsedRounds.value);
  if (next.has(grpoLineId)) next.delete(grpoLineId);
  else next.add(grpoLineId);
  collapsedRounds.value = next;
}

function isRoundOpen(grpoLineId: string) {
  return !collapsedRounds.value.has(grpoLineId);
}
interface RoundGroup {
  id: string;
  grpoNo: string;
  grpoDate: string;
  receivedQty: number;
  declaredQty: number | null;
  declaredReason: string | null;
  /** จำนวนชิ้นที่ลงได้จริงของรอบนี้ = ที่แจ้งไว้ ถ้าไม่แจ้งก็ตามที่ SAP รับมา */
  qty: number;
  slots: AssetSlot[];
}

const grouped = computed(() =>
  items.value.map((item) => {
    const rounds: RoundGroup[] = item.grpoLines.map((l) => ({
      id: l.id,
      grpoNo: l.grpoNo,
      grpoDate: l.grpoDate,
      receivedQty: l.receivedQty,
      declaredQty: l.declaredQty,
      declaredReason: l.declaredReason,
      qty: l.declaredQty ?? l.receivedQty,
      slots: item.slots.filter((s) => s.status !== 'noGrpo' && s.grpoLineId === l.id),
    }));

    return {
      item,
      rounds: rounds.filter((r) => r.qty > 0 || r.slots.length > 0 || r.declaredQty !== null),
      noGrpoSlots: item.slots.filter((s) => s.status === 'noGrpo'),
    };
  }),
);

const declareOpen = ref(false);
const declareTarget = ref<RoundGroup | null>(null);
const declareQty = ref(0);
const declareReason = ref('');
const declareSaving = ref(false);
const declareError = ref('');

function openDeclare(round: RoundGroup) {
  declareTarget.value = round;
  declareQty.value = round.qty;
  declareReason.value = round.declaredReason ?? '';
  declareError.value = '';
  declareOpen.value = true;
}

async function onConfirmDeclare() {
  const round = declareTarget.value;
  if (!round) return;
  if (!declareReason.value.trim()) {
    declareError.value = 'กรุณาระบุเหตุผลที่จำนวนไม่ตรงกับที่ PO แจ้ง';
    return;
  }
  declareSaving.value = true;
  declareError.value = '';
  try {
    await declareLine(props.requestId, round.id, declareQty.value, declareReason.value.trim());
    declareOpen.value = false;
    await load();
  } catch (e) {
    declareError.value = e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ โปรดลองอีกครั้ง';
  } finally {
    declareSaving.value = false;
  }
}

async function onRevertToSap() {
  const round = declareTarget.value;
  if (!round) return;
  declareSaving.value = true;
  declareError.value = '';
  try {
    await removeDeclaredLine(props.requestId, round.id);
    declareOpen.value = false;
    await load();
  } catch (e) {
    declareError.value = e instanceof ApiError ? e.message : 'ยกเลิกไม่สำเร็จ โปรดลองอีกครั้ง';
  } finally {
    declareSaving.value = false;
  }
}

// ป้ายสถานะต่อชิ้น — สี/ข้อความตาม slot.status
const STATUS_META = {
  registered: { label: 'Registered', class: 'bg-green-100 text-green-600', border: 'border-[var(--correct)]' },
  pending: { label: 'Pending', class: 'bg-amber-100 text-amber-600', border: 'border-[var(--pending)]' },
  noGrpo: { label: 'No GRPO', class: 'bg-[var(--noContent)] text-black-600', border: 'border-[var(--noContent)]' },
} as const;



</script>

<template>
  <div class="card">
    <div class="flex flex-col items-start min-w-0 w-full">
      <h2 class="text-xl text-[var(--primary-color)] text-left">Select PO Line</h2>
      <p class="mb-4 text-sm text-[var(--secondary-color)] text-left">
        เลือกรายการ PO Line ที่ต้องการลงทะเบียน Asset*
      </p>

      <div class="w-full overflow-x-auto rounded-lg border border-[var(--line-color)]">
        <table class="w-full min-w-[480px] border-separate border-spacing-0 text-sm">
          <HeadtableCreateNewAsset />
          <tbody>
            <!-- โหลดอยู่ / error / ว่าง -->
            <tr v-if="loading">
              <td colspan="4" class="px-6 py-6 text-center text-[var(--third-color)]">
                <i class="fa-solid fa-spinner animate-spin mr-2" />กำลังโหลดรายการ...
              </td>
            </tr>
            <tr v-else-if="loadError">
              <td colspan="4" class="px-6 py-6 text-center text-red-500">{{ loadError }}</td>
            </tr>
            <tr v-else-if="items.length === 0">
              <td colspan="4" class="px-6 py-6 text-center text-[var(--third-color)]">
                ยังไม่มี PO Line ให้เลือก
              </td>
            </tr>

            <template v-for="{ item, rounds, noGrpoSlots } in grouped" :key="item.poItemId">
              <tr class="po-row even:bg-[var(--secondary-background)] text-[var(--primary-color)]
              transition-colors hover:bg-[var(--Side-background)] cursor-pointer" @click="toggleExpand(item.poItemId)">

                <td class="row-divider px-4 py-4 font-mono text-sm">
                  <span class="inline-flex items-center gap-4">
                    <i class="fa-solid fa-chevron-right text-xs text-[var(--secondary-color)] transition-transform"
                      :class="{ 'rotate-90': isExpanded(item.poItemId) }"></i>
                    {{ item.poLine }}
                  </span>
                </td>
                <td class="row-divider px-6 py-4 text-left">
                  {{ item.itemDescription }}
                  <!-- งานเหมาที่แตกรายการเอง: จำนวนชิ้นจริงไม่ใช่จำนวนหน่วยใน PO -->
                  <span v-if="item.isDeclared"
                    class="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                    แตกรายการเอง
                  </span>
                </td>

                <td class="row-divider px-6 py-4 text-center font-mono text-sm">
                  <span v-if="item.isDeclared && item.planned !== item.ordered" class="text-purple-700"
                    :title="`PO สั่ง ${item.ordered} — แจ้งไว้ ${item.planned}`">
                    {{ item.planned }}
                  </span>
                  <span v-else>{{ item.ordered }}</span>
                </td>
                <td class="row-divider px-6 py-4 text-right font-mono text-sm">{{ formatCurrency(item.lineTotal) }}</td>
              </tr>

              <tr v-if="isExpanded(item.poItemId)" class="row-divider">
                <td colspan="4" class="bg-[var(--third-background)] px-14 py-4">

                  <p v-if="item.overCost"
                    class="mb-3 rounded-lg border border-[var(--pending)] bg-amber-50 px-3 py-2 text-left text-xs text-[var(--pending)]">
                    <i class="fa-solid fa-triangle-exclamation mr-1" />
                    ราคารวมที่กรอก {{ formatCurrency(item.registeredCost) }}
                    เกินยอดของบรรทัดนี้ใน PO ({{ formatCurrency(item.lineAmount) }})
                  </p>

                  <div v-for="round in rounds" :key="round.id" class="mb-3 last:mb-0"> 
                    <div class="flex w-full items-center gap-3 bg-white px-3 py-2 text-left">
                      <button type="button"
                        class="flex flex-1 items-center gap-3 text-left transition-colors hover:opacity-80"
                        @click="toggleRound(round.id)">
                        <i class="fa-solid fa-caret-down text-xs text-[var(--secondary-color)] transition-transform duration-200"
                          :class="isRoundOpen(round.id) ? 'rotate-0' : '-rotate-90'"></i>

                        <span class="font-mono text-sm text-[var(--primary-color)]">{{ round.grpoNo }}</span>
                        <span class="text-xs text-[var(--third-color)]">{{ formatDate(round.grpoDate) }}</span>
                        <span class="ml-auto text-xs text-[var(--secondary-color)]">
                          ลงทะเบียนแล้ว {{round.slots.filter((s) => s.status === 'registered').length}} /
                          <span class="font-mono">{{ round.qty }}</span> ชิ้น
                        </span>
                        <span v-if="round.declaredQty !== null"
                          class="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700"
                          :title="round.declaredReason ?? ''">
                          แจ้งเอง (GRPO เดิมรับ {{ round.receivedQty }})
                        </span>
                      </button>


                      <button type="button" :disabled="!props.editable" class="rounded px-2 text-sm text-[var(--primary-color)] transition-colors hover:text-blue-700
                        disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-[var(--primary-color)]"
                        :title="round.declaredQty !== null ? 'แก้จำนวนที่แจ้งไว้' : 'แจ้งจำนวนชิ้นของรอบนี้'"
                        @click="openDeclare(round)">
                        <i class="fa-solid fa-file-pen text-lg"></i>
                      </button>

                    </div>



                    <table v-if="isRoundOpen(round.id)" class="w-full border-separate border-spacing-0 text-sm ">
                      <tbody>
                        <tr v-for="slot in round.slots" :key="slot.index" class="transition-colors" :class="slot.status === 'registered'
                          ? 'bg-[var(--third-background)]'
                          : 'bg-white hover:bg-[var(--Side-background)]'">
                          <td class="row-divider w-[20px]
                        pr-0 pl-6 py-2 font-mono text-sm text-right" :class="STATUS_META[slot.status].border">
                            {{ item.poLine }}.{{ slot.index }}
                          </td>

                          <!-- Image -->
                          <td class="row-divider py-2 text-center">
                            <i class="fa-solid fa-image text-2"></i>
                          </td>
                          <!-- Serial -->
                          <td class="row-divider px-4 py-2 text-left ">
                            <div class="flex flex-col">
                              <span class="text-label-md text-outline uppercase text-[var(--third-color)]">Serial
                                number</span>
                              <span v-if="slot.status === 'registered'" class="text-[var(--third-color)]">
                                {{ slot.serialNumber ?? 'Not assigned' }}
                              </span>
                              <span v-else class="text-[var(--primary-color)]">Not assigned</span>
                            </div>
                          </td>

                          <td class="row-divider py-2 text-right">
                            <div class="flex flex-col">
                              <span class="text-label-md text-outline uppercase text-[var(--third-color)]">Price per
                                unit</span>
                              <span class="text-[var(--primary-color)]">{{ formatCurrency(item.unitPrice) }} </span>
                            </div>
                          </td>

                          <!-- Status -->
                          <td class="row-divider py-2 text-right max-w-[60px]">
                            <span class="px-2 py-1 text-xs rounded-full" :class="STATUS_META[slot.status].class">
                              {{ STATUS_META[slot.status].label }}
                            </span>
                          </td>

                          <!-- Action -->
                          <td class="row-divider pr-4 py-2 text-center items-left rounded-r-lg max-w-[40px]">
                            <button :disabled="!props.editable"
                              class=" py-1 rounded  text-[var(--primary-color)]
                          hover:text-blue-700 text-lg disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-[var(--primary-color)]">
                              <i class="fa-regular fa-pen-to-square"></i>
                            </button>
                          </td>
                        </tr>

                      </tbody>
                    </table>
                    <button type="button" class="rounded px-2 text-sm text-[var(--primary-color)] transition-colors hover:text-blue-700
                        disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-[var(--primary-color)]">
                      Upload invoice
                    </button>
                  </div>

                  <!-- ยังไม่มีรอบรับของเลย — ไม่มีอะไรให้กรอกทั้งบรรทัด -->
                  <p v-if="rounds.length === 0"
                    class="rounded-lg bg-white px-3 py-3 text-left text-sm text-[var(--third-color)]">
                    ยังไม่มีรอบรับของ (GRPO) สำหรับรายการนี้ — ลงทะเบียนได้เมื่อคลังตรวจรับแล้ว
                  </p>

                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── แจ้งจำนวนชิ้นของรอบรับของ ── -->
    <AppConfirmDialog v-model="declareOpen" variant="info" title="แก้ไขจำนวนชิ้นการขึ้นทะเบียนสินทรัพย์"
      confirm-text="บันทึก" :loading="declareSaving" @confirm="onConfirmDeclare">
      <div class="space-y-3 text-left">
        <p>
          GRPO <span class="font-semibold"><u>{{ declareTarget?.grpoNo }}</u></span> ·
          SAP รับมา <span class="font-semibold">{{ declareTarget?.receivedQty }}</span> ชิ้น
          ลงทะเบียนแล้ว
          {{declareTarget?.slots.filter((s) => s.status === 'registered').length ?? 0}} ชิ้น
        </p>

        <label class="block">
          <span class="text-xs uppercase text-[var(--secondary-color)]">จำนวนชิ้นที่จะขึ้นทะเบียน*</span>
          <input v-model.number="declareQty" type="number" min="0"
            class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 focus:border-[var(--primary-color)] focus:outline-none" />
          <span class="text-xs text-[var(--third-color)]">
            สามารถใส่ 0 ชิ้นได้ ถ้าการสร้างนี้ไม่เกิดสินทรัพย์จริง (เช่น เป็นค่าบริการ) <br>
            *ลดต่ำกว่าจำนวนที่ลงทะเบียนไปแล้วไม่ได้
          </span>
        </label>

        <label class="block">
          <span class="text-xs uppercase text-[var(--secondary-color)]">เหตุผล (บังคับ)*</span>
          <textarea v-model="declareReason" rows="2"
            placeholder="เช่น งานเหมา 1 งาน ประกอบด้วยกล้อง 11 ตัว + NVR 1 เครื่อง ตามใบส่งของ"
            class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 focus:border-[var(--primary-color)] focus:outline-none" />
          <span class="text-xs text-[var(--third-color)]">
            ผู้อนุมัติจะเห็นข้อความนี้พร้อมส่วนต่างจากเอกสาร SAP
          </span>
        </label>

        <!-- รอบที่เคยแจ้งไว้แล้ว: เปิดทางกลับไปเชื่อตัวเลข SAP -->
        <button v-if="declareTarget?.declaredQty !== null && declareTarget" type="button" :disabled="declareSaving"
          class="text-sm text-[var(--primary-color)] underline disabled:opacity-40" @click="onRevertToSap">
          กลับไปใช้จำนวนที่ GRPO เดิมรับมา ({{ declareTarget.receivedQty }})
        </button>

        <p v-if="declareError" class="rounded-lg bg-red-50 px-3 py-2 text-red-600 text-base">*{{ declareError }}</p>
      </div>
    </AppConfirmDialog>
  </div>
</template>

<style scoped>
.card {
  grid-template-columns: 1fr;
}
</style>
