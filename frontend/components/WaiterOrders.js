export default {
  props: {
    readyItems: { type: Array, default: () => [] },
    served: { type: Array, default: () => [] }
  },
  emits: ['deliver', 'open-bill'],
  template: `
    <div class="w-section">
      <div class="w-section-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="color:#F4A261;margin-right:0.35rem;vertical-align:-2px;">
          <path d="M12 2 1 21h22L12 2zm0 6c.6 0 1 .4 1 1v6a1 1 0 1 1-2 0V9c0-.6.4-1 1-1zm0 12a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 12 20z"/>
        </svg>
        Ready For Pickup ({{ (readyItems||[]).length }})
      </div>

      <div class="panel">
        <div class="ready-table">
          <div class="ready-head">
            <div>Table</div>
            <div>Dish</div>
            <div style="text-align:center;">Qty</div>
            <div style="text-align:right;">Action</div>
          </div>

          <div v-if="(readyItems||[]).length===0" class="ready-empty">
            No items ready for pickup right now.
          </div>

          <div v-else>
            <div v-for="it in readyItems" :key="it.item_id" class="ready-row">
              <div class="table-pill" @click="$emit('open-bill', it.table_number)" title="Open bill">
                {{ it.table_number }}
              </div>
              <div class="dish-name">{{ it.dish }}</div>
              <div class="qty-pill">{{ it.qty }}</div>
              <button class="deliver-btn" @click="$emit('deliver', it)">
                Deliver
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="w-section-title" style="margin-top:1rem;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#2A9D8F;margin-right:0.35rem;vertical-align:-2px;">
          <path d="M9 11.5 11 13.5 15.5 9"/>
          <path d="M4 4h16v16H4z"/>
        </svg>
        Served Today ({{ (served||[]).length }})
      </div>

      <div class="panel">
        <div v-if="(served||[]).length===0" class="served-empty">
          No served orders yet.
        </div>
        <div v-else class="served-list">
          <div v-for="s in served" :key="s.item_id || (String(s.batch_id)+'-'+String(s.time))" class="served-row">
            <div class="served-table">{{ s.table_number }}</div>
            <div class="served-id">{{ s.dish }} <span style="color:#9C8E84;font-weight:900;">x{{ s.qty }}</span></div>
            <div class="served-tag">Served</div>
            <div class="served-time">{{ timeLabel(s.time) }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const timeLabel = (iso) => {
      try {
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    };
    return { timeLabel };
  }
};
