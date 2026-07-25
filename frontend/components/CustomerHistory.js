const { computed } = Vue;

export default {
  props: {
    session: { type: Object, default: null },
    history: { type: Array, default: () => [] }
  },
  emits: ['reorder'],
  template: `
    <div style="padding:1rem 1rem 1.25rem;">
      <div v-if="history.length===0" style="background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;padding:1.1rem 1rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);text-align:center;">
        <div style="width:58px;height:58px;border-radius:18px;background:rgba(244,162,97,0.16);display:flex;align-items:center;justify-content:center;margin:0 auto 0.85rem;">
          <i class="bi bi-clock-history" style="color:#C25A1A;font-size:1.5rem;"></i>
        </div>
        <div style="font-weight:900;font-size:1.05rem;">No order history</div>
        <div style="color:#9C8E84;font-weight:800;font-size:0.84rem;margin-top:0.35rem;">
          Your past orders will appear here.
        </div>
      </div>

      <div v-else style="display:flex;flex-direction:column;gap:0.85rem;">
        <div v-for="o in history" :key="o.id" style="background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);padding:0.95rem 0.95rem;">
          <div style="display:flex;justify-content:space-between;gap:0.75rem;align-items:flex-start;">
            <div style="min-width:0;">
              <div style="font-weight:900;letter-spacing:0.02em;">{{ o.id }}</div>
              <div style="color:#9C8E84;font-weight:800;font-size:0.78rem;margin-top:0.15rem;">
                {{ whenLabel(o.created_at) }} · Table {{ tableNumberFor(o) }}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-family:'Playfair Display',serif;font-weight:900;font-size:1.35rem;color:#4A3423;">&#8377;{{ orderTotal(o) }}</div>
              <div :style="pillStyle(o.status)" style="margin-top:0.25rem;">{{ statusLabel(o.status) }}</div>
            </div>
          </div>

          <div style="margin-top:0.7rem;border-top:1px solid rgba(111,78,55,0.1);padding-top:0.7rem;display:flex;flex-direction:column;gap:0.45rem;">
            <div v-for="it in (o.items || [])" :key="it.id" style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;">
              <div style="display:flex;align-items:center;gap:0.55rem;min-width:0;">
                <div style="width:26px;height:26px;border-radius:10px;background:#F0EBE3;display:flex;align-items:center;justify-content:center;color:#6F4E37;flex-shrink:0;">
                  <i class="bi bi-egg-fried" style="font-size:0.85rem;"></i>
                </div>
                <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ it.name }}</div>
                <div style="color:#9C8E84;font-weight:900;">x{{ it.qty }}</div>
              </div>
              <div style="color:#6B5744;font-weight:900;">&#8377;{{ Math.round(Number(it.unit_price||0) * Number(it.qty||0)) }}</div>
            </div>
          </div>

          <button @click="$emit('reorder', o)"
                  style="margin-top:0.8rem;width:100%;border:1.5px solid rgba(74,52,35,0.65);background:transparent;border-radius:0.95rem;padding:0.7rem 0.9rem;font-weight:900;cursor:pointer;color:#4A3423;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
            <i class="bi bi-arrow-repeat"></i> Reorder
          </button>
        </div>
      </div>
    </div>
  `,
  setup(props) {
    const statusLabel = (s) => {
      const v = String(s || 'sent');
      if (v === 'delivered') return 'Delivered';
      if (v === 'ready') return 'Ready';
      if (v === 'accepted') return 'Accepted';
      return 'Sent';
    };

    const pillStyle = (s) => {
      const v = String(s || 'sent');
      if (v === 'delivered') return 'display:inline-block;background:rgba(42,157,143,0.16);color:#2A9D8F;font-weight:900;font-size:0.75rem;padding:0.22rem 0.55rem;border-radius:999px;';
      if (v === 'ready') return 'display:inline-block;background:rgba(244,162,97,0.16);color:#C25A1A;font-weight:900;font-size:0.75rem;padding:0.22rem 0.55rem;border-radius:999px;';
      if (v === 'accepted') return 'display:inline-block;background:rgba(58,175,169,0.16);color:#2A8F8A;font-weight:900;font-size:0.75rem;padding:0.22rem 0.55rem;border-radius:999px;';
      return 'display:inline-block;background:rgba(111,78,55,0.12);color:#6F4E37;font-weight:900;font-size:0.75rem;padding:0.22rem 0.55rem;border-radius:999px;';
    };

    const whenLabel = (iso) => {
      try {
        const d = new Date(iso);
        return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    };

    const orderTotal = (o) => {
      const items = o?.items || [];
      const s = items.reduce((sum, it) => sum + (Number(it.unit_price || 0) * Number(it.qty || 0)), 0);
      const gst = s * 0.05;
      return Math.round(s + gst);
    };

    const tableNumberFor = (o) => {
      const orderN = o && (o.table_number === 0 || o.table_number) ? o.table_number : null;
      const n = (orderN === 0 || orderN) ? orderN : (props.session ? props.session.table_number : null);
      return (n === 0 || n) ? String(n) : '-';
    };

    return { statusLabel, pillStyle, whenLabel, orderTotal, tableNumberFor };
  }
};
