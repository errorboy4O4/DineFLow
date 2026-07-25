import CustomerTables from './CustomerTables.js';
import CustomerMenu from './CustomerMenu.js';
import CustomerCart from './CustomerCart.js';
import CustomerTrack from './CustomerTrack.js';
import CustomerHistory from './CustomerHistory.js';
import CustomerAI from './CustomerAI.js';
import api from '../js/api.js';

const { ref, computed, watch, onBeforeUnmount } = Vue;

function getParams() {
  const u = new URL(window.location.href);
  return {
    table: u.searchParams.get('table'),
    token: u.searchParams.get('token'),
  };
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function genOrderId() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `ORD-${yyyy}${mm}${dd}-${rand}`;
}

function storageKeys(tableToken) {
  const t = (tableToken || 'no_table').trim();
  return {
    cart: `dineflow_customer:${t}:cart`,
    active: `dineflow_customer:${t}:active_order`,
    history: `dineflow_customer:${t}:history`,
    close: `dineflow_customer:${t}:close_request`,
  };
}

function normalizeBatchToUi(batch, fallbackTableNumber) {
  if (!batch) return null;
  const id = batch.batch_id ?? batch.id ?? null;
  if (!id) return null;
  return {
    id: id,
    order_id: batch.order_id ?? null,
    close_requested: false, // logic-only; we overlay from localStorage
    status: batch.status || 'sent',
    created_at: batch.created_at || new Date().toISOString(),
    table_number: batch.table_number ?? fallbackTableNumber,
    items: (batch.items || []).map((it) => ({
      id: it.dish_id ?? it.id,
      name: it.name || it.dish || 'Dish',
      qty: Number(it.qty ?? it.quantity ?? 0),
      unit_price: Number(it.unit_price ?? it.price ?? 0)
    }))
  };
}

export default {
  errorCaptured(err, instance, info) {
    try {
      const msg = (err && (err.message || err.toString())) ? (err.message || err.toString()) : (info || 'Unknown error');
      this.childError = String(msg);
    } catch {}
    return false;
  },
  components: {
    CustomerTables,
    CustomerMenu,
    CustomerCart,
    CustomerTrack,
    CustomerHistory,
    CustomerAi: CustomerAI
  },
  template: `
    <div>
      <header class="topbar">
        <button v-if="screen !== 'tables'" class="btn-ghost" @click="goTables" title="Change table">
          <i class="bi bi-arrow-left"></i>
        </button>
        <div class="topbar-title">{{ headerTitle }}</div>
        <div v-if="session" style="font-weight:900;color:#6B5744;font-size:0.85rem;">
          Table {{ session.table_number }}
        </div>
        <button v-if="session" class="btn-ghost" @click="logoutTable" title="Change table">
          <i class="bi bi-x-lg"></i>
        </button>
      </header>

      <main class="page">
        <template v-if="screen === 'tables'">
          <customer-tables @table-selected="onTableSelected"></customer-tables>
        </template>
        <template v-else>
          <customer-menu
            v-if="tab === 'menu'"
            :session="session"
            :cart-count="cartCount"
            @add-to-cart="addToCart"
            @open-ai="openAi"
            @go-cart="tab = 'cart'"
          ></customer-menu>

          <customer-cart
            v-else-if="tab === 'cart'"
            :session="session"
            :items="cartItems"
            @update-qty="updateCartQty"
            @remove-item="removeCartItem"
            @clear-cart="clearCart"
            @place-order="placeOrder"
            @go-menu="tab = 'menu'"
          ></customer-cart>

          <customer-track
            v-else-if="tab === 'track'"
            :session="session"
            :active-orders="activeOrders"
            :active-order="activeOrder"
            :can-request-close="canRequestClose"
            @select-order="selectActiveOrder"
            @request-close="requestCloseOrder"
            @go-menu="tab = 'menu'"
          ></customer-track>

          <customer-history
            v-else-if="tab === 'history'"
            :session="session"
            :history="orderHistory"
            @reorder="reorderFromHistory"
          ></customer-history>

          <div v-else>
            <div v-if="childError" style="margin:1rem 0 0;background:#FEE2E2;border:1.5px solid #E63946;color:#991B1B;padding:0.75rem 0.9rem;border-radius:1rem;font-weight:900;">Customer UI error: {{ childError }}</div>
            <customer-ai :session="session" @close="closeAi" @order-created="onCustomOrderCreated"></customer-ai>
          </div>
        </template>
      </main>

      <nav v-if="screen !== 'tables'" class="bottom-nav">
        <button class="nav-btn" :class="{active: tab === 'menu'}" @click="tab = 'menu'">
          <i class="bi bi-grid-3x3-gap"></i>
          <span>Menu</span>
        </button>
        <button class="nav-btn" :class="{active: tab === 'cart'}" @click="tab = 'cart'">
          <i class="bi bi-bag"></i>
          <span>Cart</span>
          <span v-if="cartCount > 0" class="nav-badge">{{ cartCount }}</span>
        </button>
        <button class="nav-btn" :class="{active: tab === 'track'}" @click="tab = 'track'">
          <i class="bi bi-lightning-charge"></i>
          <span>Track</span>
        </button>
        <button class="nav-btn" :class="{active: tab === 'history'}" @click="tab = 'history'">
          <i class="bi bi-clock-history"></i>
          <span>History</span>
        </button>
      </nav>
    </div>
  `,
  setup() {
    const screen = ref('tables'); // tables | app
    const tab = ref('menu');      // menu | cart | track | history | ai
    const session = ref(null);    // { table_number, table_token }
    const childError = ref('');
    const lastTab = ref('menu');  // for returning from AI

    const cartItems = ref([]);    // [{ id, name, price, qty, photo_path }]
    const activeOrder = ref(null);
    const activeOrders = ref([]);
    const orderHistory = ref([]);
    const canRequestClose = ref(false);

    // Lightweight background polling for order state (no full page refresh; preserves cart/session).
    let ordersPollTimer = null;
    let _ordersPollInFlight = false;
    let _ordersPollBackoffMs = 0;

    const cartCount = computed(() => (cartItems.value || []).reduce((sum, it) => sum + Number(it.qty || 0), 0));

    const headerTitle = computed(() => {
      if (screen.value === 'tables') return 'Tables';
      if (tab.value === 'menu') return 'Menu';
      if (tab.value === 'cart') return 'Your Cart';
      if (tab.value === 'track') return 'Track Order';
      if (tab.value === 'history') return 'Order History';
      return 'AI Custom Dish';
    });

    const persist = () => {
      const token = session.value?.table_token;
      if (!token) return;
      const keys = storageKeys(token);
      try { localStorage.setItem(keys.cart, JSON.stringify(cartItems.value || [])); } catch {}
      try { localStorage.setItem(keys.active, JSON.stringify(activeOrder.value || null)); } catch {}
      try { localStorage.setItem(keys.history, JSON.stringify(orderHistory.value || [])); } catch {}
    };

    const hydrate = () => {
      const token = session.value?.table_token;
      if (!token) return;
      const keys = storageKeys(token);
      try { cartItems.value = safeJsonParse(localStorage.getItem(keys.cart), []) || []; } catch {}
      try { activeOrder.value = safeJsonParse(localStorage.getItem(keys.active), null); } catch {}
      try { orderHistory.value = safeJsonParse(localStorage.getItem(keys.history), []) || []; } catch {}
    };

    const getCloseRequestedFlag = () => {
      const token = session.value?.table_token;
      if (!token) return false;
      const keys = storageKeys(token);
      try { return localStorage.getItem(keys.close) === '1'; } catch { return false; }
    };

    const setCloseRequestedFlag = (v) => {
      const token = session.value?.table_token;
      if (!token) return;
      const keys = storageKeys(token);
      try {
        if (v) localStorage.setItem(keys.close, '1');
        else localStorage.removeItem(keys.close);
      } catch {}
    };

    const overlayCloseRequested = () => {
      const flag = getCloseRequestedFlag();
      if (activeOrder.value) activeOrder.value.close_requested = !!flag;
      activeOrders.value = (activeOrders.value || []).map((o) => ({ ...o, close_requested: !!flag }));
    };

    const refreshOrdersFromServer = async () => {
      const t = session.value;
      if (!t?.table_number || !t?.table_token) return;
      try {
        const [activeRes, histRes] = await Promise.all([
          api.getCustomerActiveOrder(t.table_number, t.table_token),
          api.getCustomerOrderHistory(t.table_number, t.table_token)
        ]);

        canRequestClose.value = !!activeRes?.can_request_close;

        const list = (activeRes?.active_orders || []).map((b) => normalizeBatchToUi(b, t.table_number)).filter(Boolean);
        const active = normalizeBatchToUi(activeRes?.active_order, t.table_number);
        const history = (histRes?.orders || []).map((b) => normalizeBatchToUi(b, t.table_number)).filter(Boolean);

        activeOrders.value = list;

        // Keep selection stable if possible.
        const selectedId = activeOrder.value?.id;
        const stillThere = selectedId ? list.find((o) => String(o.id) === String(selectedId)) : null;
        activeOrder.value = stillThere || (list[0] || active || null);

        orderHistory.value = history;
        overlayCloseRequested();
        persist();
      } catch (e) {
        console.error(e);
        if (e?.status === 401 && (e?.code === 'INVALID_TABLE' || String(e?.message || '').toLowerCase().includes('invalid table'))) {
          try { alert('Table session expired. Please select your table again.'); } catch {}
          logoutTable();
        }
      }
    };

    const startOrdersPolling = () => {
      if (ordersPollTimer) return;

      const loop = async () => {
        if (!ordersPollTimer) return;

        const t = session.value;
        const hasSession = !!(t?.table_number && t?.table_token);
        if (!hasSession || screen.value !== 'app') {
          ordersPollTimer = setTimeout(loop, 15000);
          return;
        }

        const visible = (typeof document !== 'undefined') ? (document.visibilityState === 'visible') : true;
        const focused = (typeof document !== 'undefined') ? document.hasFocus?.() : true;
        const isLive = visible && focused;
        const baseDelay = isLive
          ? (tab.value === 'track' ? 6000 : 12000)
          : 25000;
        const backoff = Math.min(60000, Math.max(0, Number(_ordersPollBackoffMs || 0) || 0));
        const nextDelay = baseDelay + backoff;

        if (_ordersPollInFlight) {
          ordersPollTimer = setTimeout(loop, nextDelay);
          return;
        }

        _ordersPollInFlight = true;
        try {
          await refreshOrdersFromServer();
          _ordersPollBackoffMs = 0;
        } catch {
          _ordersPollBackoffMs = Math.min(60000, (_ordersPollBackoffMs ? _ordersPollBackoffMs * 2 : 5000));
        } finally {
          _ordersPollInFlight = false;
        }

        if (!ordersPollTimer) return;
        ordersPollTimer = setTimeout(loop, nextDelay);
      };

      ordersPollTimer = setTimeout(loop, 2500);
    };

    const stopOrdersPolling = () => {
      if (!ordersPollTimer) return;
      clearTimeout(ordersPollTimer);
      ordersPollTimer = null;
    };

    const setupVisibilityKick = () => {
      const onVisible = () => {
        const t = session.value;
        if (!t?.table_number || !t?.table_token) return;
        if (screen.value !== 'app') return;
        if (typeof document === 'undefined') return;
        if (document.visibilityState !== 'visible') return;
        refreshOrdersFromServer();
      };
      try {
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
          document.removeEventListener('visibilitychange', onVisible);
          window.removeEventListener('focus', onVisible);
        };
      } catch {
        return () => {};
      }
    };

    const setSession = (t) => {
      session.value = { table_number: t.table_number, table_token: t.table_token };
      try { localStorage.setItem('customerTable', JSON.stringify(session.value)); } catch {}
      hydrate();
      refreshOrdersFromServer();
      startOrdersPolling();
    };

    const clearSession = () => {
      session.value = null;
      try { localStorage.removeItem('customerTable'); } catch {}
      cartItems.value = [];
      activeOrder.value = null;
      activeOrders.value = [];
      orderHistory.value = [];
      canRequestClose.value = false;
      stopOrdersPolling();
    };

    // If DB was recreated, stored table_token becomes invalid; force table re-select.
    try {
      window.addEventListener('dineflow:invalid-table', () => {
        try { alert('Table session expired. Please select your table again.'); } catch {}
        logoutTable();
      });
    } catch {}

    const onTableSelected = (t) => {
      setSession(t);
      screen.value = 'app';
      tab.value = 'menu';
    };

    const goTables = () => {
      screen.value = 'tables';
    };

    const logoutTable = () => {
      clearSession();
      screen.value = 'tables';
      tab.value = 'menu';
    };

    const addToCart = (dish) => {
      if (!dish) return;
      const id = dish.id;
      if (!id) return;
      const existing = (cartItems.value || []).find((x) => x.id === id);
      if (existing) {
        existing.qty = Number(existing.qty || 0) + 1;
      } else {
        cartItems.value = [
          ...(cartItems.value || []),
          {
            id,
            name: dish.name || 'Dish',
            price: Number(dish.price || 0),
            qty: 1,
            photo_path: dish.photo_path || '',
            category: dish.category || '',
            emoji: String(dish.emoji || dish.icon || '').trim()
          }
        ];
      }
      persist();
    };

    const updateCartQty = ({ id, qty }) => {
      const n = Number(qty || 0);
      cartItems.value = (cartItems.value || [])
        .map((it) => (it.id === id ? { ...it, qty: n } : it))
        .filter((it) => Number(it.qty || 0) > 0);
      persist();
    };

    const removeCartItem = (id) => {
      cartItems.value = (cartItems.value || []).filter((it) => it.id !== id);
      persist();
    };

    const clearCart = () => {
      cartItems.value = [];
      persist();
    };

    const placeOrder = ({ note } = {}) => {
      if ((cartItems.value || []).length === 0) return;
      const t = session.value;
      if (!t?.table_number || !t?.table_token) return;

      // New order invalidates any previous "close request".
      setCloseRequestedFlag(false);

      const payload = {
        table_number: t.table_number,
        table_token: t.table_token,
        note: String(note || ''),
        items: (cartItems.value || []).map((it) => ({
          dish_id: it.id,
          quantity: Number(it.qty || 0)
        }))
      };

      api.placeCustomerOrder(payload)
        .then((res) => {
          const created = normalizeBatchToUi(res?.batch, t.table_number);
          if (created) {
            activeOrder.value = created;
            activeOrders.value = [created, ...(activeOrders.value || [])]
              .filter((x, idx, arr) => arr.findIndex(y => String(y.id) === String(x.id)) === idx);
            orderHistory.value = [created, ...(orderHistory.value || [])]
              .filter((x, idx, arr) => arr.findIndex(y => y.id === x.id) === idx)
              .slice(0, 30);
            cartItems.value = [];
            persist();
            tab.value = 'track';
          }
          refreshOrdersFromServer();
        })
        .catch((e) => {
          console.error(e);
          // Fallback: keep local-only behavior if backend is unreachable.
          const order = {
            id: genOrderId(),
            table_number: t.table_number,
            status: 'sent',
            note: String(note || ''),
            created_at: new Date().toISOString(),
            items: (cartItems.value || []).map((it) => ({
              id: it.id,
              name: it.name,
              qty: Number(it.qty || 0),
              unit_price: Number(it.price || 0)
            }))
          };
          activeOrder.value = order;
          activeOrders.value = [order, ...(activeOrders.value || [])].slice(0, 10);
          orderHistory.value = [order, ...(orderHistory.value || [])].slice(0, 30);
          cartItems.value = [];
          persist();
          tab.value = 'track';
          alert(e?.message || 'Failed to place order');
        });
    };

    const selectActiveOrder = (orderId) => {
      const id = orderId?.id ?? orderId;
      const found = (activeOrders.value || []).find((o) => String(o.id) === String(id));
      if (found) {
        activeOrder.value = found;
        persist();
      }
    };

    const requestCloseOrder = async () => {
      const t = session.value;
      if (!t?.table_number || !t?.table_token) return;
      if (!canRequestClose.value) {
        alert('You can request bill close only after all items are delivered.');
        return;
      }
      try {
        await api.requestCustomerCloseOrder(t.table_number, t.table_token);
        setCloseRequestedFlag(true);
        await refreshOrdersFromServer();
        alert('Waiter has been notified for bill closing.');
      } catch (e) {
        console.error(e);
        alert(e?.message || 'Failed to request close');
      }
    };

    const reorderFromHistory = (order) => {
      const items = order?.items || [];
      if (items.length === 0) return;
      for (const it of items) {
        if (!it?.id) continue;
        const dish = { id: it.id, name: it.name, price: it.unit_price };
        const qty = Math.max(1, Number(it.qty || 1));
        for (let i = 0; i < qty; i++) addToCart(dish);
      }
      tab.value = 'cart';
    };

    const openAi = () => {
      if (tab.value !== 'ai') lastTab.value = tab.value;
      tab.value = 'ai';
    };

    const closeAi = () => {
      tab.value = lastTab.value || 'menu';
    };

    const onCustomOrderCreated = (batch) => {
      const t = session.value;
      const created = normalizeBatchToUi(batch, t?.table_number);
      if (!created) {
        refreshOrdersFromServer();
        return;
      }
      activeOrder.value = created;
      activeOrders.value = [created, ...(activeOrders.value || [])]
        .filter((x, idx, arr) => arr.findIndex(y => String(y.id) === String(x.id)) === idx);
      orderHistory.value = [created, ...(orderHistory.value || [])]
        .filter((x, idx, arr) => arr.findIndex(y => String(y.id) === String(x.id)) === idx)
        .slice(0, 30);
      persist();
      refreshOrdersFromServer();
    };

    // Bootstrap: query params (QR) > localStorage
    try {
      const { table, token } = getParams();
      if (table && token) {
        setSession({ table_number: Number(table), table_token: token });
        screen.value = 'app';
        tab.value = 'menu';
      } else {
        const cached = localStorage.getItem('customerTable');
        if (cached) {
          session.value = safeJsonParse(cached, null);
          if (session.value?.table_token) hydrate();
          screen.value = 'app';
          tab.value = 'menu';
          refreshOrdersFromServer();
          startOrdersPolling();
        }
      }
    } catch {}

    // Start/stop polling as user enters/leaves the app screen.
    watch(screen, (v) => {
      if (v === 'app') startOrdersPolling();
      else stopOrdersPolling();
    });

    const teardownVis = setupVisibilityKick();
    onBeforeUnmount(() => {
      try { teardownVis && teardownVis(); } catch {}
      stopOrdersPolling();
    });

    return {
      screen,
      tab,
      session,
      childError,
      cartItems,
      cartCount,
      activeOrder,
      activeOrders,
      orderHistory,
      canRequestClose,
      headerTitle,
      onTableSelected,
      goTables,
      logoutTable,
      addToCart,
      updateCartQty,
      removeCartItem,
      clearCart,
      placeOrder,
      reorderFromHistory,
      selectActiveOrder,
      requestCloseOrder,
      openAi,
      closeAi,
      onCustomOrderCreated
    };
  }
};

