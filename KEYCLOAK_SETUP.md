# 🔑 Keycloak Authentication Setup Guide

This guide describes how to configure the Keycloak instance inside Docker to authenticate users for the **Real-Time Collaborative Whiteboard** application.

---

## 🚀 Step 1: Start Keycloak via Docker

If Keycloak is not already running, execute the following command in PowerShell (using your local Docker Desktop path):

```powershell
& "C:\Users\ashap\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe" run -p 8080:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:latest start-dev
```

---

## ⚙️ Step 2: Configure Keycloak Admin Console

1. Open your browser and navigate to **[http://localhost:8080](http://localhost:8080)**.
2. Click **Administration Console**.
3. Log in with the credentials:
   * **Username:** `admin`
   * **Password:** `admin`

---

## 🛡️ Step 3: Create the Realm

1. In the top-left dropdown (under Keycloak logo, showing `master`), click **Create Realm**.
2. Set the **Realm name** to: `whiteboard-realm`
3. Click **Create**.

---

## 💻 Step 4: Create the OpenID Connect Client

1. In the left navigation panel, click **Clients**.
2. Click the **Create client** button.
3. Configure the **General Settings**:
   * **Client type:** `OpenID Connect`
   * **Client ID:** `react-client`
   * Click **Next**.
4. Configure the **Capability Config**:
   * Keep default settings (Standard Flow enabled, Client authentication disabled).
   * Click **Next**.
5. Configure the **Login Settings**:
   * **Root URL:** `http://localhost:5173`
   * **Home URL:** `http://localhost:5173`
   * **Valid redirect URIs:** `http://localhost:5173/*`
   * **Valid post logout redirect URIs:** `http://localhost:5173/*`
   * **Web origins:** `*` (or `+` to trust redirect URIs)
6. Click **Save**.

---

## 👥 Step 5: Enable User Registration (Self-Service Signup)

Since the assignment requires user registration (signup and login):
1. In the left panel, click **Realm settings**.
2. Select the **Login** tab at the top.
3. Toggle **User registration** to **ON**.
4. Toggle **Remember me** to **ON** (optional, recommended).
5. Click **Save**.

Now, when accessing `http://localhost:5173`, users will be redirected to Keycloak where they can click **Register** to create a new account, log in, and start collaborating!
