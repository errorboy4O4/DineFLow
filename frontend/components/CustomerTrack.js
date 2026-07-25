const { computed } = Vue;

export default {
  props: {
    session: { type: Object, default: null },
    activeOrder: { type: Object, default: null },      // selected batch
    activeOrders: { type: Array, default: () => [] },  // all non-delivered batches
    canRequestClose: { type: Boolean, default: false }
  },
  emits: ['go-menu', 'select-order', 'request-close'],
  template: `
    <div style="padding:1rem 1rem 1.25rem;">
      <div v-if="!activeOrder" style="background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;padding:1.1rem 1rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);text-align:center;">
        <div style="width:58px;height:58px;border-radius:18px;background:rgba(58,175,169,0.16);display:flex;align-items:center;justify-content:center;margin:0 auto 0.85rem;">
          <i class="bi bi-lightning-charge" style="color:#2A8F8A;font-size:1.5rem;"></i>
        </div>
        <div style="font-weight:900;font-size:1.05rem;">No active order yet</div>
        <div style="color:#9C8E84;font-weight:800;font-size:0.84rem;margin-top:0.35rem;">
          Add items to your cart and send an order to start tracking.
        </div>
        <button class="btn-primary" style="margin-top:0.85rem;" @click="$emit('go-menu')">
          Browse Menu
        </button>
      </div>

      <div v-else>
        <div v-if="(activeOrders || []).length > 0" style="margin-bottom:0.85rem;display:flex;flex-direction:column;gap:0.65rem;">
          <div v-for="b in activeOrders" :key="b.id"
               @click="$emit('select-order', b.id)"
               :style="batchCardStyle(b)"
               title="Tap to track this batch">
            <div style="display:flex;align-items:flex-start;gap:0.75rem;">
              <div style="width:44px;height:44px;border-radius:0.95rem;background:#F0EBE3;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="bi bi-receipt" style="color:#6F4E37;"></i>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:900;">Batch #{{ b.id }}</div>
                <div style="color:#9C8E84;font-weight:800;font-size:0.78rem;margin-top:0.15rem;">
                  Table {{ tableNumberLabel }} · {{ timeLabel(b.created_at) }}
                </div>
              </div>
              <div :style="pillStyle(b.status)">{{ statusText(b.status) }}</div>
            </div>
            <div style="margin-top:0.6rem;border-top:1px solid rgba(111,78,55,0.08);padding-top:0.6rem;display:flex;justify-content:space-between;gap:0.75rem;color:#6B5744;font-weight:900;">
              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                {{ itemsSummary(b) }}
              </div>
              <div style="color:#4A3423;">&#8377;{{ batchTotal(b) }}</div>
            </div>
          </div>
        </div>

        <div v-if="false" style="background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;padding:0.95rem 0.95rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);margin-bottom:0.85rem;">
          <div style="display:flex;align-items:flex-start;gap:0.75rem;">
            <div style="width:44px;height:44px;border-radius:0.95rem;background:#F0EBE3;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="bi bi-receipt" style="color:#6F4E37;"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:900;">Batch #{{ activeOrder.id }}</div>
              <div style="color:#9C8E84;font-weight:800;font-size:0.78rem;margin-top:0.15rem;">
                Table {{ tableNumberLabel }} · {{ createdLabel }}
              </div>
            </div>
            <div :style="statusPillStyle">{{ statusLabel }}</div>
          </div>
          <div style="margin-top:0.75rem;border-top:1px solid rgba(111,78,55,0.1);padding-top:0.7rem;display:flex;flex-direction:column;gap:0.35rem;">
            <div v-for="it in (activeOrder.items || [])" :key="it.id" style="display:flex;justify-content:space-between;gap:0.75rem;color:#6B5744;font-weight:900;">
              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                {{ it.name }} <span style="color:#9C8E84;font-weight:900;">x{{ it.qty }}</span>
              </div>
              <div style="color:#4A3423;">&#8377;{{ Math.round(Number(it.unit_price||0) * Number(it.qty||0)) }}</div>
            </div>
          </div>
        </div>

        <div style="background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;padding:1rem 0.95rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);">
          <div style="font-weight:900;margin-bottom:0.75rem;">Order Progress</div>

          <div style="display:flex;flex-direction:column;gap:0.65rem;">
            <div v-for="s in steps" :key="s.key" style="display:flex;align-items:center;gap:0.65rem;">
              <div :style="dotStyle(s.key)"></div>
              <div style="flex:1;">
                <div style="font-weight:900;">{{ s.label }}</div>
                <div style="color:#9C8E84;font-weight:800;font-size:0.78rem;">{{ s.help }}</div>
              </div>
              <i v-if="isStepDone(s.key)" class="bi bi-check2-circle" style="color:#2A9D8F;font-size:1.1rem;"></i>
            </div>
          </div>

          <div style="margin-top:0.85rem;color:#9C8E84;font-weight:800;font-size:0.78rem;text-align:center;">
            Tip: If you ordered in multiple batches, tap a batch above to track it.
          </div>
        </div>

        <button
          @click="$emit('request-close')"
          :disabled="!!activeOrder?.close_requested || !canRequestClose"
          style="margin-top:0.85rem;width:100%;border:none;border-radius:1rem;padding:0.95rem 1rem;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;"
          :style="closeBtnStyle"
          title="Request waiter for payment / bill closing"
        >
          <span v-if="activeOrder?.close_requested">Waiter Notified</span>
          <span v-else-if="!canRequestClose">Wait Until All Items Delivered</span>
          <span v-else>Request To Close Order</span>
        </button>
      </div>
    </div>
  `,
  setup(props) {
    const tableNumberLabel = computed(() => {
      const n = props.session && props.session.table_number;
      return (n === 0 || n) ? String(n) : '-';
    });

    const createdLabel = computed(() => {
      try {
        const d = new Date(props.activeOrder?.created_at);
        return d.toLocaleString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    });

    const statusLabel = computed(() => statusText(props.activeOrder?.status || 'sent'));
    const statusPillStyle = computed(() => pillStyle(props.activeOrder?.status || 'sent'));

    const steps = [
      { key: 'sent', label: 'Sent', help: 'Order sent to the kitchen' },
      { key: 'accepted', label: 'Accepted', help: 'Kitchen accepted your order' },
      { key: 'ready', label: 'Ready', help: 'Food is ready for serving' },
      { key: 'delivered', label: 'Delivered', help: 'Order delivered to your table' }
    ];

    const stepIndex = (key) => steps.findIndex((s) => s.key === key);
    const currentIndex = computed(() => {
      const s = String(props.activeOrder?.status || 'sent');
      const idx = stepIndex(s);
      return idx >= 0 ? idx : 0;
    });

    const isStepDone = (key) => stepIndex(key) <= currentIndex.value;

    const dotStyle = (key) => {
      const done = isStepDone(key);
      if (done) {
        return 'width:14px;height:14px;border-radius:999px;background:#2A9D8F;box-shadow:0 0 0 4px rgba(42,157,143,0.14);';
      }
      return 'width:14px;height:14px;border-radius:999px;background:#E5DDD5;';
    };

    function statusText(s) {
      const v = String(s || 'sent');
      if (v === 'accepted') return 'Accepted';
      if (v === 'ready') return 'Ready';
      if (v === 'delivered') return 'Delivered';
      return 'Sent';
    }

    function pillStyle(s) {
      const v = String(s || 'sent');
      if (v === 'delivered') return 'background:rgba(42,157,143,0.16);color:#2A9D8F;font-weight:900;font-size:0.78rem;padding:0.25rem 0.55rem;border-radius:999px;';
      if (v === 'ready') return 'background:rgba(244,162,97,0.16);color:#C25A1A;font-weight:900;font-size:0.78rem;padding:0.25rem 0.55rem;border-radius:999px;';
      if (v === 'accepted') return 'background:rgba(58,175,169,0.16);color:#2A8F8A;font-weight:900;font-size:0.78rem;padding:0.25rem 0.55rem;border-radius:999px;';
      return 'background:rgba(111,78,55,0.12);color:#6F4E37;font-weight:900;font-size:0.78rem;padding:0.25rem 0.55rem;border-radius:999px;';
    }

    const timeLabel = (iso) => {
      try {
        const d = new Date(iso);
        return d.toLocaleString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    };

    const batchTotal = (b) => {
      const items = b?.items || [];
      const s = items.reduce((sum, it) => sum + (Number(it.unit_price || 0) * Number(it.qty || 0)), 0);
      return Math.round(s);
    };

    const itemsSummary = (b) => {
      const items = b?.items || [];
      if (!items.length) return 'No items';
      const first = items[0];
      const rest = items.length - 1;
      if (rest <= 0) return `${first.name} x${first.qty}`;
      return `${first.name} x${first.qty} +${rest} more`;
    };

    const batchCardStyle = (b) => {
      const selected = String(props.activeOrder?.id) === String(b?.id);
      if (selected) {
        return 'background:white;border:2px solid rgba(244,162,97,0.65);border-radius:1.1rem;padding:0.9rem 0.95rem;box-shadow:0 10px 22px rgba(74,52,35,0.14);cursor:pointer;';
      }
      return 'background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;padding:0.9rem 0.95rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);cursor:pointer;';
    };

    const closeBtnStyle = computed(() => {
      const requested = !!props.activeOrder?.close_requested;
      if (requested) return 'background:rgba(58,175,169,0.14);color:#2A8F8A;cursor:not-allowed;';
      if (!props.canRequestClose) return 'background:rgba(111,78,55,0.10);color:#6B5744;cursor:not-allowed;';
      return 'background:#6F4E37;color:white;';
    });

    return {
      tableNumberLabel,
      createdLabel,
      statusLabel,
      statusPillStyle,
      steps,
      isStepDone,
      dotStyle,
      statusText,
      pillStyle,
      timeLabel,
      batchTotal,
      itemsSummary,
      batchCardStyle,
      closeBtnStyle
    };
  }
};
