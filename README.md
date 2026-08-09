# Real-Time Collaborative Whiteboard

A full-stack, responsive real-time whiteboard application built with **React**, **TypeScript**, **Konva.js**, and **Bootstrap 5**, featuring real-time multi-user canvas synchronization and live chat powered by **Socket.io**, secured via **Keycloak** running in Docker.

---

## 📸 Application Preview

![Application Screenshot](./screenshot.png)

---

## ✨ Key Features

### 🔒 Authentication & Access Control
- **Keycloak OAuth Guard**: Mandatory authentication before accessing the whiteboard.
- **Session Management**: Integrates `keycloak-js` to extract authenticated user details.
- **Containerized Identity Provider**: Runs Keycloak inside Docker.

### 🎨 Whiteboard Engine & Drawing Tools
- **Freehand Pen & Eraser Tools**: Custom stroke width control and color palette.
- **Undo / Redo History**: Complete client-side history stack management.
- **Canvas Clearing**: Quick reset for individual rooms.
- **Export Capabilities**: High-resolution PNG image download.

### ⚡ Real-Time Collaboration
- **Multi-User Synchronization**: Synchronizes drawing strokes across room participants instantly using Socket.io.
- **Live User Cursors**: Renders real-time cursor positions with user labels[cite: 1].
- **Room Management**: Dynamic room joining and canvas history initialization upon joining.

### 💬 Live Chat (Bonus Feature)
- **Room Chat Drawer**: Live chat sidebar for participants collaborating in the same room[cite: 1].
- **Message Timestamps**: Displays username and exact dispatch time for messages.

---

## 🛠️ Tech Stack

| Domain | Technology / Library |
|---|---|
| **Frontend Framework** | React 18 + Vite |
| **Language** | TypeScript (Strict Mode)[cite: 1] |
| **Styling & UX** | Bootstrap 5.3[cite: 1] |
| **Canvas Engine** | Konva.js (`react-konva`)[cite: 1] |
| **Authentication** | Keycloak via Docker (`keycloak-js`)[cite: 1] |
| **Backend Server** | Node.js + Express + Socket.io[cite: 1] |

---

## 📂 Repository Structure

```text
.
├── server/                   # Socket.io Backend Server
│   ├── index.js              # Real-time event handling & state memory
│   └── package.json
├── whiteboard-app/           # React + TypeScript Frontend Application
│   ├── src/
│   │   ├── components/
│   │   │   └── Whiteboard.tsx # Canvas, Toolbar, and Live Chat UI
│   │   ├── types/
│   │   │   └── whiteboard.ts  # TypeScript Interface Definitions
│   │   ├── App.tsx            # Main layout and Auth guard wrapper
│   │   ├── keycloak.ts       # Keycloak JS client configuration
│   │   └── main.tsx           # Entry point with Bootstrap imports
│   └── package.json
├── .gitignore
├── screenshot.png            # Final application screenshot
└── README.md