# 🎨 Real-Time Collaborative Whiteboard

A modern, full-stack, enterprise-ready collaborative whiteboard application built with **React 19**, **TypeScript**, **Konva.js**, **Bootstrap 5**, and **Lucide Icons**. It features sub-millisecond multi-user canvas synchronization, real-time presence cursors, ephemeral presentation lasers, interactive board templates, responsive auto-docking toolbars, live chat, and email invitations — secured with **Keycloak OpenID Connect / OAuth2**.

---

## 🌟 Key Highlights & Feature Matrix

### 1. 🖌️ Canvas Engine & Drawing Tools
- **Freehand Pen & Highlighter**: Smooth Bezier tension rendering with opacity controls.
- **Precision Geometric Shapes**: Rectangles, Circles, and Directional Arrows.
- **Standalone Canvas Text Tool (`T`)**: Click anywhere to place, edit, and move freeform text headers and diagram labels.
- **Interactive Sticky Notes (`S`)**: Draggable, color-customizable sticky notes with live inline editing and delete handles.
- **Refined Eraser (`E`)**: Bold pixel-level clipping (`destination-out`) with dynamic visual circular indicator ring that follows cursor movement.
- **Dynamic Stroke & Color Swatches**: Real-time pixel size slider (2px–24px, up to 120px on eraser) and preset color swatches with custom color picker.
- **Undo / Redo & Clear**: Full history stack management with keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`).

### 2. ⚡ Infinite Canvas Navigation
- **Smooth Zoom & Pan**: Mouse wheel zoom ($10\% - 500\%$) centering toward cursor coordinates.
- **Hand Tool & Spacebar Navigation**: Pan the canvas effortlessly via the Hand Tool (`H`) or hold `Spacebar + Drag`.
- **Canvas HUD**: Real-time zoom level display with 1-click **Reset (100%)** and **Fit-to-Screen**.
- **Inverse Coordinate Transform**: Mathematical coordinate projection ensuring flawless drawing at any zoom or pan offset.

### 3. 🎯 Real-Time Laser Pointer Presentation Tool (`L`)
- **Ephemeral Neon Laser Lines**: Broadcast temporary glowing laser trails across connected peers with automatic 1.5-second opacity fade-out decay via `requestAnimationFrame`.

### 4. 📋 1-Click Interactive Board Templates
- Instant generation of prebuilt collaborative boards:
  - **Kanban Board** (To Do, In Progress, Done columns with sample tasks)
  - **SWOT Analysis** (2x2 matrix for Strengths, Weaknesses, Opportunities, Threats)
  - **Sprint Retrospective** (What went well, What to improve, Action items)
  - **Brainstorming Canvas** (Central vision with structured idea clusters)

### 5. 🧰 Draggable & Dual-Orientation Auto-Docking Toolbar
- **Drag Anywhere**: Grip handle `⠿` allows repositioning the toolbar anywhere on screen with automatic boundary clamping.
- **Smart Edge-Snapping**: Automatically adapts to a sleek **Vertical Sidebar Drawer Dock** when moved near left/right screen edges, and returns to a **Horizontal Dock** when moved near bottom/center.
- **Manual Layout Switcher (`⇄`)**: Toggle between horizontal and vertical orientation on demand.
- **Collapsible Mini-Pill Mode**: Minimizes into an ultra-compact floating widget displaying the active tool icon.

### 6. 👥 Real-Time Collaboration & Communication
- **Live User Presence Cursors**: Real-time peer mouse coordinates with labeled user avatars and color badges.
- **Emoji Reaction Bursts**: Interactive live floating reaction bursts (`🎉`, `👍`, `❤️`, `🔥`).
- **Resizable Live Chat Drawer**: Timestamped messaging, unread message badges, auto-scroll, and draggable width handle (250px–600px).
- **Email Room Invitations**: Send session invites directly via Node.js SMTP/Nodemailer or 1-click link copying.

### 7. 📥 Export & Session Management
- **Export to PDF Document**: High-resolution vector-rendered PDF document export via `jsPDF`.
- **Export to PNG Image**: 2x pixel ratio image export for crystal-clear presentations.
- **Export as Video (WebM)**: Animated recording of canvas drawing history.
- **Canvas Replay Mode**: Step-by-step replay animation of the whiteboard creation.
- **Theme Support**: Dark Mode and Light Mode with system preference detection.
- **Keyboard Shortcuts Cheat-Sheet (`?`)**: Full hotkey modal for maximum productivity.

---

## 🏗️ Architecture & Tech Stack

| Layer | Technology / Package | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 + Vite | High-performance reactive UI with fast HMR |
| **Language** | TypeScript | Strict type safety across all canvas and socket events |
| **Canvas Engine** | Konva (`react-konva`) | 2D canvas library with high-performance scene graph |
| **Styling & Icons** | Bootstrap 5.3 + Lucide React | Glassmorphic UI, responsive layout, modern vector icons |
| **Identity & Security** | Keycloak (Docker) + `keycloak-js` | Enterprise OpenID Connect / OAuth2 Authentication |
| **Real-Time WebSockets** | Socket.io (`socket.io-client`) | Bi-directional, low-latency room event broadcasting |
| **Export Utilities** | `jspdf` + MediaRecorder API | PDF export and WebM video canvas capture |
| **Backend Service** | Node.js + Express + Nodemailer | Room state manager and invitation mailer |

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action |
| :--- | :--- |
| <kbd>P</kbd> | Select **Pen Tool** |
| <kbd>T</kbd> | Select **Text Tool** (Click canvas to place text) |
| <kbd>S</kbd> | Select **Sticky Note Tool** |
| <kbd>E</kbd> | Select **Eraser Tool** |
| <kbd>R</kbd> | Select **Rectangle Shape** |
| <kbd>C</kbd> | Select **Circle Shape** |
| <kbd>A</kbd> | Select **Arrow Tool** |
| <kbd>L</kbd> | Select **Laser Pointer Presentation Tool** |
| <kbd>H</kbd> / <kbd>Space</kbd> + Drag | **Pan Canvas** |
| <kbd>Ctrl</kbd> + <kbd>Scroll</kbd> | **Zoom In / Out** |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | **Undo** |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> | **Redo** |
| <kbd>?</kbd> or <kbd>Shift</kbd> + <kbd>/</kbd> | Open **Keyboard Shortcuts Cheat-Sheet** |
| <kbd>Esc</kbd> | Close Modals / Exit Text & Sticky Editing |

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** (v18 or higher)
- **Docker Desktop** (for Keycloak identity provider)

---

### Step 1: Start Keycloak in Docker

```bash
docker run -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

#### Keycloak Configuration:
1. Open Admin Console at `http://localhost:8080/admin` (User: `admin`, Password: `admin`).
2. Create Realm: **`whiteboard-realm`**.
3. Create Client: **`react-client`**.
   - **Client authentication**: `Off` (Public client).
   - **Valid Redirect URIs**: `http://localhost:5173/*`
   - **Web Origins**: `*`
4. Under **Users**, create a test user (e.g. `testuser`) and set a password in the **Credentials** tab.

---

### Step 2: Start the Backend Server

```bash
cd server
npm install
node index.js
```
*Backend runs on `http://localhost:5000`.*

---

### Step 3: Start the Frontend Application

```bash
cd whiteboard-app
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

---

## 📂 Project Structure

```text
Project Whiteboard/
├── server/
│   ├── index.js              # Socket.io event handling, room memory & mailer
│   ├── package.json
│   └── .env
├── whiteboard-app/
│   ├── src/
│   │   ├── components/
│   │   │   └── Whiteboard.tsx # Main canvas, dual-orientation toolbar & chat UI
│   │   ├── utils/
│   │   │   └── templates.ts   # Prebuilt board templates (Kanban, SWOT, Retro, etc.)
│   │   ├── types/
│   │   │   └── whiteboard.ts  # Shared TypeScript interfaces
│   │   ├── keycloak.ts       # Keycloak OIDC client configuration
│   │   ├── App.tsx            # Main layout and authentication guard
│   │   ├── main.tsx           # Application root entry point
│   │   └── index.css          # Glassmorphic styling, dark mode & animations
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).