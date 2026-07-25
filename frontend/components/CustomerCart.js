const { ref, computed, watch } = Vue;

export default {
  props: {
    session: { type: Object, default: null },
    items: { type: Array, default: () => [] }
  },
  emits: ['update-qty', 'remove-item', 'clear-cart', 'place-order', 'go-menu'],
  template: `
    <div style="padding:1rem 1rem 1.25rem;">
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.9rem;">
        <button @click="$emit('go-menu')" title="Back"
                style="width:44px;height:44px;border-radius:0.9rem;border:1.5px solid #E5DDD5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6F4E37" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div style="flex:1;">
          <div style="font-family:'Playfair Display',serif;font-weight:900;font-size:1.55rem;line-height:1.05;">Your Cart</div>
          <div style="color:#9C8E84;font-weight:800;font-size:0.82rem;margin-top:0.2rem;">{{ itemCount }} items</div>
        </div>
        <button v-if="items.length>0" @click="$emit('clear-cart')" title="Clear cart"
                style="width:44px;height:44px;border-radius:0.9rem;border:1.5px solid #F3C7CB;background:#FEE2E2;display:flex;align-items:center;justify-content:center;cursor:pointer;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E63946" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/>
            <path d="M8 6V4h8v2"/>
            <path d="M6 6l1 16h10l1-16"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
          </svg>
        </button>
      </div>

      <div style="background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;padding:0.9rem 0.95rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);display:flex;align-items:center;gap:0.8rem;margin-bottom:0.85rem;">
        <div style="width:42px;height:42px;border-radius:0.95rem;background:#F0EBE3;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6F4E37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
            <path d="M3 17v2a2 2 0 0 0 2 2h2"/>
            <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
            <path d="M17 21h2a2 2 0 0 0 2-2v-2"/>
            <path d="M7 7h3v3H7z"/>
            <path d="M14 7h3v3h-3z"/>
            <path d="M7 14h3v3H7z"/>
            <path d="M14 14h1"/>
            <path d="M14 17h3"/>
            <path d="M17 14v3"/>
          </svg>
        </div>
        <div style="flex:1;">
          <div style="font-weight:900;">Table {{ tableNumberLabel }}</div>
          <div style="color:#9C8E84;font-weight:800;font-size:0.78rem;">DineFlow Kitchen</div>
        </div>
        <div style="background:rgba(58,175,169,0.16);color:#2A8F8A;font-weight:900;font-size:0.75rem;padding:0.25rem 0.55rem;border-radius:999px;">Active</div>
      </div>

      <div v-if="items.length===0" style="padding:1rem;text-align:center;color:#6B5744;font-weight:900;background:#FAFAF7;border:1.5px solid #E5DDD5;border-radius:1rem;">
        Your cart is empty. Add some dishes from the menu.
      </div>

      <div v-else style="background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);overflow:hidden;margin-bottom:0.85rem;">
        <div v-for="it in items" :key="it.id" style="padding:0.85rem 0.95rem;display:grid;grid-template-columns:42px minmax(0,1fr);gap:0.8rem;border-bottom:1px solid rgba(111,78,55,0.08);">
          <div style="width:42px;height:42px;border-radius:0.95rem;background:#F0EBE3;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
            <img v-if="it.photo_path" :src="photoSrc(it.photo_path)" :alt="it.name" style="width:100%;height:100%;object-fit:cover;display:block;" />
            <span v-else style="font-size:1.2rem;line-height:1;color:#6F4E37;">{{ dishEmoji(it) }}</span>
          </div>

          <div style="min-width:0;">
            <div style="display:flex;align-items:flex-start;gap:0.75rem;">
              <div style="flex:1;min-width:0;">
                <div style="font-weight:900;line-height:1.12;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ it.name }}</div>
                <div style="color:#9C8E84;font-weight:900;font-size:0.78rem;margin-top:0.18rem;white-space:nowrap;">
                  &#8377;{{ unitPrice(it).toFixed(0) }} each
                </div>
              </div>
              <div style="font-weight:900;color:#4A3423;white-space:nowrap;min-width:56px;text-align:right;">
                &#8377;{{ lineTotal(it) }}
              </div>
            </div>

            <div style="margin-top:0.65rem;display:flex;align-items:center;justify-content:flex-end;gap:0.6rem;">
              <div style="display:flex;align-items:center;gap:0.5rem;">
                <button @click="dec(it)" title="Decrease"
                        style="width:34px;height:34px;border:none;border-radius:999px;background:#EFEAE3;color:#4A3423;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:900;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
                    <path d="M6 12h12"/>
                  </svg>
                </button>
                <div style="min-width:22px;text-align:center;font-weight:900;">{{ it.qty }}</div>
                <button @click="inc(it)" title="Increase"
                        style="width:34px;height:34px;border:none;border-radius:999px;background:#4A3423;color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:900;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
                    <path d="M12 6v12"/>
                    <path d="M6 12h12"/>
                  </svg>
                </button>
              </div>

              <button @click="$emit('remove-item', it.id)" title="Remove"
                      style="width:40px;height:40px;border:none;border-radius:0.9rem;background:#FEE2E2;color:#E63946;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 6h18"/>
                  <path d="M8 6V4h8v2"/>
                  <path d="M6 6l1 16h10l1-16"/>
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style="background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);padding:0.9rem 0.95rem;margin-bottom:0.85rem;">
        <div style="display:flex;align-items:center;gap:0.55rem;margin-bottom:0.6rem;">
          <i class="bi bi-pencil-square" style="color:#6F4E37;"></i>
          <div style="font-weight:900;">Order Note</div>
        </div>
        <textarea v-model="note" placeholder="Any requests for the kitchen?"
                  style="width:100%;min-height:72px;resize:none;padding:0.75rem 0.8rem;border:1.5px solid #E5DDD5;border-radius:0.95rem;background:#FAFAF7;font-weight:800;"></textarea>
      </div>

      <div style="background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);padding:0.9rem 0.95rem;">
        <div style="font-weight:900;margin-bottom:0.65rem;">Bill Summary</div>
        <div style="display:flex;justify-content:space-between;color:#6B5744;font-weight:800;margin-bottom:0.35rem;">
          <div>Subtotal ({{ itemCount }} items)</div><div>&#8377;{{ subtotal }}</div>
        </div>
        <div style="display:flex;justify-content:space-between;color:#6B5744;font-weight:800;margin-bottom:0.35rem;">
          <div>GST (5%)</div><div>&#8377;{{ gst }}</div>
        </div>
        <div style="padding-bottom:0.65rem;border-bottom:1px solid rgba(111,78,55,0.12);margin-bottom:0.65rem;"></div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <div style="font-weight:900;font-size:1.05rem;">Total</div>
          <div style="font-family:'Playfair Display',serif;font-weight:900;font-size:1.65rem;color:#4A3423;">&#8377;{{ total }}</div>
        </div>

        <button class="btn-primary" :disabled="items.length===0" @click="sendOrder"
                style="width:100%;margin-top:0.9rem;opacity:1;">
          <i class="bi bi-send"></i> Send To Kitchen
        </button>
        <div style="margin-top:0.55rem;color:#9C8E84;font-weight:800;font-size:0.78rem;text-align:center;">
          Demo flow: this saves a local order and opens the Track tab.
        </div>
      </div>
    </div>
  `,
  setup(props, { emit }) {
    const note = ref('');
    const tableNumberLabel = computed(() => {
      const n = props.session && props.session.table_number;
      return (n === 0 || n) ? String(n) : '-';
    });

    const itemCount = computed(() => (props.items || []).reduce((sum, it) => sum + Number(it.qty || 0), 0));

    const unitPrice = (it) => {
      const v = Number(
        it?.price ?? it?.unit_price ?? it?.unitPrice ?? it?.selling_price ?? it?.base_price ?? 0
      );
      return Number.isFinite(v) ? v : 0;
    };

    const subtotal = computed(() => {
      const s = (props.items || []).reduce((sum, it) => sum + (unitPrice(it) * Number(it.qty || 0)), 0);
      return Math.round(s);
    });
    const gst = computed(() => Math.round(subtotal.value * 0.05));
    const total = computed(() => Math.round(subtotal.value + gst.value));

    const lineTotal = (it) => Math.round(unitPrice(it) * Number(it.qty || 0));

    const inc = (it) => emit('update-qty', { id: it.id, qty: Number(it.qty || 0) + 1 });
    const dec = (it) => emit('update-qty', { id: it.id, qty: Number(it.qty || 0) - 1 });

    const photoSrc = (p) => {
      const path = String(p || '').trim();
      if (!path) return '';
      if (path.startsWith('http://') || path.startsWith('https://')) return path;
      if (path.startsWith('/')) return path;
      return `/${path}`;
    };

    const dishEmoji = (it) => {
      const explicit = String(it?.emoji || it?.icon || '').trim();
      if (explicit) return explicit;
      const c = String(it?.category || '').toLowerCase();
      if (c.includes('bread')) return '🥖';
      if (c.includes('beverage') || c.includes('drink')) return '🥤';
      if (c.includes('dessert')) return '🍨';
      if (c.includes('starter')) return '🥟';
      if (c.includes('thali')) return '🍱';
      if (c.includes('side')) return '🥗';
      return '🍽️';
    };

    const sendOrder = () => {
      emit('place-order', { note: note.value });
      note.value = '';
    };

    // Reset note if cart becomes empty after placing order.
    watch(
      () => (props.items || []).length,
      (len) => { if (len === 0) note.value = ''; }
    );

    return { note, itemCount, subtotal, gst, total, unitPrice, lineTotal, inc, dec, photoSrc, dishEmoji, sendOrder, tableNumberLabel };
  }
};
