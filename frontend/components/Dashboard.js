export default {
  emits: ["navigate"],
  props: [
    "inventory",
    "dishes",
    "pendingOrders",
    "lowStockItems",
    "outOfStock",
    "recentActivity",
    "dashboardStats",
  ],
  template: `
    <div class="slide-up" style="width:100%;">
      <!-- KPI Grid -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-6 stagger">
        <div class="kpi-card" v-for="(kpi, idx) in kpiCards" :key="idx">
          <div class="flex justify-between items-start mb-3">
            <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9C8E84;">{{ kpi.label }}</div>
            <div :style="\`background:\${kpi.bg};color:\${kpi.color};width:34px;height:34px;border-radius:0.5rem;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0\`">
              <i :class="kpi.icon"></i>
            </div>
          </div>
          <div style="font-family:'Playfair Display',serif;font-size:1.65rem;font-weight:800;color:#1A1208;line-height:1;">{{ kpi.value }}</div>
          <div v-if="kpi.sub" style="font-size:0.75rem;color:#6B5744;margin-top:0.5rem;font-weight:700;display:flex;align-items:center;gap:0.35rem;">
            <i v-if="kpi.subIcon" :class="kpi.subIcon" :style="\`color:\${kpi.subColor}\`"></i>
            <span :style="\`color:\${kpi.subColor || '#6B5744'}\`">{{ kpi.sub }}</span>
          </div>
        </div>
      </div>

      <!-- Row 1 -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6" style="align-items:stretch;">
          <!-- Weekly Revenue -->
          <div class="panel lg:col-span-2">
            <div class="p-4 border-b flex items-center justify-between" style="border-color:rgba(111,78,55,0.16);background:rgba(111,78,55,0.06);">
              <div style="font-weight:900;font-size:0.95rem;">Weekly Revenue</div>
              <div style="background:#EDE8E0;border-radius:2rem;padding:0.25rem 0.75rem;font-size:0.75rem;color:#6B5744;font-weight:800;">
                {{ weeklyLabel }}
              </div>
            </div>

            <div style="padding:1.25rem 1.25rem 1.35rem;">
              <div v-if="!weeklyHasData" style="min-height:240px;display:flex;align-items:center;justify-content:center;color:#9C8E84;font-weight:800;font-size:0.9rem;">
                No revenue data yet
              </div>
              <div v-else style="min-height:240px;display:flex;align-items:flex-end;gap:20px;padding:0.75rem 0.75rem 0.25rem;position:relative;">
                <div style="position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to top, rgba(111,78,55,0.06) 0, rgba(111,78,55,0.06) 1px, transparent 1px, transparent 32px);border-radius:0.85rem;"></div>
                <div v-for="(b, i) in weeklyBars" :key="i" style="flex:1;min-width:34px;display:flex;flex-direction:column;align-items:center;gap:0.5rem;position:relative;">
                  <div style="width:100%;height:190px;display:flex;align-items:flex-end;">
                    <div :title="b.title" :style="\`width:100%;height:\${b.heightPx}px;background:\${b.color};border-radius:0.85rem 0.85rem 0.45rem 0.45rem;box-shadow:0 10px 24px rgba(111,78,55,0.12);\`"></div>
                  </div>
                  <div style="font-size:0.75rem;color:#6B5744;font-weight:800;">{{ b.label }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Order Status -->
          <div class="panel">
            <div class="p-4 border-b" style="border-color:rgba(58,175,169,0.28);background:rgba(58,175,169,0.08);">
              <div style="font-weight:900;font-size:0.95rem;">Order Status</div>
            </div>

            <div style="padding:1.25rem 1.25rem 1.35rem;display:flex;flex-direction:column;align-items:center;justify-content:center;">
              <div style="position:relative;width:190px;height:190px;">
                <svg viewBox="0 0 120 120" style="width:100%;height:100%;">
                  <g transform="rotate(-90 60 60)">
                    <circle cx="60" cy="60" r="44" fill="none" stroke="#EDE8E0" stroke-width="14"></circle>
                    <circle v-for="seg in donutSegments" :key="seg.key"
                      cx="60" cy="60" r="44" fill="none"
                      :stroke="seg.color" stroke-width="14"
                      :stroke-dasharray="seg.dasharray"
                      :stroke-dashoffset="seg.dashoffset"
                      stroke-linecap="butt"></circle>
                  </g>
                </svg>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                  <div style="font-family:'Playfair Display',serif;font-size:1.75rem;font-weight:900;color:#1A1208;line-height:1;">{{ openNowOrders }}</div>
                  <div style="font-size:0.75rem;color:#9C8E84;font-weight:800;margin-top:0.15rem;">active orders</div>
                  <div style="font-size:0.75rem;color:#6B5744;font-weight:900;margin-top:0.25rem;">{{ openNowItems }} active items</div>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-x-6 gap-y-2" style="margin-top:1.1rem;width:100%;max-width:280px;font-size:0.8125rem;color:#6B5744;font-weight:800;">
                <div class="flex items-center gap-2">
                  <span style="width:10px;height:10px;border-radius:999px;background:#2A9D8F;"></span>
                  Completed: {{ status.completed }} ({{ statusItems.completed }} items)
                </div>
                <div class="flex items-center gap-2">
                  <span style="width:10px;height:10px;border-radius:999px;background:#F4A261;"></span>
                  Preparing: {{ status.preparing }} ({{ statusItems.preparing }} items)
                </div>
                <div class="flex items-center gap-2">
                  <span style="width:10px;height:10px;border-radius:999px;background:#E9C46A;"></span>
                  Pending: {{ status.pending }} ({{ statusItems.pending }} items)
                </div>
                <div class="flex items-center gap-2">
                  <span style="width:10px;height:10px;border-radius:999px;background:#E63946;"></span>
                  Cancelled: {{ status.cancelled }} ({{ statusItems.cancelled }} items)
                </div>
              </div>
            </div>
          </div>
      </div>

      <!-- Row 2 -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5" style="align-items:stretch;">
          <!-- Low Stock Alerts -->
          <div class="panel" style="display:flex;flex-direction:column;height:clamp(640px, 72vh, 900px);overflow:hidden;">
            <div class="p-4 border-b flex items-center justify-between" style="border-color:#F4A261;background:#FFF4DA;">
              <div class="flex items-center gap-3">
                <div style="width:36px;height:36px;border-radius:0.75rem;background:#F4A26120;border:1px solid #F4A26155;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <i class="bi bi-exclamation-triangle" style="color:#B45309;"></i>
                </div>
                <div>
                  <div style="font-weight:900;font-size:0.95rem;color:#1A1208;">Low Stock Alerts</div>
                  <div style="font-size:0.75rem;color:#8B6347;font-weight:800;margin-top:0.1rem;">{{ lowStockCount }} items need attention</div>
                </div>
              </div>
              <button @click="$emit('navigate','inventory')" style="background:transparent;border:1.5px solid #F4A261;border-radius:0.65rem;padding:0.35rem 0.85rem;font-size:0.8rem;font-weight:900;color:#B45309;cursor:pointer;">
                View All
              </button>
            </div>

            <div class="df-hide-scrollbar" style="padding:0.25rem 0;flex:1;min-height:0;overflow:auto;">
              <div v-if="lowStockCount === 0" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;color:#9C8E84;font-size:0.875rem;font-weight:800;">
                <i class="bi bi-check-circle" style="display:block;font-size:2rem;margin-bottom:0.5rem;"></i>
                All items in stock
              </div>

              <div v-for="it in lowStockList" :key="it.id"
                   style="display:flex;align-items:center;gap:1rem;padding:1.05rem 1.25rem;border-bottom:1px solid rgba(111,78,55,0.08);">
                <div :style="\`min-width:44px;height:34px;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.85rem;background:\${stockBadgeBg(it)};color:\${stockBadgeColor(it)};\`">
                  {{ stockBadgeText(it) }}
                </div>

                <div style="flex:1;min-width:0;">
                  <div style="font-weight:900;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ it.name }}</div>
                  <div style="font-size:0.75rem;color:#9C8E84;font-weight:800;margin-top:0.1rem;">
                    Threshold: {{ fmtQty(it.threshold) }} {{ it.unit || '' }}
                  </div>
                </div>

                <div style="width:170px;flex-shrink:0;display:flex;align-items:center;gap:0.6rem;">
                  <div style="flex:1;height:7px;background:#EDE8E0;border-radius:999px;overflow:hidden;">
                    <div :style="\`height:7px;width:\${stockPercent(it)}%;background:\${stockBarColor(it)};border-radius:999px;\`"></div>
                  </div>
                  <div style="font-size:0.75rem;color:#9C8E84;font-weight:900;min-width:22px;text-align:right;">{{ it.unit || '' }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Recent Activity -->
          <div class="panel" style="display:flex;flex-direction:column;height:clamp(640px, 72vh, 900px);overflow:hidden;">
            <div class="p-4 border-b flex items-center justify-between" style="border-color:rgba(58,175,169,0.55);background:rgba(58,175,169,0.10);">
              <div class="flex items-center gap-3">
                <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(58,175,169,0.16);border:1px solid rgba(58,175,169,0.40);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <i class="bi bi-clock-history" style="color:#2A8F8A;"></i>
                </div>
                <div>
                  <div style="font-weight:900;font-size:0.95rem;color:#1A1208;">Recent Activity</div>
                  <div style="font-size:0.75rem;color:#6B5744;font-weight:800;margin-top:0.1rem;">Live updates while server is running</div>
                </div>
              </div>
            </div>

            <div class="df-hide-scrollbar" style="padding:0.25rem 0;flex:1;min-height:0;overflow:auto;">
              <div v-if="!activityList || activityList.length === 0" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;color:#9C8E84;font-size:0.875rem;font-weight:800;">
                <i class="bi bi-clock-history" style="display:block;font-size:2rem;margin-bottom:0.5rem;"></i>
                No recent activity yet
              </div>

              <div v-for="ev in activityList" :key="ev.id"
                   style="display:flex;align-items:flex-start;gap:1rem;padding:1.05rem 1.25rem;border-bottom:1px solid rgba(111,78,55,0.08);">
                <div style="width:36px;height:36px;border-radius:0.85rem;background:rgba(58,175,169,0.12);border:1px solid rgba(58,175,169,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <i :class="iconFor(ev.kind)" style="color:#2A8F8A;"></i>
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:900;font-size:0.9rem;color:#1A1208;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    {{ activityTitle(ev) }}
                  </div>
                  <div style="margin-top:0.25rem;font-size:0.75rem;color:#9C8E84;font-weight:900;">
                    {{ timeAgo(ev.ts) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>
  `,
  methods: {
    fmtMoney(v) {
      const n = Number(v || 0);
      try {
        const f = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
        return `₹${f.format(Math.round(n || 0))}`;
      } catch {
        return `₹${Math.round(n || 0)}`;
      }
    },
    fmtQty(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return String(v ?? "");
      const out = Math.round(n * 100) / 100;
      return String(out);
    },
    clamp(n, a, b) {
      const x = Number(n);
      if (!Number.isFinite(x)) return a;
      return Math.min(b, Math.max(a, x));
    },
    timeAgo(iso) {
      try {
        const d = new Date(String(iso || ""));
        const diffMs = Date.now() - d.getTime();
        if (!Number.isFinite(diffMs)) return "";
        const sec = Math.floor(diffMs / 1000);
        if (sec < 20) return "just now";
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}h ago`;
        const day = Math.floor(hr / 24);
        return `${day}d ago`;
      } catch {
        return "";
      }
    },
    iconFor(kind) {
      const k = String(kind || "");
      if (k === "order_placed") return "bi bi-receipt";
      if (k === "custom_submitted") return "bi bi-stars";
      if (k === "order_accepted") return "bi bi-check2-circle";
      if (k === "order_rejected") return "bi bi-x-circle";
      if (k === "chef_done" || k === "order_ready") return "bi bi-fire";
      if (k === "waiter_delivered" || k === "batch_delivered") return "bi bi-truck";
      if (k === "payment_received") return "bi bi-cash-coin";
      return "bi bi-bell";
    },
    activityTitle(ev) {
      const kind = String(ev?.kind || "");
      const table = ev?.table_number != null ? `Table ${ev.table_number}` : null;
      const orderIdBase = ev?.order_id != null ? `Order #${ev.order_id}` : null;
      const batchIdBase = ev?.batch_id != null ? `Batch #${ev.batch_id}` : null;

      const dishSummary = String(ev?.meta?.dish_summary || "").trim();
      const canShowDish = kind !== "batch_delivered" && kind !== "payment_received";
      const dishSuffix = (canShowDish && dishSummary) ? ` - ${dishSummary}` : "";

      const orderId = orderIdBase ? `${orderIdBase}${dishSuffix}` : null;
      const batchId = batchIdBase ? `${batchIdBase}${dishSuffix}` : null;

      if (kind === "payment_received") {
        const amt = Number(ev?.meta?.amount);
        const method = String(ev?.meta?.payment_method || "Cash").trim() || "Cash";
        const amtLabel = Number.isFinite(amt) ? `Rs ${Math.round(amt)}` : "Rs 0";
        if (table) return `Payment received - ${amtLabel} via ${method} - ${table}`;
        return `Payment received - ${amtLabel} via ${method}`;
      }

      if (kind === "order_placed") return `${orderId || batchId || "Order"} placed — ${table || "Table"}`;
      if (kind === "custom_submitted") return `Custom dish submitted — ${table || "Table"}${batchId ? ` (${batchId})` : ""}`;
      if (kind === "order_accepted") return `${orderId || batchId || "Order"} accepted — ${table || "Table"}`;
      if (kind === "order_rejected") return `${orderId || batchId || "Order"} rejected — ${table || "Table"}`;
      if (kind === "order_ready") return `${orderId || batchId || "Order"} ready for serving — ${table || "Table"}`;
      if (kind === "chef_done") return `${orderId || batchId || "Order"} item finished — ${table || "Table"}`;
      if (kind === "waiter_delivered") return `${orderId || batchId || "Order"} delivered — ${table || "Table"}`;
      if (kind === "batch_delivered") return `All orders delivered — ${table || "Table"}`;

      const msg = String(ev?.message || "").trim();
      return msg || "Activity";
    },
    stockBadgeText(it) {
      const stock = Number(it?.stock);
      if (!Number.isFinite(stock) || stock <= 0) return "OUT";
      return this.fmtQty(stock);
    },
    stockBadgeBg(it) {
      const stock = Number(it?.stock);
      if (!Number.isFinite(stock) || stock <= 0) return "#FEE2E2";
      return "#FEF3C7";
    },
    stockBadgeColor(it) {
      const stock = Number(it?.stock);
      if (!Number.isFinite(stock) || stock <= 0) return "#991B1B";
      return "#92400E";
    },
    stockPercent(it) {
      const stock = Number(it?.stock);
      const threshold = Number(it?.threshold);
      if (!Number.isFinite(stock) || stock <= 0) return 0;
      if (!Number.isFinite(threshold) || threshold <= 0) return 0;
      return Math.round(this.clamp((stock / threshold) * 100, 0, 100));
    },
    stockBarColor(it) {
      const stock = Number(it?.stock);
      if (!Number.isFinite(stock) || stock <= 0) return "#E63946";
      return "#F4A261";
    },
  },
  computed: {
    stats() {
      return this.dashboardStats || {};
    },
    status() {
      const s = this.stats?.status || {};
      const completed = Number(s.completed || 0);
      const preparing = Number(s.preparing || 0);
      const pending = Number(s.pending || 0);
      const cancelled = Number(s.cancelled || 0);
      const total = Number.isFinite(Number(s.total)) ? Number(s.total) : (completed + preparing + pending + cancelled);
      return { completed, preparing, pending, cancelled, total };
    },
    statusItems() {
      const s = this.stats?.status || {};
      const items = s.items || {};
      const completed = Number(items.completed || 0);
      const preparing = Number(items.preparing || 0);
      const pending = Number(items.pending || 0);
      const cancelled = Number(items.cancelled || 0);
      const total = Number.isFinite(Number(items.total)) ? Number(items.total) : (completed + preparing + pending + cancelled);
      return { completed, preparing, pending, cancelled, total };
    },
    statusTotal() {
      return this.status.total || 0;
    },
    statusItemsTotal() {
      return this.statusItems.total || 0;
    },
    openNowOrders() {
      // "No order right now" should show 0 even if some orders were completed earlier today.
      return (Number(this.status.preparing || 0) + Number(this.status.pending || 0)) || 0;
    },
    openNowItems() {
      return (Number(this.statusItems.preparing || 0) + Number(this.statusItems.pending || 0)) || 0;
    },
    kpiCards() {
      const revenue = this.fmtMoney(this.stats?.todayRevenue || 0);
      const trend = Number(this.stats?.revenueTrendPercent || 0);
      const trendAbs = Math.round(Math.abs(trend) * 10) / 10;
      const trendUp = trend >= 0;
      const trendText = `${trendAbs}% vs last week`;

      const active = String(Number(this.stats?.activeOrders || 0));
      const completedToday = String(Number(this.stats?.completedToday || 0));

      const occ = Number(this.stats?.tablesOccupied || 0);
      const tot = Number(this.stats?.tablesTotal || 0);
      const free = Number(this.stats?.tablesFree || Math.max(0, tot - occ));
      const tablesValue = tot > 0 ? `${occ}/${tot}` : "-";
      const tablesSub = tot > 0 ? `${free} tables free` : "No tables";

      const aov = this.fmtMoney(this.stats?.avgOrderValue || 0);
      const pendingApprovals = Number(this.stats?.pendingApprovals || 0);
      const pendingSub = `${pendingApprovals} pending approval`;

      return [
        {
          label: "Today's Revenue",
          value: revenue,
          sub: trendText,
          subIcon: trendUp ? "bi bi-arrow-up-right" : "bi bi-arrow-down-right",
          subColor: trendUp ? "#2A9D8F" : "#E63946",
          icon: "bi bi-cash-stack",
          bg: "#FDF4ED",
          color: "#6F4E37",
        },
        {
          label: "Active Orders",
          value: active,
          sub: `${completedToday} completed today`,
          subIcon: null,
          subColor: "#6B5744",
          icon: "bi bi-fire",
          bg: "#FEE2E2",
          color: "#B91C1C",
        },
        {
          label: "Tables Occupied",
          value: tablesValue,
          sub: tablesSub,
          subIcon: null,
          subColor: "#6B5744",
          icon: "bi bi-cup-hot",
          bg: "#E0F2FE",
          color: "#0369A1",
        },
        {
          label: "Avg Order Value",
          value: aov,
          sub: pendingSub,
          subIcon: null,
          subColor: "#6B5744",
          icon: "bi bi-bar-chart",
          bg: "#EDE9FE",
          color: "#6D28D9",
        },
      ];
    },
    weeklyBars() {
      const weekly = Array.isArray(this.stats?.weekly) ? this.stats.weekly : [];
      const series = weekly.slice(-7);
      const values = series.map((x) => Number(x?.total || 0));
      const max = Math.max(1, ...values);
      const maxHeight = 190;
      const minHeight = 10;
      return series.map((x, idx) => {
        const v = Number(x?.total || 0);
        const h = Math.round(this.clamp((v / max) * maxHeight, 0, maxHeight));
        const heightPx = v > 0 ? Math.max(minHeight, h) : 2;
        const isLast = idx === series.length - 1;
        return {
          label: String(x?.label || "").slice(0, 3) || `D${idx + 1}`,
          total: v,
          heightPx,
          color: v > 0 ? (isLast ? "#6F4E37" : "rgba(111,78,55,0.25)") : "rgba(111,78,55,0.12)",
          title: this.fmtMoney(v),
        };
      });
    },
    weeklyHasData() {
      const weekly = Array.isArray(this.stats?.weekly) ? this.stats.weekly : [];
      return weekly.some((x) => Number(x?.total || 0) > 0.01);
    },
    weeklyLabel() {
      return String(this.stats?.weeklyLabel || "Last 7 days");
    },
    donutSegments() {
      const total = this.statusTotal;
      if (!total || total <= 0) return [];

      const r = 44;
      const c = 2 * Math.PI * r;
      const parts = [
        { key: "completed", value: this.status.completed, color: "#2A9D8F" },
        { key: "preparing", value: this.status.preparing, color: "#F4A261" },
        { key: "pending", value: this.status.pending, color: "#E9C46A" },
        { key: "cancelled", value: this.status.cancelled, color: "#E63946" },
      ].filter((p) => Number(p.value || 0) > 0);

      let offset = 0;
      return parts.map((p) => {
        const v = Number(p.value || 0);
        const len = (v / total) * c;
        const dasharray = `${len} ${c - len}`;
        const dashoffset = -offset;
        offset += len;
        return { key: p.key, color: p.color, dasharray, dashoffset };
      });
    },
    lowStockCount() {
      return Array.isArray(this.lowStockItems) ? this.lowStockItems.length : 0;
    },
    lowStockList() {
      const list = Array.isArray(this.lowStockItems) ? [...this.lowStockItems] : [];
      list.sort((a, b) => {
        const sa = Number(a?.stock);
        const sb = Number(b?.stock);
        const oa = Number.isFinite(sa) ? sa : 0;
        const ob = Number.isFinite(sb) ? sb : 0;
        return oa - ob;
      });
      return list.slice(0, 8);
    },
    activityList() {
      const list = Array.isArray(this.recentActivity) ? this.recentActivity : [];
      return list.slice(0, 10);
    },
  },
};
