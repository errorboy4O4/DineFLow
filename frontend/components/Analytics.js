const toYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

export default {
  template: `
    <div class="slide-up" style="max-width:1200px;width:100%;margin:0 auto;">
      <div class="panel" style="padding:0.75rem 1rem;display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
        <div style="font-weight:900;color:#1A1208;font-size:1.05rem;">Analytics</div>

        <div style="margin-left:auto;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
          <select v-model="month" style="padding:0.6rem 0.75rem;border:1.5px solid #E5DDD5;border-radius:0.75rem;background:#FAFAF7;font-weight:900;">
            <option value="">All months</option>
            <option v-for="m in months" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <select v-model="range" style="padding:0.6rem 0.75rem;border:1.5px solid #E5DDD5;border-radius:0.75rem;background:#FAFAF7;font-weight:900;">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button class="btn-ghost" @click="load" style="padding:0.6rem 0.85rem;border-radius:0.75rem;" title="Refresh">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>

      <div v-if="loading" class="panel" style="margin-top:1rem;padding:1rem;font-weight:900;color:#6B5744;">Loading analytics...</div>
      <div v-else-if="error" class="panel" style="margin-top:1rem;padding:1rem;font-weight:900;color:#991B1B;">{{ error }}</div>

      <template v-else>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4" style="margin-top:1rem;">
          <div class="panel" style="padding:1rem;border-left:4px solid #6F4E37;">
            <div style="color:#9C8E84;font-weight:900;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.08em;">Revenue</div>
            <div style="font-family:'Playfair Display',serif;font-weight:900;font-size:1.6rem;color:#6F4E37;margin-top:0.25rem;">₹{{ fmt(summary.revenue_total) }}</div>
            <div style="color:#6B5744;font-weight:800;font-size:0.82rem;margin-top:0.2rem;">Subtotal ₹{{ fmt(summary.revenue_subtotal) }} · GST ₹{{ fmt(summary.revenue_gst) }}</div>
          </div>
          <div class="panel" style="padding:1rem;border-left:4px solid #3AAFA9;">
            <div style="color:#9C8E84;font-weight:900;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.08em;">Orders Closed</div>
            <div style="font-weight:900;font-size:1.6rem;color:#1A1208;margin-top:0.25rem;">{{ summary.orders_closed || 0 }}</div>
            <div style="color:#6B5744;font-weight:800;font-size:0.82rem;margin-top:0.2rem;">Open: {{ summary.orders_open || 0 }}</div>
          </div>
          <div class="panel" style="padding:1rem;border-left:4px solid #8B6347;">
            <div style="color:#9C8E84;font-weight:900;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.08em;">Avg Order</div>
            <div style="font-weight:900;font-size:1.6rem;color:#1A1208;margin-top:0.25rem;">₹{{ fmt(summary.avg_order_value) }}</div>
            <div style="color:#6B5744;font-weight:800;font-size:0.82rem;margin-top:0.2rem;">Based on closed bills</div>
          </div>
          <div class="panel" style="padding:1rem;border-left:4px solid #E63946;">
            <div style="color:#9C8E84;font-weight:900;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.08em;">Items Sold</div>
            <div style="font-weight:900;font-size:1.6rem;color:#1A1208;margin-top:0.25rem;">{{ summary.items_sold || 0 }}</div>
            <div style="color:#6B5744;font-weight:800;font-size:0.82rem;margin-top:0.2rem;">Across closed orders</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5" style="margin-top:1.25rem;">
          <div class="panel">
            <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1)">
              <h3 style="font-weight:900;font-size:0.95rem;">Revenue Trend</h3>
              <div style="color:#9C8E84;font-weight:800;font-size:0.8rem;margin-top:0.15rem;">Daily totals (incl. GST)</div>
            </div>
            <div style="padding:0.75rem 1rem;">
              <div v-if="series.length===0" style="height:240px;display:flex;align-items:center;justify-content:center;color:#9C8E84;font-weight:900;">No closed orders in this range.</div>
              <template v-else>
                <svg :viewBox="'0 0 600 240'" style="width:100%;height:240px;display:block;">
                  <defs>
                    <linearGradient id="revG" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stop-color="#3AAFA9" stop-opacity="0.28" />
                      <stop offset="1" stop-color="#3AAFA9" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  <path :d="revArea" fill="url(#revG)" />
                  <path :d="revPath" fill="none" stroke="#3AAFA9" stroke-width="3" stroke-linecap="round" />
                  <line x1="20" y1="210" x2="580" y2="210" stroke="#E5DDD5" stroke-width="3" />
                </svg>
                <div style="display:flex;justify-content:space-between;color:#9C8E84;font-weight:900;font-size:0.75rem;margin-top:0.25rem;">
                  <span>{{ series[0]?.date || '' }}</span>
                  <span>{{ series[series.length - 1]?.date || '' }}</span>
                </div>
              </template>
            </div>
          </div>

          <div class="panel">
            <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1)">
              <h3 style="font-weight:900;font-size:0.95rem;">Orders Volume (Weekdays)</h3>
            </div>
            <div style="padding:0.9rem 1rem;">
              <div v-if="volume7.length===0" style="height:240px;display:flex;align-items:center;justify-content:center;color:#9C8E84;font-weight:900;">No closed orders in this range.</div>
              <svg v-else viewBox="0 0 600 240" style="width:100%;height:240px;display:block;">
                <g>
                  <line v-for="t in volumeTicks" :key="'g'+t.v" :x1="58" :x2="580" :y1="t.y" :y2="t.y" stroke="#E8E0D8" stroke-width="2" stroke-dasharray="4 6" />
                  <text v-for="t in volumeTicks" :key="'l'+t.v" :x="46" :y="t.y+4" text-anchor="end" font-size="12" font-weight="900" fill="#9C8E84">{{ t.v }}</text>
                </g>

                <g>
                  <g v-for="b in volumeBars" :key="b.key">
                    <rect :x="b.x" :y="b.y" :width="b.w" :height="b.h" :rx="12" fill="#4DB8B2" />
                    <text :x="b.x + b.w/2" :y="b.y - 8" text-anchor="middle" font-size="13" font-weight="1000" fill="#1B9E95">{{ b.v }}</text>
                    <text :x="b.x + b.w/2" :y="210" text-anchor="middle" font-size="13" font-weight="1000" fill="#6B5744">{{ b.label }}</text>
                  </g>
                </g>

                <line x1="58" y1="190" x2="580" y2="190" stroke="#E5DDD5" stroke-width="3" />
              </svg>
            </div>
          </div>
        </div>

        <div class="panel" style="margin-top:1.25rem;">
          <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1)">
            <h3 style="font-weight:900;font-size:0.98rem;">Top Performing Dishes by Revenue</h3>
          </div>

          <div style="padding:0.95rem 1rem;overflow-x:auto;">
            <table style="width:100%;min-width:980px;border-collapse:separate;border-spacing:0;">
              <thead>
                <tr style="background:linear-gradient(90deg,#EAF4F3,#EFE7DE);">
                  <th style="text-align:left;padding:0.85rem 0.9rem;font-size:0.75rem;font-weight:1000;letter-spacing:0.11em;text-transform:uppercase;color:#8A6C58;border-top-left-radius:0.9rem;">Dish</th>
                  <th style="text-align:left;padding:0.85rem 0.9rem;font-size:0.75rem;font-weight:1000;letter-spacing:0.11em;text-transform:uppercase;color:#8A6C58;">Category</th>
                  <th style="text-align:right;padding:0.85rem 0.9rem;font-size:0.75rem;font-weight:1000;letter-spacing:0.11em;text-transform:uppercase;color:#8A6C58;">Orders</th>
                  <th style="text-align:right;padding:0.85rem 0.9rem;font-size:0.75rem;font-weight:1000;letter-spacing:0.11em;text-transform:uppercase;color:#8A6C58;">Revenue</th>
                  <th style="text-align:right;padding:0.85rem 0.9rem;font-size:0.75rem;font-weight:1000;letter-spacing:0.11em;text-transform:uppercase;color:#8A6C58;">Margin</th>
                  <th style="text-align:right;padding:0.85rem 0.9rem;font-size:0.75rem;font-weight:1000;letter-spacing:0.11em;text-transform:uppercase;color:#8A6C58;border-top-right-radius:0.9rem;">Trend</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(d, idx) in topDishes" :key="d.name + idx" style="border-bottom:1px solid rgba(111,78,55,0.08);">
                  <td style="padding:0.95rem 0.9rem;">
                    <div style="display:flex;gap:0.8rem;align-items:center;min-width:0;">
                      <div :style="badgeStyle(d.name)" style="width:34px;height:34px;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;font-weight:1000;color:#1A1208;flex-shrink:0;">
                        {{ initial(d.name) }}
                      </div>
                      <div style="min-width:0;">
                        <div style="font-weight:1000;color:#1A1208;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px;">{{ d.name }}</div>
                      </div>
                    </div>
                  </td>
                  <td style="padding:0.95rem 0.9rem;color:#9C8E84;font-weight:900;">{{ d.category || '—' }}</td>
                  <td style="padding:0.95rem 0.9rem;text-align:right;font-weight:1000;color:#1A1208;">{{ d.orders || 0 }}</td>
                  <td style="padding:0.95rem 0.9rem;text-align:right;font-weight:1000;color:#6F4E37;">₹{{ fmt(d.revenue) }}</td>
                  <td style="padding:0.95rem 0.9rem;text-align:right;font-weight:1000;" :style="{color: (d.margin_percent==null? '#9C8E84' : '#0F766E')}">
                    <span v-if="d.margin_percent==null">—</span>
                    <span v-else>{{ d.margin_percent }}%</span>
                  </td>
                  <td style="padding:0.95rem 0.9rem;text-align:right;font-weight:1000;" :style="{color: trendColor(d)}">
                    <span style="display:inline-flex;gap:0.3rem;align-items:center;justify-content:flex-end;min-width:90px;">
                      <span style="font-size:1.05rem;line-height:1;">{{ trendArrow(d) }}</span>
                      <span>{{ Math.abs(Number(d.trend_percent || 0)).toFixed(1) }}%</span>
                    </span>
                  </td>
                </tr>
                <tr v-if="topDishes.length===0">
                  <td colspan="6" style="padding:1.25rem;color:#9C8E84;font-weight:1000;text-align:center;">No dish sales in this range.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel" style="margin-top:1.25rem;">
          <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1)">
            <h3 style="font-weight:900;font-size:0.95rem;">Top Tables</h3>
            <div style="color:#9C8E84;font-weight:800;font-size:0.8rem;margin-top:0.15rem;">By subtotal in selected range</div>
          </div>
          <div style="padding:1rem;overflow-x:auto;">
            <table class="data-table" style="min-width:520px;">
              <thead>
                <tr>
                  <th>Table</th>
                  <th style="text-align:right;">Orders</th>
                  <th style="text-align:right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in topTables" :key="t.table_number">
                  <td style="font-weight:900;">Table {{ t.table_number }}</td>
                  <td style="text-align:right;font-weight:900;color:#6B5744;">{{ t.orders }}</td>
                  <td style="text-align:right;font-weight:900;color:#6F4E37;">₹{{ fmt(t.subtotal) }}</td>
                </tr>
                <tr v-if="topTables.length===0">
                  <td colspan="3" style="padding:1rem;color:#9C8E84;font-weight:900;text-align:center;">No data</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </template>
    </div>
  `,

  data() {
    return {
      range: '30d',
      month: '',
      months: [],
      loading: false,
      error: '',
      summary: {
        orders_closed: 0,
        orders_open: 0,
        items_sold: 0,
        revenue_subtotal: 0,
        revenue_gst: 0,
        revenue_total: 0,
        avg_order_value: 0
      },
      series: [],
      topDishes: [],
      topTables: []
    };
  },

  computed: {
    revPath() {
      return this.linePath((this.series || []).map(x => Number(x.total || 0)), { yBase: 210, yTop: 40 });
    },

    revArea() {
      const pts = this.linePoints((this.series || []).map(x => Number(x.total || 0)), { yBase: 210, yTop: 40 });
      if (!pts.length) return '';
      const first = pts[0];
      const last = pts[pts.length - 1];
      const top = pts.map(pt => `${pt.x},${pt.y}`).join(' ');
      return `M${first.x},210 L${top.replace(/ /g, ' L')} L${last.x},210 Z`;
    },

    volume7() {
      const series = (this.series || []).slice();
      if (!series.length) return [];

      // For 7d range keep true daily bars (weekday labels).
      if (this.range === '7d') {
        const map = new Map(series.map(r => [r.date, Number(r.orders || 0)]));
        const endDate = series[series.length - 1].date || '';
        if (!endDate) return [];
        const end = new Date(endDate + 'T00:00:00');
        const out = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(end);
          d.setDate(d.getDate() - i);
          const key = toYMD(d);
          const v = map.get(key) || 0;
          const label = d.toLocaleDateString(undefined, { weekday: 'short' });
          out.push({ date: key, label, v });
        }
        return out;
      }

      // For other ranges (30d / 90d / all / month): group by weekday across the whole range.
      // Each bar represents a weekday total (Mon..Sun) across the selected timeframe.
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const out = labels.map((label) => ({ date: label, label, v: 0 }));

      for (const row of series) {
        const ymd = String(row?.date || '');
        if (!ymd) continue;
        let idx = 0;
        try {
          const d = new Date(ymd + 'T00:00:00');
          // JS: 0=Sun..6=Sat -> Monday-first (Mon=0..Sun=6)
          idx = ((d.getDay() + 6) % 7);
        } catch {
          idx = 0;
        }
        out[idx].v += Number(row?.orders || 0) || 0;
      }

      return out;
    },

    volumeMax() {
      return Math.max(1, ...(this.volume7 || []).map(x => Number(x.v || 0)));
    },

    volumeTicks() {
      const maxV = this.volumeMax;
      const top = 30;
      const bottom = 190;
      const height = bottom - top;
      const mk = (t) => {
        const v = Math.max(0, Math.round(maxV * t));
        const y = bottom - (v / maxV) * height;
        return { v, y: Math.round(y) };
      };
      const ticks = [mk(0.25), mk(0.5), mk(0.75), mk(1)];
      const seen = new Set();
      return ticks.filter(t => {
        if (seen.has(t.v)) return false;
        seen.add(t.v);
        return true;
      });
    },

    volumeBars() {
      const data = this.volume7;
      const n = data.length;
      const x0 = 78;
      const x1 = 580;
      const top = 30;
      const bottom = 190;
      const height = bottom - top;
      const gap = 18;
      const w = Math.floor((x1 - x0 - gap * (n - 1)) / n);

      const maxV = this.volumeMax;
      return data.map((d, i) => {
        const h = Math.max(6, Math.round((Number(d.v || 0) / maxV) * height));
        return {
          key: String(d.date || d.label || i),
          date: d.date,
          label: d.label,
          v: Number(d.v || 0),
          x: x0 + i * (w + gap),
          y: bottom - h,
          w,
          h
        };
      });
    }
  },

  async mounted() {
    // Build month options (last 24 months including current month).
    try {
      const now = new Date();
      const list = [];
      for (let i = 0; i < 24; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        list.push({
          value: `${yyyy}-${mm}`,
          label: d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
        });
      }
      this.months = list;
    } catch {
      this.months = [];
    }
    await this.load();
  },

  watch: {
    range() {
      // Auto-refresh charts/tables when timeframe changes.
      this.load();
    },
    month() {
      // Auto-refresh charts/tables when month filter changes.
      this.load();
    }
  },

  methods: {
    fmt(n) {
      const x = Number(n || 0);
      return x.toLocaleString();
    },

    initial(name) {
      const s = String(name || '').trim();
      return s ? s[0].toUpperCase() : '?';
    },

    badgeStyle(name) {
      const s = String(name || 'x');
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      const palette = [
        ['#F4E7DC', '#6F4E37'],
        ['#EAF4F3', '#0F766E'],
        ['#F7EFE2', '#8A6C58'],
        ['#F1F3F9', '#2E3A59'],
      ];
      const p = palette[h % palette.length];
      return { background: p[0], color: p[1] };
    },

    trendArrow(d) {
      const v = Number(d?.trend_percent || 0);
      return v >= 0 ? '↑' : '↓';
    },

    trendColor(d) {
      const v = Number(d?.trend_percent || 0);
      return v >= 0 ? '#0F766E' : '#B91C1C';
    },

    linePoints(values, opts = {}) {
      const n = values.length;
      if (!n) return [];

      const yBase = Number(opts.yBase || 200);
      const yTop = Number(opts.yTop || 40);

      const maxV = Math.max(1, ...values);
      const innerW = 560;
      const x0 = 20;
      const step = n === 1 ? 0 : innerW / (n - 1);

      return values.map((v, i) => {
        const t = (Number(v || 0) / maxV);
        const y = yBase - (yBase - yTop) * t;
        return { x: x0 + step * i, y: Math.round(y) };
      });
    },

    linePath(values, opts = {}) {
      const pts = this.linePoints(values, opts);
      if (!pts.length) return '';
      return 'M' + pts.map(p => `${p.x},${p.y}`).join(' L ');
    },

    rangeToDates() {
      const today = new Date();
      const end = new Date(today);
      const start = new Date(today);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      // Month filter takes priority over range dropdown.
      if (this.month) {
        try {
          const [yyRaw, mmRaw] = String(this.month).split('-');
          const yy = Number(yyRaw);
          const mm = Number(mmRaw);
          const monthStart = new Date(yy, (mm || 1) - 1, 1);
          monthStart.setHours(0, 0, 0, 0);

          const isCurrentMonth = (yy === today.getFullYear()) && ((mm || 1) - 1 === today.getMonth());
          let monthEnd = new Date(yy, (mm || 1), 0); // last day of month
          monthEnd.setHours(0, 0, 0, 0);
          if (isCurrentMonth) monthEnd = end;

          return { from: toYMD(monthStart), to: toYMD(monthEnd) };
        } catch {
          // fall through
        }
      }

      if (this.range === '7d') start.setDate(start.getDate() - 6);
      else if (this.range === '30d') start.setDate(start.getDate() - 29);
      else if (this.range === '90d') start.setDate(start.getDate() - 89);
      else if (this.range === 'all') return { from: '', to: '' };

      return { from: toYMD(start), to: toYMD(end) };
    },

    async load() {
      this.loading = true;
      this.error = '';
      try {
        const api = (await import('../js/api.js')).default;
        const { from, to } = this.rangeToDates();
        const res = await api.getManagerAnalytics({ from, to });
        this.summary = res.summary || this.summary;
        this.series = res.series || [];
        this.topDishes = res.top_dishes || [];
        this.topTables = res.top_tables || [];
      } catch (e) {
        this.error = e?.message || 'Failed to load analytics';
      } finally {
        this.loading = false;
      }
    }
  }
};
