# Staff Dashboard

A protected staff dashboard for managing team goals, personal goals, and viewing activity logs.

## Access

The staff dashboard is accessible at `/staff` for authorized users.

### Who Gets Access

1. **First User**: The first user to sign up automatically gets staff admin access
2. **Staff Admin**: The user with username `anisohaney` gets staff admin access
3. **Admin Account**: The system admin (`larpable_a`) has full access

### Adding Staff Members

Only staff admins can add new staff members:
1. Go to the **Me** tab
2. Click "Add Staff Member"
3. Search for a user by username or name
4. Select the user and click "Add Member"

Once added, the user will see the **Staff** button on their feed page and can access the dashboard.

## Features

### Home Tab
- Live count of total users
- Active posts breakdown (nonprofits, projects, companies)
- Auto-refreshes every 30 seconds

### Team Tab
- Timeline of up to 15 team goals
- Each goal has: title, description, deadline, completion status
- Staff admins can add, edit, delete, and mark goals complete
- Other staff can mark goals complete

### Me Tab
- Personal goals assigned to you
- Goals categorized by importance (high, medium, low)
- Can mark goals as complete
- **Staff admins only**: Can view and edit other users' goals
- **Staff admins only**: Can add staff members

### Logs Tab
- Searchable activity logs
- Team goal actions (add, complete, remove, edit)
- User goal actions
- Staff member changes
- Filter by type or search by content

## Security

- All routes require authentication
- Staff access is checked on both client and server side
- URL protection: Typing `/staff` directly won't work without proper authentication
- Staff admin operations are restricted to authorized users only

## Data Storage

All staff data is stored in `/data/staff.json`:
- `staff_members`: List of staff users
- `team_goals`: Team goals with deadlines
- `user_goals`: Personal goals for each user
- `logs`: Activity log entries

This is separate from the main user and opportunity data.
