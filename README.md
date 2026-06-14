# ft_transcendence – Fire Arena
*This project has been created as part of the 42 curriculum by [hkheired](https://www.linkedin.com/in/hasan-kheireddin), [nabbas](https://www.linkedin.com/in/nathan-abbas-7581902a4/), [mjamil](https://www.linkedin.com/in/mohamad-jamil-8ba7bb33a/)*

<br>

# Description
**Fire Arena** is a full-stack gaming application developed for the ft_transcendence project. The objective of this game is to have a modern gaming platform that enables the players to compete against each other and monitor their performance within a safe and gamified environment.

This platform is made up of the backend which is composed of Django+DRF+Channels and frontend consisting of React+TypeScript+Vite.

Features:

1. Real-time online Pong and Tic-Tac-Toe games through the use of WebSockets
2. Efficient matchmaking system with reconnect/disconnect functionality
3. Authentication process which includes JWT, email validation, OAuth42, and Two-Factor authentication (TOTP)
4. User's match records, leaderboards, and detailed user stats
5. Gamification elements such as achievements, XP, leveling up, and live notification system
6. Multi-language interface (EN, FR, DE, AR) with Right-to-Left compatibility
7. Containerization of app using Docker, HTTPS (Nginx), PostgreSQL, and Redis

<br>

# 🧑‍💻Team Roles and Responsibilities

| Developer | Role                        | Responsibilities
| --------- | --------------------------- |  --------------------------------------------------|
| **hkheired** | PO / Tech Lead    | System architecture, Django/DRF backend, WebSocket infrastructure, auth(JWT/OAuth/2FA)   |
| **mjamil** | Frontend Lead / UX Engineer | React UI architecture, design system, i18n/RTL, advanced search UX, cross-browser support  |
| **nabbas** | PM / Game & AI Engineer          | Pong game logic, AI opponent behavior, matchmaking logic, analytics/gamification |

<br>

# 🗂️ Project Management
###  Task Organization

The group opted for an iterative project management approach, which was divided into weekly planning cycles:

Weekly meetings were held to discuss project progress, identify any issues, and plan further activities.
Project features were split into smaller, more achievable tasks.
These tasks were assigned to team members according to their qualifications and availability.

### Project Management Tools
- GitHub, Source code control, pull requests, code reviews.
- Jira, Task organization, sprint planning, issues management.

### Communication
WhatsApp – Main method of daily communication

<br>

# ⚙️ Technical Stack

### Architecture Overview

The project follows a **full-stack modular architecture** with real-time capabilities, secure authentication, and scalable infrastructure.
### Frontend

* **Framework:** React 18 (with Vite)
* **Language:** TypeScript
* **Routing:** React Router
* **Styling:** Tailwind CSS
* **UI & Icons:** Lucide React
* **Internationalization:** i18next

  * Supported languages: **EN, FR, DE, AR**
  * Includes **RTL (Right-to-Left) support**

### Backend

* **Runtime:** Python 3.12
* **Framework:** Django 5.1
* **API:** Django REST Framework
* **Authentication:** SimpleJWT
* **Async Support:** Django Channels
* **ASGI Server:** Daphne

### Database

* **PostgreSQL 16**
* Relational schema with structured game, user, and analytics data.

### Real-Time System

* **Protocol:** WebSockets (via Django Channels)
* **Channel Layer:** Redis
### Cache, Sessions & Queues

* **Redis 7**

### Authentication & Security

* **JWT-based authentication**
* **OAuth 42 integration**
* **Two-Factor Authentication (2FA)** using TOTP (pyotp).
* **Email verification flows**

### DevOps

* **Docker & Docker Compose** – Containerized environment.
* **Nginx** – Reverse proxy with HTTPS support.
* **SSL:** Self-signed certificates (development).
* **Makefile** – Automation for common tasks.

### mjamil part

My part in this project is the entire frontend, built with React + TypeScript + Vite.

_Style & Theme
The whole UI uses a dark gaming aesthetic with a purple/pink neon color scheme.
All colors are defined as CSS variables so every component automatically supports dark/light mode:

Dark mode is on by default and toggled via a button that saves the preference to localStorage.

What I Built
Auth Pages

Login, Register, Forgot Password, Reset Password
Two-Factor Authentication (setup + verify)
OAuth callback (Google & 42)

Each auth page has a split layout — form on one side, a custom image on the other. The image switches automatically between a dark version and a light version based on the current theme.
Dashboard & Layout

Navbar — search bar, notifications, user menu, dark mode toggle
Sidebar — collapsible navigation with links to all pages
Dashboard — welcome banner with XP bar, stats, quick play, recent matches, leaderboard preview

Game Pages

Pong — canvas-based game, mouse-controlled paddle, AI opponent, 2D/3D toggle
Tic-Tac-Toe — win detection, move history, score tracking

Other Pages

Play (game mode + difficulty selector)
Tournaments (brackets, registration, live status)
Leaderboard (top 3 podium + rankings table)
Match History (filters by game and result)
Analytics (weekly chart, performance metrics)
Settings (profile, security, notifications, appearance, audio)


Login & Register Images
The login and register pages use a custom split-screen layout.
The right side shows a themed image that changes based on dark/light mode:
tsx// Switches image based on current theme
src={isDark ? loginImgDark : loginImg}
Images are stored in frontend/src/images/:

loginimg.png — light mode version
loginimgDark.png — dark mode version

Languages
The UI supports 4 languages switchable from the Settings page:
en : English
fr : Français
de : Deutsch
ar : Arabic

Arabic automatically flips the page to right-to-left layout.

Tech Used

React 18 + TypeScript
Vite
React Router v6
Tailwind CSS + CSS Variables
i18next (translations)
Canvas API (Pong game)