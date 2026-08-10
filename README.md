
*This project has been created as part of the 42 curriculum by [hkheired](https://www.linkedin.com/in/hasan-kheireddin), [nabbas](https://www.linkedin.com/in/nathan-abbas-7581902a4/), [mjamil](https://www.linkedin.com/in/mohamad-jamil-8ba7bb33a/), [rchalak](https://github.com/reemshalak)*

# ft_transcendence – Fire Arena


<h2 style="border-bottom: none;">  Table of Contents</h2>

- [Description](#Description)
- [Team Information](#Team-Information)
- [Project Mangement](#Project-Mangement)
- [Technical Stack](#️Technical-stack)
- [Architecture](#Architecture)
- [Database Schema](#Database-Schema)
- [Features](#Features)
- [Modules](#modules)
- [Individual Contributions](#individual-Contributions)
- [Installation & Instructions](#Installation-&-Instructions)
- [Resources](#Resources)

# Description
## Project Overview & Main Goal
**Fire Arena** is a web-based multiplayer gaming platform inspired by the classic Pong and TicTacToe games.
The objective of the platform is to provide users with a complete online gaming experience where they can create accounts, interact with other players, play real time matches and track their performance.

This application is made up of the backend, frontend, database and realtime communication between connected users.

The Project was developed as part of the 42 curriculum and focuses on web development, real time communication, authentication multiplayer gaming, and modern software architecrture.

Our main goal as gaming platform is to create an engaging multiplayer experience where users can:

- Create and manage their accounts.
- Login Securely.
- Find, add, and Interact with other players.
- Play Pong and TicTakToe matches in real time.
- View their profiles and game informations.
- Track their match history and statistics.
- Watch and support their friend's game.

<br>

# Team Information
The project was developed by a team 4 students.


| Developer | Role                        | Responsibilities
| --------- | --------------------------- |  --------------------------------------------------|
| **hkheired** | Backend Developer    | System architecture, Django/DRF backend, WebSocket infrastructure, auth(JWT/2FA)   |
| **mjamil** | Fronend Developer | React UI architecture, design system, i18n/RTL, cross browser support  |
| **nabbas** | Product Owner and Manager          | Pong game logic, analytics and gamification |
|rchalak | Full Stack Developer | 3D graphics, spectator mode, friends and chat system 

<br>

# 🗂️ Project Management
###  Task Organization

The group opted for an iterative project management approach, which was divided into weekly planning cycles:

Weekly meetings were held to discuss project progress, identify any issues, and plan further activities.
Project features were split into smaller, more achievable tasks.
These tasks were assigned to team members according to their qualifications and availability.

### Project Management Tools
- GitHub Issues For task tracking.
- Git for version control
- WhatsApp for daily communication and meetings
<br>

### Meetings
The team held weekly meetings to review progrss, discuss completed tasks and plan upcoming work.

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

React was chosen for its component model and mature ecosystem, Typescript for compile time safety across a codebase shared by several developers, and Vite for its near-instant hot-module reload, which kept iteration fast during UI development.
### Backend

* **Runtime:** Python 3.12
* **Framework:** Django 5.1
* **API:** Django REST Framework
* **Authentication:** SimpleJWT
* **Async Support:** Django Channels
* **ASGI Server:** Daphne

Django was selected for its ORM, migrations,and authentication layer removed a large amount of boilerplate, while Channels let us add real-time gameplay and notifications without introducing a second backend runtime alongside the REST API. 

### Database

* **PostgreSQL 16**
* Relational schema with structured game, user, and analytics data.

Postgres offers

### Real-Time System, Cache, Sessions & Queues

* **Protocol:** WebSockets (via Django Channels)
* **Channel Layer:** Redis

### DevOps

* **Docker & Docker Compose**
* **Nginx**
* **SSL**
* **Makefile**


<br><br><br><br><br><br><br><br><br><br><br><br><br><br>
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
OAuth callback (Google)

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