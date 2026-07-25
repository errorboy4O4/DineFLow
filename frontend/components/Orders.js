export default {
  // This component now supports a "Closed Bills" view (search/filter + bill modal).
  // Pending approvals flow remains unchanged.
  template: `
    <div class="slide-up">
      <div class="panel mb-4" style="padding:0.75rem 1rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
        <button @click="mode='pending'" :style="tabBtnStyle('pending')"
                style="padding:0.55rem 0.85rem;border-radius:0.75rem;border:1.5px solid rgba(111,78,55,0.18);font-weight:900;cursor:pointer;transition:all 0.15s;">
          Pending
        </button>
        <button @click="openLive()" :style="tabBtnStyle('live')"
                style="padding:0.55rem 0.85rem;border-radius:0.75rem;border:1.5px solid rgba(111,78,55,0.18);font-weight:900;cursor:pointer;transition:all 0.15s;">
          In Progress
        </button>
        <button @click="openClosed()" :style="tabBtnStyle('closed')"
                style="padding:0.55rem 0.85rem;border-radius:0.75rem;border:1.5px solid rgba(111,78,55,0.18);font-weight:900;cursor:pointer;transition:all 0.15s;">
          Closed Bills
        </button>
        <div v-if="mode!=='pending'" style="margin-left:auto;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;width:min(760px,100%);">
          <select v-model="range" style="padding:0.65rem 0.75rem;border:1.5px solid #E5DDD5;border-radius:0.75rem;background:#FAFAF7;font-weight:800;">
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <div style="position:relative;flex:1;min-width:220px;">
            <i class="bi bi-search" style="position:absolute;left:0.85rem;top:50%;transform:translateY(-50%);color:#9C8E84;"></i>
            <input v-model="q" @input="debouncedLoadCurrent" placeholder="Search by Order ID or Table..."
                   style="width:100%;padding:0.65rem 0.85rem 0.65rem 2.2rem;border:1.5px solid #E5DDD5;border-radius:0.75rem;background:#FAFAF7;font-weight:800;" />
          </div>
          <button @click="loadCurrent" class="btn-ghost" style="padding:0.6rem 0.85rem;border-radius:0.75rem;">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>

      <div v-if="mode==='live'" class="panel" style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Table No</th>
              <th>Order</th>
              <th>Batch</th>
              <th>Status</th>
              <th>Updated</th>
              <th style="text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="liveLoading">
              <td colspan="6" style="padding:1.25rem;color:#6B5744;font-weight:900;">Loading live orders...</td>
            </tr>
            <tr v-else-if="liveError">
              <td colspan="6" style="padding:1.25rem;color:#991B1B;font-weight:900;">{{ liveError }}</td>
            </tr>
            <tr v-else-if="(filteredLiveBatches||[]).length===0">
              <td colspan="6" style="padding:1.25rem;color:#9C8E84;font-weight:900;">No in-progress batches found.</td>
            </tr>
            <tr v-for="b in (filteredLiveBatches||[])" :key="b.batch_id">
              <td style="font-weight:900;">{{ b.table_number ?? '-' }}</td>
              <td style="font-weight:900;">#{{ b.order_id ?? '-' }}</td>
              <td style="font-weight:900;">#{{ b.batch_id }}</td>
              <td>
                <span class="badge" :class="b.status==='ready'?'badge-ok':(b.status==='accepted'?'badge-pending':'badge-neutral')">
                  {{ b.status }}
                </span>
              </td>
              <td style="font-weight:900;color:#6B5744;">{{ timeLabel(b.last_event_at || b.created_at) }}</td>
              <td style="text-align:center;">
                <button @click="openLiveDetails(b)" style="padding:0.35rem 0.625rem;border-radius:0.5rem;background:#F0EBE3;color:#6F4E37;border:none;cursor:pointer;font-size:0.8rem;">
                  <i class="bi bi-eye"></i>
                </button>
                <button @click="closeLiveOrder(b)"
                        style="padding:0.35rem 0.625rem;border-radius:0.5rem;background:#FAFAF7;color:#6B5744;border:1.5px solid rgba(111,78,55,0.14);cursor:pointer;font-size:0.8rem;margin-left:0.25rem;"
                        :disabled="liveClosing"
                        :title="'Close order for Table ' + (b.table_number ?? '-')">
                  Close
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="mode==='closed'" class="panel" style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Table No</th>
              <th>Date</th>
              <th>From</th>
              <th>To</th>
              <th>Status</th>
              <th style="text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="closedLoading">
              <td colspan="6" style="padding:1.25rem;color:#6B5744;font-weight:900;">Loading closed bills...</td>
            </tr>
            <tr v-else-if="closedError">
              <td colspan="6" style="padding:1.25rem;color:#991B1B;font-weight:900;">{{ closedError }}</td>
            </tr>
            <tr v-else-if="(filteredClosedOrders||[]).length===0">
              <td colspan="6" style="padding:1.25rem;color:#9C8E84;font-weight:900;">No closed orders found.</td>
            </tr>
            <tr v-for="o in (filteredClosedOrders||[])" :key="o.order_id">
              <td style="font-weight:900;">
                {{ o.table_number ?? '-' }}
                <div style="font-size:0.75rem;color:#9C8E84;font-weight:900;">Order #{{ o.order_id }}</div>
              </td>
              <td>{{ dateLabel(o.created_at) }}</td>
              <td>{{ timeLabel(o.created_at) }}</td>
              <td>{{ timeLabel(o.closed_at) }}</td>
              <td><span class="badge badge-ok">Closed</span></td>
              <td style="text-align:center;">
                <button @click="viewBill(o)" style="padding:0.35rem 0.625rem;border-radius:0.5rem;background:#F0EBE3;color:#6F4E37;border:none;cursor:pointer;font-size:0.8rem;margin-right:0.25rem;">
                  <i class="bi bi-eye"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="mode==='pending'" class="grid grid-cols-1 lg:grid-cols-5 gap-4" style="align-items:stretch;">
        <!-- Left: Pending orders list -->
        <div class="lg:col-span-2 panel" style="display:flex;flex-direction:column;min-height:0;">
          <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1)">
            <h3 style="font-weight:900;font-size:0.98rem;color:#1A1208;">Pending Orders</h3>
            <p style="font-size:0.82rem;color:#9C8E84;margin-top:0.15rem;font-weight:800;">{{ pendingOrders?.length || 0 }} awaiting approval</p>
          </div>
          <div class="scroll-y scrollbar-hidden" style="max-height:calc(100vh - 220px);padding:0.9rem;flex:1;min-height:0;">
            <div v-if="!pendingOrders || pendingOrders.length === 0" style="text-align:center;padding:3rem;color:#9C8E84;">
              <div style="font-size:2.5rem;margin-bottom:0.5rem;">🎉</div>
              <div style="font-weight:900;">All caught up!</div>
            </div>
            <div v-for="order in (pendingOrders || [])" :key="order.id"
                 class="order-item" 
                 style="cursor:pointer;transition:all 0.15s;border-radius:0.9rem;border:1.5px solid transparent;margin-bottom:0.75rem;background:white;overflow:hidden;"
                 @click="$emit('select', order)"
                 :style="order === selectedOrder ? 'border-color:#6F4E37;background:#FFF8EE;box-shadow:0 8px 20px rgba(111,78,55,0.12);' : 'border-color:rgba(111,78,55,0.12);'">
              <div style="padding:0.95rem 0.95rem 0.8rem;">
                <div style="display:flex;justify-content:space-between;gap:0.75rem;align-items:flex-start;">
                  <div style="font-weight:1000;font-size:0.95rem;color:#1A1208;">ORD-{{ order.id }}</div>
                  <div style="font-size:0.78rem;color:#9C8E84;font-weight:900;">{{ timeAgo(order.created_at) || order.time }}</div>
                </div>
                <div style="margin-top:0.35rem;color:#6B5744;font-weight:900;font-size:0.85rem;">Table {{ order.table }}</div>
                <div style="margin-top:0.65rem;display:flex;justify-content:space-between;align-items:center;">
                  <div style="font-size:0.82rem;color:#9C8E84;font-weight:900;">{{ itemCount(order) }} items</div>
                  <div style="font-weight:1000;color:#6F4E37;font-size:1rem;">{{ money(order.total) }}</div>
                </div>
              </div>

              <div v-if="order.note" style="padding:0.6rem 0.95rem;background:#FFF4C2;border-top:1px solid rgba(111,78,55,0.12);display:flex;gap:0.5rem;align-items:center;color:#92400E;font-weight:900;font-size:0.85rem;">
                <i class="bi bi-pencil-square"></i>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ order.note }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Order details -->
        <div class="lg:col-span-3" style="min-height:0;">
          <div v-if="!selectedOrder" class="panel" style="display:flex;align-items:center;justify-content:center;height:320px;flex-direction:column;gap:0.75rem;color:#9C8E84;">
            <div style="font-size:3rem;">👆</div>
            <div style="font-weight:900;">Select an order to review</div>
          </div>

          <div v-else class="panel slide-up" style="display:flex;flex-direction:column;min-height:0;">
            <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1);display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;">
              <div>
                <div style="font-weight:1000;font-size:1rem;color:#1A1208;">ORD-{{ selectedOrder.id }}</div>
                <div style="font-size:0.85rem;color:#9C8E84;font-weight:900;margin-top:0.15rem;">
                  Table {{ selectedOrder.table }} · {{ timeAgo(selectedOrder.created_at) || selectedOrder.time }}
                </div>
              </div>
              <span class="badge badge-pending" style="display:inline-flex;gap:0.35rem;align-items:center;">
                ⏳ Pending
              </span>
            </div>

            <div style="overflow-x:auto;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Dish</th>
                    <th style="text-align:center;">Qty</th>
                    <th style="text-align:right;">Unit Cost</th>
                    <th style="text-align:right;">Unit Price</th>
                    <th style="text-align:center;">Margin</th>
                    <th style="text-align:right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="it in (selectedOrder.items || [])" :key="it.name + '_' + it.qty">
                    <td style="font-weight:1000;color:#1A1208;">{{ it.name }}</td>
                    <td style="text-align:center;font-weight:900;color:#6B5744;">{{ it.qty }}</td>
                    <td style="text-align:right;font-weight:900;color:#6B5744;">{{ money(it.unit_cost) }}</td>
                    <td style="text-align:right;font-weight:1000;color:#1A1208;">{{ money(it.unit_price) }}</td>
                    <td style="text-align:center;font-weight:1000;color:#2A9D8F;">{{ fmtPct(it.margin_percent) }}</td>
                    <td style="text-align:right;font-weight:1000;color:#1A1208;">{{ money(lineTotal(it)) }}</td>
                  </tr>
                  <tr v-if="!selectedOrder.items || selectedOrder.items.length===0">
                    <td colspan="6" style="padding:1rem;color:#9C8E84;font-weight:900;text-align:center;">No items</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style="padding:1rem;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0.75rem;">
              <div style="background:white;border:1px solid rgba(111,78,55,0.12);border-radius:0.9rem;padding:0.85rem;text-align:center;">
                <div style="font-size:0.7rem;color:#9C8E84;font-weight:1000;text-transform:uppercase;letter-spacing:0.06em;">Making Cost</div>
                <div style="margin-top:0.35rem;font-weight:1000;color:#1A1208;font-size:1.15rem;">{{ money(manufacturingCost(selectedOrder)) }}</div>
              </div>
              <div style="background:white;border:1px solid rgba(111,78,55,0.12);border-radius:0.9rem;padding:0.85rem;text-align:center;">
                <div style="font-size:0.7rem;color:#9C8E84;font-weight:1000;text-transform:uppercase;letter-spacing:0.06em;">Profit</div>
                <div style="margin-top:0.35rem;font-weight:1000;color:#2A9D8F;font-size:1.15rem;">{{ money(profitTotal(selectedOrder)) }}</div>
              </div>
              <div style="background:white;border:1px solid rgba(111,78,55,0.12);border-radius:0.9rem;padding:0.85rem;text-align:center;">
                <div style="font-size:0.7rem;color:#9C8E84;font-weight:1000;text-transform:uppercase;letter-spacing:0.06em;">Total Cost</div>
                <div style="margin-top:0.35rem;font-weight:1000;color:#1A1208;font-size:1.15rem;">{{ money(orderTotal(selectedOrder)) }}</div>
              </div>
            </div>

            <div v-if="selectedOrder.note" style="margin:0 1rem 1rem;background:#FFF4C2;border:1.5px solid rgba(245,158,11,0.55);border-radius:0.9rem;padding:0.9rem 1rem;display:flex;gap:0.75rem;align-items:flex-start;color:#92400E;">
              <i class="bi bi-exclamation-triangle" style="margin-top:0.1rem;"></i>
              <div style="font-weight:1000;">
                Special request: <span style="font-weight:900;">{{ selectedOrder.note }}</span>
              </div>
            </div>

            <div style="padding:1rem;border-top:1px solid rgba(111,78,55,0.1);display:flex;gap:0.75rem;align-items:center;">
              <button @click="$emit('approve', selectedOrder.id)"
                      style="flex:1;background:#2A9D8F;color:white;border:none;border-radius:0.75rem;padding:0.85rem 1rem;font-weight:1000;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
                <i class="bi bi-check-lg"></i> Approve Order
              </button>
              <button @click="$emit('reject', selectedOrder.id)"
                      style="width:140px;background:#E63946;color:white;border:none;border-radius:0.75rem;padding:0.85rem 1rem;font-weight:1000;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
                <i class="bi bi-x-lg"></i> Reject
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modals teleported to <body> so fixed positioning centers on screen (not inside scroll/transform containers) -->
      <teleport to="body">
      <!-- Bill Modal -->
      <div v-show="billModalOpen"
           @click.self="closeBillModal"
           style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:1rem;">
        <div style="background:white;border-radius:1.25rem;padding:1.25rem;width:100%;max-width:720px;max-height:calc(100vh - 2rem);overflow:auto;box-shadow:0 24px 48px rgba(0,0,0,0.2);">
          <div style="display:flex;align-items:flex-start;gap:0.75rem;">
            <div style="flex:1;min-width:0;">
              <div style="font-family:'Playfair Display',serif;font-weight:900;font-size:1.4rem;color:#1A1208;">{{ (bill?.restaurant?.show_restaurant_name === false) ? 'Bill' : (bill?.restaurant?.restaurant_name || 'Bill') }}</div>
              <div style="color:#9C8E84;font-weight:900;margin-top:0.1rem;">
                Order #{{ bill?.order_id }} · Table {{ bill?.table_number ?? '-' }}
              </div>
              <div v-if="bill?.restaurant && ((bill.restaurant.show_address && bill.restaurant.address) || (bill.restaurant.show_gstin && bill.restaurant.gstin) || (bill.restaurant.show_phone && bill.restaurant.phone_number))" style="margin-top:0.25rem;font-size:0.78rem;color:#6B5744;font-weight:900;line-height:1.35;">
                <span v-if="bill.restaurant.show_address && bill.restaurant.address">{{ bill.restaurant.address }}</span>
                <span v-if="bill.restaurant.show_gstin && bill.restaurant.gstin"> <span style="color:#9C8E84;">|</span> GSTIN: {{ bill.restaurant.gstin }}</span>
                <span v-if="bill.restaurant.show_phone && bill.restaurant.phone_number"> <span style="color:#9C8E84;">|</span> Phone: {{ bill.restaurant.phone_number }}</span>
              </div>
            </div>
            <button class="btn-ghost" @click="closeBillModal" style="padding:0.5rem 0.75rem;border-radius:0.75rem;">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <div style="margin-top:0.75rem;color:#6B5744;font-weight:800;font-size:0.85rem;">
            Date: {{ dateLabel(bill?.created_at) }} · From: {{ timeLabel(bill?.created_at) }} · To: {{ timeLabel(bill?.closed_at) }}
          </div>

          <div class="panel" style="margin-top:0.9rem;overflow:hidden;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style="text-align:center;">Qty</th>
                  <th style="text-align:right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="it in (bill?.items || [])" :key="it.name + it.amount">
                  <td style="font-weight:900;">{{ it.name }}</td>
                  <td style="text-align:center;font-weight:900;color:#6B5744;">{{ it.qty }}</td>
                  <td style="text-align:right;font-weight:900;color:#1A1208;">₹{{ Number(it.amount||0).toLocaleString() }}</td>
                </tr>
                <tr v-if="!bill || (bill.items||[]).length===0">
                  <td colspan="3" style="padding:1rem;color:#9C8E84;font-weight:900;text-align:center;">No items</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="margin-top:0.9rem;display:flex;justify-content:flex-end;">
            <div style="min-width:280px;">
              <div style="display:flex;justify-content:space-between;color:#6B5744;font-weight:900;padding:0.15rem 0;">
                <span>Subtotal</span><span>₹{{ Number(bill?.subtotal||0).toLocaleString() }}</span>
              </div>
              <div style="display:flex;justify-content:space-between;color:#6B5744;font-weight:900;padding:0.15rem 0;">
                <span>GST ({{ Math.round(Number(bill?.restaurant?.gst_rate || 5)) }}%)</span><span>₹{{ Number(bill?.gst||0).toLocaleString() }}</span>
              </div>
              <div style="display:flex;justify-content:space-between;color:#1A1208;font-weight:900;padding:0.55rem 0 0;border-top:1px solid rgba(111,78,55,0.12);margin-top:0.35rem;">
                <span>Total</span><span style="font-family:'Playfair Display',serif;font-size:1.35rem;color:#6F4E37;">₹{{ Number(bill?.total||0).toLocaleString() }}</span>
              </div>
            </div>
          </div>

           <div v-if="bill?.restaurant?.bill_terms" style="margin-top:0.9rem;padding:0.75rem 0.9rem;border:1.5px solid rgba(111,78,55,0.12);border-radius:0.75rem;background:#FAFAF7;color:#6B5744;font-weight:800;font-size:0.85rem;line-height:1.45;">
              <b style="color:#1A1208;">Terms:</b> {{ bill.restaurant.bill_terms }}
            </div>

            <div style="margin-top:1rem;display:flex;gap:0.75rem;justify-content:flex-end;flex-wrap:wrap;">
             <button class="btn-ghost" @click="closeBillModal">Close</button>
             <button class="btn-primary" @click="printBill(bill)">
               <i class="bi bi-printer"></i> Export / Print
             </button>
            </div>
          </div>
        </div>

      <!-- Live batch details modal -->
      <div v-show="liveModalOpen"
           style="position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:60;padding:1.25rem;"
           @click.self="closeLiveModal">
        <div class="panel" style="width:min(760px,100%);max-height:85vh;overflow:auto;padding:0;">
          <div style="padding:1rem 1.25rem;border-bottom:1px solid rgba(111,78,55,0.12);display:flex;align-items:center;gap:0.75rem;justify-content:space-between;">
            <div>
              <div style="font-weight:900;color:#1A1208;font-size:1.05rem;">In Progress Batch</div>
              <div style="color:#9C8E84;font-weight:900;font-size:0.8125rem;">
                Table {{ liveBatch?.table_number ?? '-' }} | Order #{{ liveBatch?.order_id ?? '-' }} | Batch #{{ liveBatch?.batch_id ?? '-' }}
              </div>
            </div>
            <button @click="closeLiveModal" class="btn-ghost" style="padding:0.5rem 0.7rem;border-radius:0.75rem;">Close</button>
          </div>
          <div style="padding:1rem 1.25rem;">
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-bottom:0.75rem;">
              <span class="badge" :class="liveBatch?.status==='ready'?'badge-ok':(liveBatch?.status==='accepted'?'badge-pending':'badge-neutral')">
                {{ liveBatch?.status || '-' }}
              </span>
              <span style="font-size:0.8125rem;color:#6B5744;font-weight:900;">
                Updated: {{ dateLabel(liveBatch?.last_event_at || liveBatch?.created_at) }} {{ timeLabel(liveBatch?.last_event_at || liveBatch?.created_at) }}
              </span>
            </div>

            <div style="border:1.5px solid rgba(111,78,55,0.12);border-radius:0.75rem;overflow:hidden;">
              <div style="background:#FDF4ED;padding:0.6rem 0.75rem;font-weight:900;color:#6F4E37;">Items</div>
              <div v-if="!liveBatch || (liveBatch.items||[]).length===0" style="padding:0.75rem;color:#9C8E84;font-weight:900;">No items.</div>
              <div v-else>
                <div v-for="it in (liveBatch.items||[])" :key="it.dish + it.price"
                     style="display:flex;justify-content:space-between;gap:1rem;padding:0.65rem 0.75rem;border-top:1px solid rgba(111,78,55,0.08);">
                  <div style="font-weight:900;color:#1A1208;">{{ it.dish }}</div>
                  <div style="display:flex;gap:0.75rem;align-items:center;">
                    <div style="font-weight:900;color:#6B5744;">x{{ it.qty }}</div>
                    <div style="font-weight:900;color:#6F4E37;">Rs. {{ Number((it.price||0)*(it.qty||0)).toLocaleString() }}</div>
                  </div>
                </div>
              </div>
            </div>
            <div style="margin-top:0.9rem;display:flex;justify-content:flex-end;font-weight:900;color:#1A1208;">
              Total: <span style="margin-left:0.5rem;color:#6F4E37;">Rs. {{ Number(liveBatch?.total||0).toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
      </teleport>
    </div>
  `,
  props: ['pendingOrders', 'selectedOrder'],
  emits: ['select', 'approve', 'reject', 'refresh'],
  setup() {
    const { ref, computed } = Vue;
    // Lazy import to avoid changing how manager dashboard passes props.
    const mode = ref('pending'); // pending | live | closed
    const q = ref('');
    const range = ref('all'); // all | today | 7d | 30d
    const closedOrders = ref([]);
    const closedLoading = ref(false);
    const closedError = ref('');

    const liveBatches = ref([]);
    const liveLoading = ref(false);
    const liveError = ref('');
    const liveModalOpen = ref(false);
    const liveBatch = ref(null);
    const liveClosing = ref(false);

    const billModalOpen = ref(false);
    const bill = ref(null);

    let debounceTimer = null;

    const loadClosed = async () => {
      const api = (await import('../js/api.js')).default;
      closedLoading.value = true;
      closedError.value = '';
      try {
        const res = await api.getClosedOrders(q.value || '', 200);
        closedOrders.value = res.orders || [];
      } catch (e) {
        closedError.value = e?.message || 'Failed to load closed orders';
      } finally {
        closedLoading.value = false;
      }
    };

    const loadLive = async () => {
      const api = (await import('../js/api.js')).default;
      liveLoading.value = true;
      liveError.value = '';
      try {
        const res = await api.getLiveBatches(q.value || '', 250);
        liveBatches.value = res.live_batches || [];
      } catch (e) {
        liveError.value = e?.message || 'Failed to load live orders';
      } finally {
        liveLoading.value = false;
      }
    };

    const filteredClosedOrders = computed(() => {
      const list = closedOrders.value || [];
      const r = range.value || 'all';
      if (r === 'all') return list;

      const now = new Date();
      const start = new Date(now);
      if (r === 'today') {
        start.setHours(0, 0, 0, 0);
      } else if (r === '7d') {
        start.setDate(start.getDate() - 7);
      } else if (r === '30d') {
        start.setDate(start.getDate() - 30);
      }

      return list.filter((o) => {
        if (!o || !o.created_at) return false;
        const d = new Date(o.created_at);
        return !isNaN(d.getTime()) && d >= start;
      });
    });

    const filteredLiveBatches = computed(() => {
      const list = liveBatches.value || [];
      const r = range.value || 'all';
      if (r === 'all') return list;

      const now = new Date();
      const start = new Date(now);
      if (r === 'today') start.setHours(0, 0, 0, 0);
      else if (r === '7d') start.setDate(start.getDate() - 7);
      else if (r === '30d') start.setDate(start.getDate() - 30);

      return list.filter((b) => {
        const iso = b.last_event_at || b.created_at;
        if (!iso) return false;
        const d = new Date(iso);
        return !isNaN(d.getTime()) && d >= start;
      });
    });

    const loadCurrent = async () => {
      if (mode.value === 'live') return loadLive();
      if (mode.value === 'closed') return loadClosed();
    };

    const debouncedLoadCurrent = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadCurrent(), 250);
    };

    const openLive = async () => {
      mode.value = 'live';
      await loadLive();
    };

    const openClosed = async () => {
      mode.value = 'closed';
      await loadClosed();
    };

    const openLiveDetails = (b) => {
      liveBatch.value = b;
      liveModalOpen.value = true;
    };

    const closeLiveModal = () => {
      liveModalOpen.value = false;
      liveBatch.value = null;
    };

    const closeLiveOrder = async (b) => {
      if (!b || !b.table_number) return alert('Missing table number');
      const ok = window.confirm(`Close order for Table ${b.table_number}? This will only work if all dishes are delivered.`);
      if (!ok) return;

      const api = (await import('../js/api.js')).default;
      liveClosing.value = true;
      try {
        await api.closeManagerTable(b.table_number);
        // Refresh both views since a close moves the order into "Closed Bills".
        await loadLive();
        if (mode.value === 'closed') await loadClosed();
      } catch (e) {
        alert(e?.message || 'Failed to close order');
      } finally {
        liveClosing.value = false;
      }
    };

    const tabBtnStyle = (id) => {
      const active = mode.value === id;
      return {
        background: active ? '#6F4E37' : 'white',
        color: active ? 'white' : '#1A1208',
        borderColor: active ? '#6F4E37' : 'rgba(111,78,55,0.18)',
        boxShadow: active ? '0 10px 24px rgba(111,78,55,0.18)' : 'none'
      };
    };

    const dateLabel = (iso) => {
      try {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
      } catch {
        return '';
      }
    };

    const timeLabel = (iso) => {
      try {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    };

    const timeAgo = (iso) => {
      try {
        if (!iso) return '';
        const d = new Date(iso);
        const diffMs = Date.now() - d.getTime();
        if (!Number.isFinite(diffMs)) return '';
        const sec = Math.floor(diffMs / 1000);
        if (sec < 20) return 'just now';
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min} min ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr} hr ago`;
        const day = Math.floor(hr / 24);
        return `${day} day${day === 1 ? '' : 's'} ago`;
      } catch {
        return '';
      }
    };

    const money = (v) => {
      const n = Number(v || 0);
      try {
        const f = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
        return `₹${f.format(Math.round(n || 0))}`;
      } catch {
        return `₹${Math.round(n || 0)}`;
      }
    };

    const fmtPct = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return '0%';
      return `${Math.round(n)}%`;
    };

    const itemCount = (o) => {
      const items = (o && o.items) ? o.items : [];
      let sum = 0;
      for (const it of items) sum += Number(it?.qty || 0) || 0;
      return sum > 0 ? sum : (items.length || 0);
    };

    const lineTotal = (it) => {
      try {
        const qty = Number(it?.qty || 0) || 0;
        const p = Number(it?.unit_price ?? it?.price ?? 0) || 0;
        const t = Number(it?.line_total ?? 0);
        if (Number.isFinite(t) && t > 0) return t;
        return qty * p;
      } catch {
        return 0;
      }
    };

    const manufacturingCost = (o) => {
      try {
        const items = (o && o.items) ? o.items : [];
        let sum = 0;
        for (const it of items) {
          const qty = Number(it?.qty || 0) || 0;
          const c = Number(it?.unit_cost ?? 0) || 0;
          sum += qty * c;
        }
        return Math.round(sum * 100) / 100;
      } catch {
        return 0;
      }
    };

    const orderTotal = (o) => {
      try {
        const t = Number(o?.total ?? 0);
        if (Number.isFinite(t) && t > 0) return t;
        const items = (o && o.items) ? o.items : [];
        let sum = 0;
        for (const it of items) sum += Number(lineTotal(it) || 0) || 0;
        return Math.round(sum * 100) / 100;
      } catch {
        return 0;
      }
    };

    const profitTotal = (o) => {
      const t = Number(orderTotal(o) || 0) || 0;
      const c = Number(manufacturingCost(o) || 0) || 0;
      return Math.round((t - c) * 100) / 100;
    };

    const viewBill = async (o) => {
      const api = (await import('../js/api.js')).default;
      try {
        const res = await api.getOrderBill(o.order_id);
        bill.value = res.bill;
        billModalOpen.value = true;
      } catch (e) {
        alert(e?.message || 'Failed to load bill');
      }
    };

    const closeBillModal = () => {
      billModalOpen.value = false;
      bill.value = null;
    };

    const printBill = (b) => {
      if (!b) return;
      const w = window.open('', '_blank', 'width=860,height=900');
      if (!w) return alert('Popup blocked. Allow popups to export.');

      const r = b.restaurant || {};
      const restName = r.restaurant_name || '';
      const restMeta = [
        (r.address || ''),
        (r.gstin ? `GSTIN: ${r.gstin}` : ''),
        (r.phone_number ? `Phone: ${r.phone_number}` : ''),
      ].filter(Boolean).join(' | ');

      const restRate = Number(r.gst_rate || 5);
      const restTerms = String(r.bill_terms || '');

      const rows = (b.items || []).map((it) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;font-weight:700;">${escapeHtml(it.name)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">${it.qty}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">Rs. ${Number(it.amount||0).toLocaleString()}</td>
        </tr>
      `).join('');

      w.document.write(`
        <html>
          <head>
            <title>Bill - Order ${b.order_id}</title>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color:#111; }
              h1 { margin:0; font-size: 20px; }
              .muted { color:#666; font-size:12px; margin-top:6px; }
              table { width:100%; border-collapse:collapse; margin-top:18px; }
              th { text-align:left; padding:10px 8px; background:#f6f2ee; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; }
              .totals { margin-top: 16px; width: 320px; margin-left:auto; }
              .totals div { display:flex; justify-content:space-between; padding:6px 0; font-weight:700; }
              .total { border-top:2px solid #eee; padding-top:10px; font-size:16px; }
            </style>
          </head>
          <body>
            <h1>Bill</h1>
             ${restName ? `<div style=\"font-weight:800;margin-top:10px;font-size:14px;\">${escapeHtml(restName)}</div>` : ''}
             ${restMeta ? `<div style=\"color:#666;font-size:12px;margin-top:4px;\">${escapeHtml(restMeta)}</div>` : ''}
            <div class="muted">Order #${b.order_id} | Table ${b.table_number ?? '-'} | ${escapeHtml(dateLabel(b.created_at))} ${escapeHtml(timeLabel(b.created_at))} - ${escapeHtml(timeLabel(b.closed_at))}</div>
            <table>
              <thead>
                <tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Amount</th></tr>
              </thead>
              <tbody>${rows || ''}</tbody>
            </table>
            <div class="totals">
              <div><span>Subtotal</span><span>Rs. ${Number(b.subtotal||0).toLocaleString()}</span></div>
              <div><span>GST (${Number(restRate||5)}%)</span><span>Rs. ${Number(b.gst||0).toLocaleString()}</span></div>
              <div class="total"><span>Total</span><span>Rs. ${Number(b.total||0).toLocaleString()}</span></div>
            </div>
            <script>window.onload = () => { window.print(); };</script>
          </body>
        </html>
      `);
      w.document.close();
    };

    const exportBill = async (o) => {
      await viewBill(o);
      // printing is available in modal as well; auto-print feels intrusive, so keep manual.
    };


    const escapeHtml = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    }[c] || c));

    return {
      mode,
      q,
      range,
      closedOrders,
      filteredClosedOrders,
      closedLoading,
      closedError,
      loadClosed,
      openClosed,
      liveBatches,
      filteredLiveBatches,
      liveLoading,
      liveError,
      loadLive,
      openLive,
      loadCurrent,
      debouncedLoadCurrent,
      openLiveDetails,
      liveModalOpen,
      liveBatch,
      closeLiveModal,
      liveClosing,
      closeLiveOrder,
      tabBtnStyle,
      dateLabel,
      timeLabel,
      timeAgo,
      money,
      fmtPct,
      itemCount,
      lineTotal,
      manufacturingCost,
      profitTotal,
      orderTotal,
      viewBill,
      billModalOpen,
      bill,
      closeBillModal,
      printBill
    };
  }
};
