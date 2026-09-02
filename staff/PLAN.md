# Staff Dashboard - Implementation Plan

## Overview
A protected staff dashboard accessible only to authorized users. Currently only user `anisohaney` has access. The dashboard provides team management, personal goals, and activity logging.

## Architecture

### Directory Structure
```
app/staff/
├── PLAN.md                    # This file
├── DESIGN.md                  # UI/UX design details
├── staff.html                 # Main dashboard page
├── staff.js                   # Frontend JavaScript
├── staff.css                  # Dashboard styles
└── routes/
    └── staff.routes.js        # Backend API routes

data/
└── staff.json                 # Staff-specific database (separate from main data)
```

### Database Schema (`data/staff.json`)
```json
{
  "staff_members": {
    "user_id": {
      "username": "string",
      "first_name": "string",
      "last_name_initial": "string",
      "added_by": "string (user_id)",
      "added_at": "ISO date"
    }
  },
  "team_goals": {
    "goal_id": {
      "title": "string",
      "description": "string",
      "deadline": "ISO date",
      "completed": "boolean",
      "completed_at": "ISO date|null",
      "created_by": "string (user_id)",
      "created_at": "ISO date",
      "last_modified_by": "string (user_id)",
      "last_modified_at": "ISO date"
    }
  },
  "user_goals": {
    "user_id": {
      "goal_id": {
        "title": "string",
        "description": "string",
        "deadline": "ISO date",
        "importance": "high|medium|low",
        "completed": "boolean",
        "completed_at": "ISO date|null",
        "created_by": "string (user_id)",
        "created_at": "ISO date"
      }
    }
  },
  "logs": {
    "log_id": {
      "type": "team_goal|git_push",
      "action": "add|complete|remove|edit|push",
      "details": "string",
      "user_id": "string",
      "username": "string",
      "timestamp": "ISO date",
      "metadata": {}
    }
  }
}
```

## Features

### 1. Staff Button on Feed Page
- Location: Beside username dropdown in header
- Visibility: Only for users with `staff_access: true` in their user record
- Currently: Only `anisohaney` has this access
- Behavior: Navigates to `/staff`

### 2. Route Protection
- Server-side: `/staff` route requires authentication + staff access check
- Client-side: Redirect to `/feed` if unauthorized
- Cannot be accessed by typing URL directly without proper auth

### 3. Home Tab
- Live count of total users (from `users.json`)
- Active posts breakdown:
  - Nonprofits count
  - Projects count
  - Companies count
- Auto-refresh every 30 seconds

### 4. Team Tab
- Timeline structure with up to 15 goals
- Each goal has: title, description, deadline, completed status
- Checkmarks to mark completion
- Only `anisohaney` can:
  - Add new goals
  - Remove goals
  - Edit goals
  - Mark goals complete/incomplete
- Visual timeline with dates

### 5. Me Tab
- Personalized goals for current user
- Users CANNOT add goals (only staff can assign)
- Users CAN mark goals as complete
- Each goal has deadline and importance level
- Goals categorized by:
  - Importance (high/medium/low)
  - Status (pending/completed)
  - Deadline (upcoming/overdue)

### 6. Logs Tab
- Team goal activity log:
  - Goal added
  - Goal completed
  - Goal removed
  - Goal edited
- Git push logs:
  - Date + commit message
- Searchable logs
- Raw log format
- Stored in separate `staff.json` database

### 7. Staff Management (anisohaney only)
- On "Me" tab for anisohaney:
  - Dropdown to add new staff members
  - Shows all usernames with first name + last initial (e.g., "anisohaney: ani s")
  - Searchable dropdown
- Only through this can new users see Staff button
- View and edit other users' goals

## API Endpoints

### Staff Routes (`/api/staff/*`)
```
GET    /api/staff/check         - Check if user has staff access
GET    /api/staff/stats         - Get user count + post counts
GET    /api/staff/team-goals    - Get all team goals
POST   /api/staff/team-goals    - Add team goal (anisohaney only)
PATCH  /api/staff/team-goals/:id - Update team goal
DELETE /api/staff/team-goals/:id - Delete team goal (anisohaney only)
GET    /api/staff/user-goals/:userId - Get user's goals
POST   /api/staff/user-goals/:userId - Add user goal (anisohaney only)
PATCH  /api/staff/user-goals/:userId/:goalId - Update user goal
DELETE /api/staff/user-goals/:userId/:goalId - Delete user goal (anisohaney only)
GET    /api/staff/logs          - Get logs (with search)
POST   /api/staff/logs          - Add log entry
GET    /api/staff/members       - Get all staff members
POST   /api/staff/members       - Add staff member (anisohaney only)
DELETE /api/staff/members/:userId - Remove staff member (anisohaney only)
GET    /api/staff/users         - Get all users for dropdown (anisohaney only)
```

## Security
1. All staff routes require authentication
2. Staff access checked via `staff_access` field in user record
3. Edit/delete operations restricted to `anisohaney` via server-side checks
4. Session validation on every request
5. No direct URL access without proper session

## Implementation Order
1. Create database schema and initial data
2. Build backend routes with auth middleware
3. Create staff.html with all tabs
4. Implement frontend JavaScript
5. Add Staff button to feed page
6. Test all features
7. Verify security (no unauthorized access)
