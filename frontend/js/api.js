const API_BASE = '/api';

// Store token
let authToken = localStorage.getItem('managerToken') || null;

const api = {
    setToken(token) {
        authToken = token;
        if (token) {
            localStorage.setItem('managerToken', token);
        } else {
            localStorage.removeItem('managerToken');
        }
    },
    
    getToken() {
        return authToken;
    },
    
    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken || ''
            },
            ...options
        };
        
        const response = await fetch(url, config);

        let data = null;
        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {
            const msg = (data && (data.error || data.message)) ? (data.error || data.message) : `API Error: ${response.status}`;
            const err = new Error(msg);
            err.status = response.status;
            err.payload = data;
            throw err;
        }

        return data;
    },

    // Public customer endpoints (no manager auth)
    async customerRequest(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        };

        const response = await fetch(url, config);

        let data = null;
        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {
            const msg = (data && (data.error || data.message)) ? (data.error || data.message) : `API Error: ${response.status}`;
            const err = new Error(msg);
            err.status = response.status;
            err.payload = data;

            // Customer "auth" is table_number + table_token.
            // If the DB was recreated, saved tokens become invalid; notify the app to re-select a table.
            try {
                if (response.status === 401 && data && (data.error === 'Invalid table' || data.message === 'Invalid table')) {
                    err.code = 'INVALID_TABLE';
                    window.dispatchEvent(new CustomEvent('dineflow:invalid-table'));
                }
            } catch {}
            throw err;
        }

        return data;
    },
    
    // Manager endpoints
    login(email, password) {
        return this.request('/manager/login', {
            method: 'POST',
            body: JSON.stringify({email, password})
        });
    },

    getManagerSettings() {
        return this.request('/manager/settings');
    },

    updateManagerSettings(payload) {
        return this.request('/manager/settings', {
            method: 'PUT',
            body: JSON.stringify(payload || {})
        });
    },

    getManagerAnalytics(params = {}) {
        const qs = new URLSearchParams();
        if (params.from) qs.set('from', params.from);
        if (params.to) qs.set('to', params.to);
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return this.request(`/manager/analytics${suffix}`);
    },

    getManagerActivity(limit = 60, sinceId = null) {
        const qs = new URLSearchParams();
        if (limit) qs.set('limit', String(limit));
        if (sinceId) qs.set('since_id', String(sinceId));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return this.request(`/manager/activity${suffix}`);
    },

    getManagerPublicOrigin() {
        return this.request('/manager/public-origin');
    },

    getCustomerTables() {
        return this.customerRequest('/customer/tables');
    },

    getCustomerMenu() {
        return this.customerRequest('/customer/menu');
    },

    generateCustomerAIDish(payload) {
        return this.customerRequest('/customer/ai/custom-dish', {
            method: 'POST',
            body: JSON.stringify(payload || {})
        });
    },

    createCustomDishOrder(payload) {
        return this.customerRequest('/customer/orders/custom', {
            method: 'POST',
            body: JSON.stringify(payload || {})
        });
    },

    // Customer orders (DB-backed)
    placeCustomerOrder(payload) {
        return this.customerRequest('/customer/orders/place', {
            method: 'POST',
            body: JSON.stringify(payload || {})
        });
    },

    getCustomerActiveOrder(table_number, table_token) {
        const q = new URLSearchParams({ table_number: String(table_number || ''), table_token: String(table_token || '') });
        return this.customerRequest(`/customer/orders/active?${q.toString()}`);
    },

    getCustomerOrderHistory(table_number, table_token) {
        const q = new URLSearchParams({ table_number: String(table_number || ''), table_token: String(table_token || '') });
        return this.customerRequest(`/customer/orders/history?${q.toString()}`);
    },

    requestCustomerCloseOrder(table_number, table_token) {
        return this.customerRequest('/customer/orders/request-close', {
            method: 'POST',
            body: JSON.stringify({ table_number, table_token })
        });
    },

    // Chef endpoints (no auth for now)
    getChefQueue() {
        return this.customerRequest('/chef/queue');
    },

    markChefItemDone(itemId) {
        return this.customerRequest(`/chef/items/${itemId}/done`, { method: 'POST' });
    },

    getChefItemRecipe(itemId) {
        return this.customerRequest(`/chef/items/${itemId}/recipe`);
    },

    // Waiter endpoints (no auth for now)
    getWaiterTablesStatus() {
        return this.customerRequest('/waiter/tables/status');
    },

    getWaiterReadyItems() {
        return this.customerRequest('/waiter/orders/ready-items');
    },

    getWaiterServedToday() {
        return this.customerRequest('/waiter/orders/served-today');
    },

    getWaiterBill(tableNumber) {
        return this.customerRequest(`/waiter/bill/${tableNumber}`);
    },

    deliverWaiterItem(itemId) {
        return this.customerRequest(`/waiter/items/${itemId}/deliver`, { method: 'POST' });
    },

    closeWaiterTable(tableNumber, payment_method = null) {
        const payload = {};
        const qs = new URLSearchParams();
        if (payment_method) {
            payload.payment_method = payment_method;
            qs.set('payment_method', payment_method);
        }
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return this.customerRequest(`/waiter/tables/${tableNumber}/close${suffix}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },
    
    getOrders() {
        return this.request('/manager/dashboard/orders');
    },
    
    approveOrder(batchId) {
        return this.request(`/manager/orders/${batchId}/approve`, {method: 'PATCH'});
    },
    
    rejectOrder(batchId) {
        return this.request(`/manager/orders/${batchId}/reject`, {method: 'PATCH'});
    },

    getLiveBatches(q = '', limit = 250) {
        const qs = new URLSearchParams();
        if (q) qs.set('q', q);
        if (limit) qs.set('limit', String(limit));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return this.request(`/manager/orders/live${suffix}`);
    },

    // Manager closed orders/bills
    getClosedOrders(q = '', limit = 200) {
        const qs = new URLSearchParams();
        if (q) qs.set('q', q);
        if (limit) qs.set('limit', String(limit));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return this.request(`/manager/orders/closed${suffix}`);
    },

    getOrderBill(orderId) {
        return this.request(`/manager/orders/${orderId}/bill`);
    },

    closeManagerTable(tableNumber, payment_method = null) {
        const payload = {};
        const qs = new URLSearchParams();
        if (payment_method) {
            payload.payment_method = payment_method;
            qs.set('payment_method', payment_method);
        }
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return this.request(`/manager/tables/${tableNumber}/close${suffix}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },
     
    getMenu() {
        return this.request('/manager/menu');
    },

    // Full dish list for manager dashboard
    getDishes() {
        return this.request('/manager/dishes');
    },
    
    getInventory() {
        return this.request('/manager/inventory');
    },

    // Tables (QR codes)
    getTables() {
        return this.request('/manager/tables');
    },

    ensureTables(count) {
        return this.request('/manager/tables/ensure', {
            method: 'POST',
            body: JSON.stringify({ count })
        });
    },

    clearTables() {
        return this.request('/manager/tables/clear', {
            method: 'POST'
        });
    },
    
    // Ingredients CRUD
    addIngredient(ingredientData) {
        return this.request('/manager/ingredients', {
            method: 'POST',
            body: JSON.stringify(ingredientData)
        });
    },
    
    editIngredient(ingredientId, ingredientData) {
        return this.request(`/manager/ingredients/${ingredientId}`, {
            method: 'PUT',
            body: JSON.stringify(ingredientData)
        });
    },
    
    deleteIngredient(ingredientId) {
        return this.request(`/manager/ingredients/${ingredientId}`, {
            method: 'DELETE'
        });
    },
    
    // Dishes CRUD
    addDish(dishData) {
        return this.request('/manager/dishes', {
            method: 'POST',
            body: JSON.stringify(dishData)
        });
    },
    
    editDish(dishId, dishData) {
        return this.request(`/manager/dishes/${dishId}`, {
            method: 'PUT',
            body: JSON.stringify(dishData)
        });
    },
    
    deleteDish(dishId) {
        return this.request(`/manager/dishes/${dishId}`, {
            method: 'DELETE'
        });
    },

    // Image upload (multipart/form-data)
    async uploadImage(file) {
        const url = `${API_BASE}/manager/uploads/image`;
        const form = new FormData();
        form.append('file', file);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authToken || ''
            },
            body: form
        });

        let data = null;
        try { data = await response.json(); } catch { data = null; }

        if (!response.ok) {
            const msg = (data && (data.error || data.message)) ? (data.error || data.message) : `API Error: ${response.status}`;
            const err = new Error(msg);
            err.status = response.status;
            err.payload = data;
            throw err;
        }

        return data;
    },
    
    // Dish Ingredients (Recipe)
    addDishIngredient(dishId, ingredientData) {
        return this.request(`/manager/dishes/${dishId}/ingredients`, {
            method: 'POST',
            body: JSON.stringify(ingredientData)
        });
    },
    
    editDishIngredient(dishId, ingredientId, ingredientData) {
        return this.request(`/manager/dishes/${dishId}/ingredients/${ingredientId}`, {
            method: 'PUT',
            body: JSON.stringify(ingredientData)
        });
    },
    
    removeDishIngredient(dishId, ingredientId) {
        return this.request(`/manager/dishes/${dishId}/ingredients/${ingredientId}`, {
            method: 'DELETE'
        });
    },
    
    getDishIngredients(dishId) {
        return this.request(`/manager/dishes/${dishId}/ingredients`);
    }
};

export default api;
