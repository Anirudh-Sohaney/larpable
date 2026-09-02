# Staff Dashboard - UI/UX Design

## Layout

### Header
- Logo "LARPABLE." on left
- Staff button (if authorized) + Username dropdown on right
- Staff button style: Ghost button with accent color on hover

### Tab Navigation
Four tabs below header:
1. **Home** - Dashboard overview
2. **Team** - Team goals timeline
3. **Me** - Personal goals
4. **Logs** - Activity logs

## Color Scheme
Uses existing LARPABLE theme:
- Background: `#F5F0E8`
- Font: `#2D2A26`
- Accent: `#E8734A`
- Card: `#FFFDF8`
- Border: `#D6D1C9`

## Tab Designs

### 1. Home Tab
```
┌─────────────────────────────────────┐
│           STAFF DASHBOARD           │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────┐  ┌─────────────────┐  │
│  │  USERS  │  │   ACTIVE POSTS  │  │
│  │   127   │  │                 │  │
│  │         │  │  Nonprofits: 23 │  │
│  └─────────┘  │  Projects:   45 │  │
│               │  Companies:  18 │  │
│               └─────────────────┘  │
│                                     │
│  Last updated: 2 minutes ago        │
└─────────────────────────────────────┘
```

### 2. Team Tab (anisohaney sees edit controls)
```
┌─────────────────────────────────────┐
│  TEAM GOALS                    [+]  │
├─────────────────────────────────────┤
│                                     │
│  ●────────────────────────────────  │
│  │  Launch marketing campaign       │
│  │  Deadline: Mar 15, 2026         │
│  │  [✓ Complete] [Edit] [Delete]   │
│  │                                  │
│  ●────────────────────────────────  │
│  │  Hire 2 new developers           │
│  │  Deadline: Apr 01, 2026         │
│  │  [✓ Complete] [Edit] [Delete]   │
│  │                                  │
│  ●────────────────────────────────  │
│  │  Reach 500 users                 │
│  │  Deadline: Apr 30, 2026         │
│  │  [✓ Complete] [Edit] [Delete]   │
│  │                                  │
└─────────────────────────────────────┘
```

### 3. Me Tab
```
┌─────────────────────────────────────┐
│  MY GOALS                           │
├─────────────────────────────────────┤
│                                     │
│  ┌─── HIGH PRIORITY ─────────────┐  │
│  │  □ Complete onboarding docs    │  │
│  │    Deadline: Mar 10 (2 days)  │  │
│  │    [Mark Complete]            │  │
│  │                                │  │
│  │  □ Review security audit      │  │
│  │    Deadline: Mar 15 (7 days)  │  │
│  │    [Mark Complete]            │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌─── MEDIUM PRIORITY ──────────┐  │
│  │  ✓ Update documentation       │  │
│  │    Completed: Mar 1, 2026    │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌─── LOW PRIORITY ─────────────┐  │
│  │  □ Organize team meeting      │  │
│  │    Deadline: Apr 01 (22 days) │  │
│  │    [Mark Complete]            │  │
│  └──────────────────────────────┘  │
│                                     │
│  ── Add Staff Member (anisohaney) ──│
│  [Search users...          ▼]       │
└─────────────────────────────────────┘
```

### 4. Logs Tab
```
┌─────────────────────────────────────┐
│  ACTIVITY LOGS          [Search...] │
├─────────────────────────────────────┤
│                                     │
│  [2026-03-08 14:32] TEAM_GOAL      │
│  Action: added                      │
│  Goal: "Launch marketing campaign"  │
│  By: anisohaney                     │
│                                     │
│  [2026-03-08 14:30] GIT_PUSH       │
│  Message: "feat: add staff button"  │
│  Commit: a1b2c3d                    │
│                                     │
│  [2026-03-07 09:15] TEAM_GOAL      │
│  Action: completed                  │
│  Goal: "Setup CI/CD pipeline"      │
│  By: anisohaney                     │
│                                     │
└─────────────────────────────────────┘
```

## Responsive Behavior
- Dashboard width: 600px centered (matches feed)
- Cards stack vertically on mobile
- Tabs scroll horizontally if needed

## Interactions
- Tabs: Click to switch, active tab highlighted with accent color
- Goals: Click checkbox to toggle completion
- Buttons: Hover state with accent color
- Dropdowns: Click to open, click outside to close
- Search: Real-time filtering as user types

## Modal Designs

### Add Team Goal Modal
```
┌─────────────────────────────────────┐
│  ADD TEAM GOAL                  [X] │
├─────────────────────────────────────┤
│                                     │
│  Title:                             │
│  [________________________]         │
│                                     │
│  Description:                       │
│  [________________________]         │
│  [________________________]         │
│                                     │
│  Deadline:                          │
│  [____/____/________]               │
│                                     │
│  [Cancel]           [Add Goal]      │
└─────────────────────────────────────┘
```

### Add User Goal Modal (anisohaney only)
```
┌─────────────────────────────────────┐
│  ADD GOAL FOR username          [X] │
├─────────────────────────────────────┤
│                                     │
│  Title:                             │
│  [________________________]         │
│                                     │
│  Description:                       │
│  [________________________]         │
│                                     │
│  Deadline:                          │
│  [____/____/________]               │
│                                     │
│  Importance:                        │
│  ( ) High                           │
│  (●) Medium                         │
│  ( ) Low                            │
│                                     │
│  [Cancel]           [Add Goal]      │
└─────────────────────────────────────┘
```

### Add Staff Member Modal
```
┌─────────────────────────────────────┐
│  ADD STAFF MEMBER              [X] │
├─────────────────────────────────────┤
│                                     │
│  Search users:                      │
│  [________________________]         │
│                                     │
│  Results:                           │
│  ┌─────────────────────────────┐    │
│  │ johndoe: john d             │    │
│  │ janedoe: jane d             │    │
│  │ testuser: test t            │    │
│  └─────────────────────────────┘    │
│                                     │
│  [Cancel]           [Add Member]    │
└─────────────────────────────────────┘
```
