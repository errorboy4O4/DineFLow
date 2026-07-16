<div align="center">

# ☕ DineFlow

### Smart Restaurant Management System

*A complete, mobile-first restaurant platform that connects every role in the kitchen — from the customer's first tap to the final bill.*

<br/>

![Flask](https://img.shields.io/badge/Flask-3.0-black?style=flat-square&logo=flask)
![Vue 3](https://img.shields.io/badge/Vue-3.0-4FC08D?style=flat-square&logo=vue.js)
![SQLite](https://img.shields.io/badge/SQLite-embedded-003B57?style=flat-square&logo=sqlite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat-square&logo=tailwind-css)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python)
![Tests](https://img.shields.io/badge/Tests-163%20passing-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

<br/>

[Features](#-features) · [Tech Stack](#️-tech-stack) · [Getting Started](#-getting-started) · [Architecture](#-architecture) · [API](#-api-overview) · [Testing](#-testing) · [Team](#-team)

---

</div>

## 🌟 What is DineFlow?

DineFlow simulates a real-world restaurant workflow through a unified multi-role web application. Every stakeholder — **Customer**, **Chef**, **Waiter**, and **Manager** — gets a purpose-built dashboard tailored to their responsibilities, all powered by a single Flask REST API backend.

```
Customer scans QR → places order → Manager approves → Chef prepares → Waiter delivers → Bill generated
```

---

## ✨ Features

### 🍽️ Customer
- Browse the full menu with live search and category filters
- AI-powered custom dish suggestions based on dietary preferences
- Add to cart with special instructions per item
- Real-time order tracking with step-by-step status updates
- Full order history with one-tap reordering

### 👨‍🍳 Chef
- Live order queue grouped by dish name across all tables
- Category-coloured rows (Main Course, Starter, Dessert, etc.) for quick scanning
- Multiple table orders consolidated into a single row per dish
- Mark individual items as done — they move automatically to "Served Today"
- Recipe modal for AI-generated custom dishes

### 🧑‍🍽️ Waiter
- Visual table grid showing live status: **Free · Occupied · Ready · Waiting**
- Ready-for-pickup list with per-item delivery confirmation
- Served Today history for shift tracking
- Bill generation with itemised breakdown and QR payment option

### 📊 Manager
- KPI dashboard — Revenue, Active Orders, Tables, Avg Order Value, Items Sold
- Order approval and real-time tracking
- Inventory management with automatic stock deduction and low-stock alerts
- Full menu CRUD — add, edit, remove dishes with linked ingredients
- Pricing calculator with profit margin slider and live sell-price preview
- Analytics with weekly revenue chart and top-dish rankings
- Staff Control — generate QR codes for Chef, Waiter, and Tables
- **Billing Settings** — configure GSTIN, GST rate, payment QR, terms & conditions, and per-field visibility toggles
- Settings — restaurant info, notification preferences, custom dish profit margin

---

## 🛠️ Tech Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.11+ | Primary programming language |
| **Flask** | 3.0 | REST API server and file serving |
| **Flask-SQLAlchemy** | 3.1 | ORM and database management |
| **SQLite** | Embedded | Local relational database |
| **Flask-CORS** | 4.0 | Cross-origin request handling |
| **PyJWT** | Latest | Manager session authentication |
| **Werkzeug** | 3.0 | Password hashing |
| **python-dotenv** | 1.0 | Environment variable management |
| **requests** | 2.31 | HTTP client for AI provider calls |

### Frontend

| Technology | Purpose |
|---|---|
| **Vue 3** (CDN) | Reactive UI and state management |
| **Tailwind CSS** (CDN) | Utility-first layout and styling |
| **Chart.js** (CDN) | Revenue and analytics charts |
| **Bootstrap Icons** (CDN) | Icon library |
| **Google Fonts** | Playfair Display + DM Sans typography |
| **HTML5 / CSS3 / JS** | Core web layer — no build step required |

### AI Integration

| Provider | Model | Purpose |
|---|---|---|
| **Google Gemini** | `gemini-2.5-flash` | Custom dish generation (primary) |
| **Anthropic Claude** | `claude-sonnet-4-6` | Custom dish generation (fallback) |

Switch providers via the `AI_PROVIDER` environment variable.

> **Note:** CDN usage means the client device needs internet access to load Vue, Tailwind, Icons, and Chart.js. The app can run on LAN/hotspot, but if phones or tablets have no internet, the UI libraries may not load correctly.

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js (optional — for `npx serve`)
- VS Code with Live Server extension (recommended for frontend)

### 1 — Clone the Repository

```bash
git clone https://github.com/23f1000687/Code-Rangers.git
cd Code-Rangers
```

### 2 — Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate       # macOS / Linux
venv\Scripts\activate          # Windows

# Upgrade pip
python -m pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt
```

### 3 — Configure Environment Variables (`.env`)

Create or edit `.env` in the project root:

```env
# Choose AI provider: anthropic | gemini
AI_PROVIDER=gemini

# Gemini (optional if using anthropic)
GOOGLE_GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash

# Anthropic (optional if using gemini)
ANTHROPIC_API_KEY=your-anthropic-api-key
CLAUDE_MODEL=claude-sonnet-4-6

# Optional
APP_TIMEZONE=Asia/Kolkata
SECRET_KEY=dev-secret-key-change-in-production

# Optional: override QR base origin (useful with VPN / multiple adapters)
PUBLIC_ORIGIN=http://192.168.137.1:5000
```

### 4 — Start the Backend Server

From the project root:

```bash
python backend/app.py
```

On first run it will:
- Create and verify all database tables (`db.create_all()`)
- Run lightweight SQLite migrations for any new columns
- Seed demo data (ingredients, dishes, recent orders, stock levels)

> API runs at **http://localhost:5000**

### 5 — Open the App in Your Browser

| Role | URL |
|---|---|
| Launcher | `http://127.0.0.1:5000/` |
| Customer | `http://127.0.0.1:5000/customer.html` |
| Manager | `http://127.0.0.1:5000/manager-dashboard.html` |
| Chef | `http://127.0.0.1:5000/chef-dashboard-mobile.html` |
| Waiter | `http://127.0.0.1:5000/waiter.html` |

### 6 — Demo Credentials

- **Manager login:** `dine@gmail.com` / `12345`

---

## 📶 Multi-Device (Wi-Fi / Hotspot) Usage

This project is designed to work with one laptop acting as the server and multiple phones or tablets as clients.

1. Start the backend on the laptop: `python backend/app.py` (it binds to `0.0.0.0:5000`).
2. Connect all devices to the same Wi-Fi or hotspot network.
3. Open the manager dashboard using the laptop's IP address (not `127.0.0.1`), for example: `http://192.168.137.1:5000/manager-dashboard.html`.
4. In Manager → Staff Control, generate QR codes for roles and tables.

**How the QR IP is chosen:**
- The manager dashboard calls `GET /api/manager/public-origin`.
- The backend detects the best local IPv4 (Windows `ipconfig`, Linux `ip -4 addr`, etc.) and returns an `origin` like `http://192.168.137.1:5000`.
- That origin is then reused everywhere for all QR URLs.

If auto-detection picks the wrong IP (e.g. due to VPN or multiple adapters), set `PUBLIC_ORIGIN` in `.env` and restart the backend.

Also ensure Windows Firewall allows inbound traffic on port `5000` for the active network profile.

---

## 📁 Project Structure

```
Code-Rangers/
├── Figma Design/                         ← UI/UX design files and mockups
│
├── Milestone_Reports/                    ← Academic milestone submissions
│   ├── Milestone1/
│   │   └── Milestone-1 Team 51.pdf      ← M1: User Research & Stories
│   ├── Milestone2/
│   │   └── Milestone 2.pdf              ← M2: Design & Frontend
│   ├── Milestone3/
│   │   └── Milestone 3 Report.pdf       ← M3: Backend & Testing (Sprint 1)
│   ├── Milestone4/
│   │   └── Milestone 4 (Sprint 2) Report.pdf  ← M4: Feedback Implementation
│   └── Milestone5/
│       └── Milestone 5.pdf              ← M5: Final Submission
│
├── Presentation/
│   └── DineFlow_AI_Management_final_.pptx  ← Final project presentation
│
├── backend/
│   ├── app.py                           ← Flask entry point & app factory
│   ├── config.py                        ← App configuration & env vars
│   ├── models.py                        ← SQLAlchemy models (9 tables)
│   ├── seed_data.py                     ← Initial database seeder
│   ├── conftest.py                      ← Pytest fixtures & seed helpers
│   ├── test_all_apis.py                 ← 163 pytest cases across 29 classes
│   ├── instance/
│   │   └── restaurant.db               ← SQLite database (auto-created)
│   ├── routes/
│   │   ├── chef_route.py               ← Chef API blueprint
│   │   ├── customers_route.py          ← Customer API blueprint
│   │   ├── manager_route.py            ← Manager API blueprint
│   │   └── waiter_route.py             ← Waiter API blueprint
│   └── services/
│       ├── ai_service.py               ← Gemini / Claude integration
│       ├── activity_store.py           ← Activity event logger
│       ├── close_request_store.py      ← Table close request tracker
│       ├── inventory_service.py        ← Stock deduction logic
│       ├── order_note_store.py         ← Per-order notes store
│       ├── order_service.py            ← Order lifecycle management
│       └── time_service.py             ← Local-time utilities
│
├── frontend/
│   ├── index.html                      ← Role selector launcher
│   ├── customer.html                   ← Customer ordering app
│   ├── manager-dashboard.html          ← Manager control panel
│   ├── chef-dashboard-mobile.html      ← Chef kitchen display
│   ├── waiter.html                     ← Waiter service app
│   ├── components/
│   │   ├── CustomerApp.js              ← Customer root component
│   │   ├── CustomerMenu.js             ← Menu browse & search
│   │   ├── CustomerCart.js             ← Cart & checkout
│   │   ├── CustomerAI.js               ← AI custom dish UI
│   │   ├── CustomerTrack.js            ← Live order tracking
│   │   ├── CustomerHistory.js          ← Order history & reorder
│   │   ├── CustomerTables.js           ← Table selector
│   │   ├── ChefStation.js              ← Chef kitchen queue
│   │   ├── WaiterApp.js                ← Waiter root component
│   │   ├── WaiterTables.js             ← Table grid & status
│   │   ├── WaiterOrders.js             ← Pickup & delivery list
│   │   ├── Dashboard.js                ← Manager KPI dashboard
│   │   ├── Orders.js                   ← Order approval & tracking
│   │   ├── Menu.js                     ← Menu CRUD
│   │   ├── Inventory.js                ← Stock management
│   │   ├── Pricing.js                  ← Profit margin calculator
│   │   ├── Analytics.js                ← Revenue charts & stats
│   │   ├── Settings.js                 ← Restaurant & billing settings
│   │   ├── staffcontrol.js             ← QR code generation for staff
│   │   └── ManagerLogin.js             ← Manager auth screen
│   ├── js/
│   │   └── api.js                      ← Centralised API communication layer
│   └── assets/
│       └── images/                     ← Dish images (uploaded via manager)
│
├── .env                                ← Environment variables (AI keys)
├── .gitignore                          ← Git ignore rules
├── requirements.txt                    ← Python dependencies
└── README.md
```

---

## 🏗️ Architecture

### Database Models

The system uses **9 relational models** managed via SQLAlchemy:

```
Manager ──────────────────────────────────┐
RestaurantTable                           │
Ingredient                                ├── Core entities
Dish ←── DishIngredient ── Ingredient     │
CustomDishIngredient                      ┘

Order ──── OrderBatch ──── OrderItem ──── Dish
  │              │
RestaurantTable  └── kitchen_status · delivered_at
```

### Order Lifecycle

```
Customer places order
        ↓
    [sent] ── Manager reviews ──→ [accepted]
                                       ↓
                               Chef sees in queue
                                       ↓
                               Chef marks done ──→ [ready]
                                                      ↓
                                              Waiter delivers ──→ [delivered]
                                                                       ↓
                                                              Manager closes ──→ [closed]
```

### Role Navigation

```
frontend/index.html
    ├──▶ customer.html              (mobile, max-width 430px)
    ├──▶ chef-dashboard-mobile.html (mobile, max-width 430px)
    ├──▶ waiter.html                (mobile, max-width 430px)
    └──▶ manager-dashboard.html     (full desktop dashboard)
```

Each dashboard is fully independent and can be opened directly without going through `index.html`.

---

## 📡 API Overview

The REST API is structured across **4 blueprints** under the `/api/` prefix, covering **37+ endpoints**. Authentication uses JWT tokens for manager routes.

| Blueprint | Prefix | Key Endpoints |
|---|---|---|
| **Manager** | `/api/manager/` | auth, analytics, inventory, menu, orders, settings, billing, staff |
| **Chef** | `/api/chef/` | queue, mark-done, served-today, recipes |
| **Waiter** | `/api/waiter/` | tables, deliver, bill, close |
| **Customer** | `/api/customer/` | menu, cart, order, track, history, AI-dish |

Full API documentation is available as a **Swagger-compatible OpenAPI 3.0 YAML**, importable directly into Swagger UI or Redoc.

---

## 🧪 Testing

The test suite covers all 4 blueprints with **163 individual test cases** across **29 test classes**, using pytest with Flask's built-in test client and an in-memory SQLite database — no live server required.

```bash
cd backend
pytest test_all_apis.py -v
```

### Run Tests for a Specific Blueprint

```bash
# Manager tests only
pytest test_all_apis.py -v -k "Manager"

# Chef tests only
pytest test_all_apis.py -v -k "Chef"

# Waiter tests only
pytest test_all_apis.py -v -k "Waiter"

# Customer tests only
pytest test_all_apis.py -v -k "Customer"
```

### Test Coverage

| Blueprint | Test Classes | Test Cases |
|---|---|---|
| Manager | — | 76 |
| Chef | — | 19 |
| Waiter | — | 33 |
| Customer | — | 35 |
| **Total** | **29** | **163** |

### Notes
- No live server required — tests use Flask's built-in test client with an in-memory SQLite database.
- Each test runs in complete isolation — the database is reset before every test automatically via an `autouse` fixture.
- Shared seed helpers (`seed_manager()`, `seed_table()`, `seed_dish()`, `seed_full_order()`) keep individual tests concise and focused.
- Expected result: **163 passed** with no errors or warnings.

---

## 🤖 AI Custom Dish Generation

The AI service generates custom recipes based on customer dietary preferences through the following pipeline:

1. Customer describes preferences (e.g. "high-protein, no gluten, spicy")
2. AI generates a dish name, description, and ingredient list
3. Ingredients are mapped to existing inventory items
4. Quantities are normalised to a single serving
5. Selling price is calculated using the manager-defined profit margin
6. Chef receives a ready-to-cook recipe in the kitchen display

> **Note:** Customer order notes and manager "Recent Activity" are stored in memory while the server is running. They are temporary and will be lost on server restart.

---

## 🎨 Design System

| Token | Hex | Usage |
|---|---|---|
| **Coffee Brown** | `#6F4E37` | Primary colour, buttons, headings |
| **Cream** | `#F8F5F0` | Page background |
| **Mint** | `#3AAFA9` | Accent, success actions |
| **Amber** | `#F4A261` | Warnings, highlights |
| **Dark** | `#1A1208` | Navigation bars, body text |
| **Error** | `#E63946` | Alerts, danger actions |

---

## 🔐 Authentication Notes

- Manager endpoints require a valid JWT token; `401` errors on `/api/manager/...` mean the token is missing or expired.
- Customer, Chef, and Waiter routes are not password-protected in this demo build (designed for LAN usage).
- Customer actions (placing orders, AI dish generation) still require a valid table token obtained by scanning the table QR code.

---

## 📋 Project Milestones

| Milestone | Focus | Key Output |
|---|---|---|
| **M1** | User Research & Stories | 4 roles identified, 11 SMART user stories |
| **M2** | Design & Frontend | Full UI across all 4 roles, ER diagram, Scrum meetings |
| **M3 / Sprint 1** | Backend & Testing | 37+ endpoints, 163 tests, Swagger YAML, user feedback |
| **M4 / Sprint 2** | Feedback Implementation | Billing settings, 12 new DB columns, updated docs |
| **M5** | Final Submission | Demo video, presentation, comprehensive report |

---

## 👥 Team

**Team 051 — Jan 2026 Term · IIT Madras**

| Name | Roll Number |
|---|---|
| Kaushik Gaur | 23f1000687 |
| Shriyanshi Parashari | 22f3001012 |
| Aadil Iqbal | 23f1001130 |
| Nachiket Gore | 23f1000542 |

---

<div align="center">

*Built with ☕ using Flask · Vue 3 · Tailwind CSS · SQLAlchemy · Google Gemini · Anthropic Claude*

</div>
