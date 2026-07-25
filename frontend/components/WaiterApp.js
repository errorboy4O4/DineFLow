import api from '../js/api.js';
import WaiterTables from './WaiterTables.js';
import WaiterOrders from './WaiterOrders.js';

const { ref, computed, onMounted, onBeforeUnmount } = Vue;

export default {
  components: { WaiterTables, WaiterOrders },
  template: `
    <div style="display:flex;flex-direction:column;min-height:100vh;">
      <!-- Header -->
      <div class="w-header">
        <div class="w-avatar">{{ initials }}</div>
        <div>
          <div class="w-name">Waiter</div>
          <div class="w-role">{{ floor }}</div>
        </div>
        <div class="w-shift">{{ shiftTime }}</div>
        <button class="w-notif" title="Refresh" @click="handleRefreshClick">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:rgba(248,245,240,0.86);">
            <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
            <path d="M21 3v6h-6"/>
          </svg>
        </button>
      </div>

      <div class="alert-banner" v-if="readyOrdersCount>0" @click="goTab('orders')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.95;">
          <path d="M12 22a2.2 2.2 0 0 0 2-2H10a2.2 2.2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.9V4a1 1 0 0 0-2 0v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
        <span>{{ readyOrdersCount }} order<span v-if="readyOrdersCount!==1">s</span> ready for pickup at kitchen!</span>
        <span style="margin-left:auto;opacity:0.9;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </span>
      </div>

      <!-- Tabs -->
      <div class="w-tabs">
        <div class="w-tab" :class="{active: tab==='tables'}" @click="goTab('tables')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 0.2rem;display:block;">
            <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>
          </svg>
          Tables
        </div>
        <div class="w-tab" :class="{active: tab==='orders'}" @click="goTab('orders')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 0.2rem;display:block;">
            <path d="M6 2h12v20l-2-1-2 1-2-1-2 1-2-1-2 1V2z"/>
            <path d="M9 6h6M9 10h6M9 14h5"/>
          </svg>
          Orders
          <span v-if="readyOrdersCount>0" class="w-tab-badge">{{ readyOrdersCount }}</span>
        </div>
      </div>

      <!-- Main -->
      <div class="w-content">
        <div v-if="view==='bill'" class="w-section">
          <div class="bill-top">
            <button class="bill-back" @click="closeBill" title="Back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <div class="bill-title">Bill - Table {{ bill?.table_number }}</div>
            <div class="bill-chip">Table {{ bill?.table_number }}</div>
          </div>

          <div v-if="billLoading" class="panel" style="padding:1rem;font-weight:900;color:#6B5744;">
            Loading bill...
          </div>
          <div v-else-if="billError" class="panel" style="padding:1rem;font-weight:900;color:#991B1B;">
            {{ billError }}
          </div>
          <template v-else>
            <div class="panel bill-card">
              <div class="bill-brand">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                  <div style="width:34px;height:34px;border-radius:14px;background:#F0EBE3;display:flex;align-items:center;justify-content:center;color:#6F4E37;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 8h13v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/>
                      <path d="M16 10h2a3 3 0 0 1 0 6h-2"/>
                      <path d="M6 2c1 1 1 2 0 3s-1 2 0 3"/>
                      <path d="M10 2c1 1 1 2 0 3s-1 2 0 3"/>
                    </svg>
                  </div>
                  <div>
                    <div style="font-weight:900;font-size:1rem;">{{ (bill?.restaurant?.show_restaurant_name === false) ? 'Bill' : (bill?.restaurant?.restaurant_name || 'DineFlow Kitchen') }}</div>
                    <div style="font-size:0.72rem;color:#9C8E84;font-weight:800;line-height:1.35;">
                      <div v-if="bill?.restaurant?.show_address && bill?.restaurant?.address">{{ bill.restaurant.address }}</div>
                      <div v-if="bill?.restaurant?.show_gstin && bill?.restaurant?.gstin">GSTIN: {{ bill.restaurant.gstin }}</div>
                      <div v-if="bill?.restaurant?.show_phone && bill?.restaurant?.phone_number">Phone: {{ bill.restaurant.phone_number }}</div>
                    </div>
                  </div>
                </div>
                <div class="bill-meta">
                  <div><span>Table</span><b>{{ bill.table_number }}</b></div>
                  <div><span>Time</span><b>{{ billTimeLabel }}</b></div>
                </div>
              </div>

              <div class="bill-items">
                <div class="bill-items-head">
                  <div>Item</div><div style="text-align:center;">Qty</div><div style="text-align:right;">Amount</div>
                </div>
                <div v-if="(bill.items||[]).length===0" class="bill-items-empty">
                  No items found for this table
                </div>
                <div v-else>
                  <div v-for="it in bill.items" :key="it.name" class="bill-item-row">
                    <div class="bill-item-name">{{ it.name }}</div>
                    <div class="bill-item-qty">{{ it.qty }}</div>
                    <div class="bill-item-amt">&#8377;{{ Math.round(Number(it.amount||0)) }}</div>
                  </div>
                </div>
              </div>

              <div class="bill-sum">
                <div class="sum-row"><span>Subtotal</span><b>&#8377;{{ Math.round(Number(bill.subtotal||0)) }}</b></div>
                <div class="sum-row"><span>GST ({{ Math.round(Number(bill?.restaurant?.gst_rate || 5)) }}%)</span><b>&#8377;{{ Math.round(Number(bill.gst||0)) }}</b></div>
                <div class="sum-total"><span>Total</span><b>&#8377;{{ Math.round(Number(bill.total||0)) }}</b></div>
              </div>
            </div>

            <div v-if="bill?.restaurant?.bill_terms" class="panel" style="padding:0.75rem 0.9rem;margin-top:0.75rem;font-weight:800;color:#6B5744;font-size:0.82rem;line-height:1.45;">
              <b style="color:#1A1208;">Terms:</b> {{ bill.restaurant.bill_terms }}
            </div>

            <button class="pay-btn" @click="showPay=true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"/>
                <path d="M14 14h3v3h-3zM17 17h4v4h-4zM14 17h3v4h-3z"/>
              </svg>
              Pay - &#8377;{{ Math.round(Number(bill.total||0)) }}
            </button>
            <div style="text-align:center;color:#9C8E84;font-weight:800;font-size:0.75rem;margin-top:0.6rem;">
              Close popup to collect cash payment
            </div>
          </template>
        </div>

        <template v-else>
          <waiter-tables
            v-if="tab==='tables'"
            :tables="tables"
            @table-click="handleTableClick"
          />

          <waiter-orders
            v-else
            :ready-items="readyItems"
            :served="served"
            @deliver="deliverItem"
            @open-bill="openBill"
          />

          <div v-if="loading" class="w-section">
            <div class="panel" style="padding:0.85rem 1rem;font-weight:900;color:#6B5744;">
              Loading...
            </div>
          </div>
          <div v-if="error" class="w-section">
            <div class="panel" style="padding:0.85rem 1rem;font-weight:900;color:#991B1B;">
              {{ error }}
            </div>
          </div>
        </template>
      </div>

      <!-- Pay modal -->
      <div v-if="showPay" class="pay-overlay" @click.self="showPay=false">
        <div class="pay-card">
          <div class="pay-head">
            <div style="font-family:'Playfair Display',serif;font-weight:900;font-size:1.2rem;">Scan to Pay</div>
            <button class="pay-close" @click="showPay=false" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="pay-sub">Table {{ bill?.table_number }} · &#8377;{{ Math.round(Number(bill?.total||0)) }}</div>

          <div class="qr-box">
            <img :src="qrSrc" alt="QR" style="width:220px;height:220px;display:block;" />
          </div>
          <div class="pay-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#6B5744;">
              <path d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13"/>
              <path d="M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11"/>
            </svg>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ payUrl }}</span>
          </div>

          <button class="pay-confirm" @click="confirmPaid('UPI')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.1V12a10 10 0 1 1-6-9.1"/>
              <path d="M22 4 12 14l-3-3"/>
            </svg>
            Confirm Payment Received
          </button>
          <button class="pay-cash" @click="confirmPaid('Cash')">Close (Cash Payment)</button>
        </div>
      </div>

      <!-- Toasts -->
      <div class="toast-wrap">
        <div v-for="t in toasts" :key="t.id" class="toast">
          <span class="t-ic">{{ t.icon }}</span>
          <span class="t-msg">{{ t.message }}</span>
        </div>
      </div>
    </div>
  `,
  setup() {
    const tab = ref('tables');
    const view = ref('main'); // main | bill
    const loading = ref(false);
    const error = ref('');

    const floor = ref('Floor A');
    const shiftTime = ref('6PM - 11PM');

    const tables = ref([]);
    const readyItems = ref([]);
    const served = ref([]);

    const bill = ref(null);
    const billLoading = ref(false);
    const billError = ref('');
    const showPay = ref(false);

    const toasts = ref([]);
    let toastCounter = 1;

    const readyItemsCount = computed(() => (readyItems.value || []).length);
    const readyOrdersCount = computed(() => {
      const items = readyItems.value || [];
      const batchIds = items.map((x) => x?.batch_id).filter((x) => x !== null && x !== undefined);
      if (batchIds.length > 0) return new Set(batchIds).size;
      const tables = items.map((x) => x?.table_number).filter((x) => x !== null && x !== undefined);
      if (tables.length > 0) return new Set(tables).size;
      return items.length;
    });
    const initials = computed(() => 'W');

    const payUrl = computed(() => {
      const n = bill.value?.table_number;
      if (!n) return '';
      return `https://dineflow.in/pay/table${n}`;
    });

    const qrSrc = computed(() => {
      const uploaded = bill.value?.restaurant?.qr_image_path;
      if (uploaded) return uploaded;
      const url = payUrl.value || 'https://dineflow.in/pay';
      return `https://chart.googleapis.com/chart?cht=qr&chs=220x220&chl=${encodeURIComponent(url)}`;
    });

    const billTimeLabel = computed(() => {
      try {
        const iso = bill.value?.order?.created_at;
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    });

    const showToast = (message, icon = '✅') => {
      const id = toastCounter++;
      toasts.value = [...(toasts.value || []), { id, message, icon }];
      setTimeout(() => {
        toasts.value = (toasts.value || []).filter((x) => x.id !== id);
      }, 2400);
    };

    const loadAll = async () => {
      loading.value = true;
      error.value = '';
      try {
        const [tRes, rRes, sRes] = await Promise.all([
          api.getWaiterTablesStatus(),
          api.getWaiterReadyItems(),
          api.getWaiterServedToday()
        ]);
        tables.value = tRes.tables || [];
        readyItems.value = rRes.ready_items || [];
        served.value = sRes.served || [];
      } catch (e) {
        error.value = e?.message || 'Failed to load waiter data';
      } finally {
        loading.value = false;
      }
    };

    let _manualRefreshInFlight = false;
    const handleRefreshClick = async () => {
      if (_manualRefreshInFlight) return;
      _manualRefreshInFlight = true;
      try {
        await loadAll();
        showToast('Refreshed', '🔄');
      } catch (e) {
        showToast(e?.message || 'Refresh failed', 'âš ');
      } finally {
        _manualRefreshInFlight = false;
      }
    };

    const openBill = async (tableNumber) => {
      billLoading.value = true;
      billError.value = '';
      view.value = 'bill';
      showPay.value = false;
      try {
        const res = await api.getWaiterBill(tableNumber);
        bill.value = res;
      } catch (e) {
        billError.value = e?.message || 'Failed to load bill';
        bill.value = null;
      } finally {
        billLoading.value = false;
      }
    };

    const closeBill = () => {
      view.value = 'main';
      bill.value = null;
      showPay.value = false;
    };

const goTab = (t) => {
      tab.value = t;
      if (view.value === 'bill') closeBill();
    };

    const handleTableClick = (t) => {
      if (!t) return;
      if (t.status === 'free') {
        showToast(`Table ${t.table_number} is free`, '🪑');
        return;
      }
      openBill(t.table_number);
    };

    const deliverItem = async (it) => {
      if (!it?.item_id) return;
      try {
        await api.deliverWaiterItem(it.item_id);
        showToast(`Delivered to Table ${it.table_number}`, '🍽');
        await loadAll();
      } catch (e) {
        showToast(e?.message || 'Deliver failed', '⚠');
      }
    };

    const confirmPaid = async (method = 'Cash') => {
      const n = bill.value?.table_number;
      if (!n) return;
      try {
        await api.closeWaiterTable(n, method);
        showToast(`Table ${n} closed (${method})`, '💳');
        showPay.value = false;
        closeBill();
        await loadAll();
      } catch (e) {
        showToast(e?.message || 'Close table failed', '⚠');
      }
    };

    let pollTimer = null;
    onMounted(() => {
      loadAll();
      pollTimer = setInterval(loadAll, 5000);
    });
    onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer); });

    return {
      tab,
      view,
      loading,
      error,
      floor,
      shiftTime,
      initials,
      tables,
      readyItems,
      served,
      readyItemsCount,
      readyOrdersCount,
      bill,
      billLoading,
      billError,
      billTimeLabel,
      showPay,
      payUrl,
      qrSrc,
      loadAll,
      handleRefreshClick,
      handleTableClick,
      openBill,
      closeBill,
      goTab,
      deliverItem,
      confirmPaid,
      toasts
    };
  }
};
