/**
 * LARPABLE Staff Portal — Demo Data
 * 
 * All data in this file is TEMPORARY for demo purposes.
 * Every section has comments showing how to replace with real API calls.
 * 
 * CONSTRAINTS:
 *   - This file NEVER reads from /data/ directly
 *   - This file NEVER writes to /data/ or /app/
 *   - All data here is self-contained for the demo
 * 
 * INTEGRATION GUIDE:
 *   When integrating with the real backend, each data access point
 *   below has a matching endpoint in staff.routes.js. Replace the
 *   demo data reads with fetch() calls to those endpoints.
 */

const DEMO_DATA = {
  // ── Current User ────────────────────────────────────────────
  // INTEGRATION: Replace with:
  //   const me = await fetch('/api/auth/me', { credentials: 'include' });
  //   const staff = await fetch('/api/staff/check', { credentials: 'include' });
  // Source: data/sessions.json -> data/users.json (decrypted)
  // Auth: Cookie-based session token (larpable_session)
  // DEMO SESSION MODEL: the staff portal reads the main demo's session from
  // localStorage ('larpable_demo_session', written by js/data.js login/logout —
  // the standalone equivalent of the real app's shared cookie).
  // currentUser is resolved at the bottom of this file, after staffMembers
  // is defined; guest fallback = first staff member.
  currentUser: null,

  // ── Staff Members ───────────────────────────────────────────
  // INTEGRATION: GET /api/staff/members
  //   Source: data/staff.json -> staff_members
  //   Auth: requireAuth + requireStaff middleware
  //   Response: { members: [{ userId, username, first_name, last_name_initial, added_by, added_at }] }
  staffMembers: [
    { userId: 'user_001', username: 'anisohaney', firstName: 'Aniso', lastNameInitial: 'S', team: 'dev', addedAt: '2025-01-15T10:00:00Z', addedBy: 'user_001' },
    { userId: 'user_002', username: 'johndoe',    firstName: 'John',  lastNameInitial: 'D', team: 'dev', addedAt: '2025-02-01T14:30:00Z', addedBy: 'user_001' },
    { userId: 'user_003', username: 'janedoe',    firstName: 'Jane',  lastNameInitial: 'D', team: 'business', addedAt: '2025-02-10T09:15:00Z', addedBy: 'user_001' },
    { userId: 'user_004', username: 'alexchen',   firstName: 'Alex',  lastNameInitial: 'C', team: 'design', addedAt: '2025-03-01T11:00:00Z', addedBy: 'user_001' },
    { userId: 'user_005', username: 'sarahsmith', firstName: 'Sarah', lastNameInitial: 'S', team: 'marketing', addedAt: '2025-03-15T16:45:00Z', addedBy: 'user_001' }
  ],

  // ── Teams ───────────────────────────────────────────────────
  // INTEGRATION: Teams are a new concept. When implementing:
  //   - Add "team" field to staff_members in data/staff.json
  //   - Create GET /api/staff/teams endpoint
  //   - Return team definitions with name, color, icon, memberIds
  teams: {
    dev:      { name: 'Development',   color: '#5C6BC0', icon: '&#xe90f;', members: ['user_001', 'user_002'] },
    business: { name: 'Business',      color: '#E8734A', icon: '&#xe900;', members: ['user_003'] },
    design:   { name: 'Design',        color: '#10B981', icon: '&#xe901;', members: ['user_004'] },
    marketing:{ name: 'Marketing',     color: '#F59E0B', icon: '&#xe902;', members: ['user_005'] }
  },

  // ── Platform Stats ──────────────────────────────────────────
  // INTEGRATION: GET /api/staff/stats
  //   Source: data/users.json (count), data/opportunities.json (count by type)
  //   Auth: requireAuth + requireStaff
  //   Response: { users: number, nonprofits: number, projects: number, companies: number, totalPosts: number }
  stats: {
    users: 127,
    nonprofits: 23,
    projects: 45,
    companies: 18,
    totalPosts: 86
  },

  // ── Company Goals ───────────────────────────────────────────
  // INTEGRATION: GET /api/staff/team-goals
  //   Source: data/staff.json -> team_goals
  //   Auth: requireAuth + requireStaff
  //   Response: { goals: [{ id, title, description, deadline, completed, completed_at, created_by, created_at }] }
  //   Admin CRUD: POST/PATCH/DELETE /api/staff/team-goals (requireStaffAdmin)
  companyGoals: [
    { id: 'tgoal_001', title: 'Launch v2.0 of the platform', description: 'Complete redesign with new matching algorithm and improved UI', deadline: '2026-04-15', completed: false, importance: 'high', team: 'dev', createdAt: '2026-01-10T09:00:00Z', createdBy: 'user_001' },
    { id: 'tgoal_002', title: 'Reach 500 active users', description: 'Grow the user base through marketing campaigns and referrals', deadline: '2026-06-01', completed: false, importance: 'high', team: 'marketing', createdAt: '2026-01-15T11:30:00Z', createdBy: 'user_001' },
    { id: 'tgoal_003', title: 'Hire 2 backend developers', description: 'Recruit experienced Node.js developers for the team', deadline: '2026-03-30', completed: false, importance: 'medium', team: 'business', createdAt: '2026-02-01T14:00:00Z', createdBy: 'user_001' },
    { id: 'tgoal_004', title: 'Complete brand guidelines', description: 'Finalize logo, colors, typography, and usage rules', deadline: '2026-03-15', completed: true, importance: 'medium', team: 'design', completedAt: '2026-03-12T16:20:00Z', createdAt: '2026-01-20T10:00:00Z', createdBy: 'user_004' },
    { id: 'tgoal_005', title: 'Set up CI/CD pipeline', description: 'Automated testing and deployment for all environments', deadline: '2026-02-28', completed: true, importance: 'medium', team: 'dev', completedAt: '2026-02-25T11:00:00Z', createdAt: '2026-01-05T09:00:00Z', createdBy: 'user_002' },
    { id: 'tgoal_006', title: 'Launch social media campaign', description: 'Instagram, Twitter, LinkedIn content strategy for Q2', deadline: '2026-04-01', completed: false, importance: 'low', team: 'marketing', createdAt: '2026-02-15T13:00:00Z', createdBy: 'user_005' },
    { id: 'tgoal_007', title: 'Design mobile app wireframes', description: 'Create low-fi wireframes for iOS and Android apps', deadline: '2026-05-01', completed: false, importance: 'medium', team: 'design', createdAt: '2026-03-01T10:00:00Z', createdBy: 'user_004' },
    { id: 'tgoal_008', title: 'Prepare investor pitch deck', description: 'Financial projections, market analysis, and growth plan', deadline: '2026-03-20', completed: false, importance: 'high', team: 'business', createdAt: '2026-02-20T09:30:00Z', createdBy: 'user_003' }
  ],

  // ── Team Goals (by team) ────────────────────────────────────
  // INTEGRATION: Extend GET /api/staff/team-goals with ?team=dev filter
  //   Or add team field to goal schema in staff.json
  teamGoals: {
    dev: [
      { id: 'tgoal_001', title: 'Launch v2.0 of the platform', description: 'Complete redesign with new matching algorithm', deadline: '2026-04-15', completed: false, importance: 'high', assignees: ['user_001', 'user_002'] },
      { id: 'tgoal_005', title: 'Set up CI/CD pipeline', description: 'Automated testing and deployment', deadline: '2026-02-28', completed: true, importance: 'medium', assignees: ['user_002'] }
    ],
    business: [
      { id: 'tgoal_003', title: 'Hire 2 backend developers', description: 'Recruit experienced Node.js developers', deadline: '2026-03-30', completed: false, importance: 'medium', assignees: ['user_003'] },
      { id: 'tgoal_008', title: 'Prepare investor pitch deck', description: 'Financial projections and growth plan', deadline: '2026-03-20', completed: false, importance: 'high', assignees: ['user_003'] }
    ],
    design: [
      { id: 'tgoal_004', title: 'Complete brand guidelines', description: 'Finalize logo, colors, typography', deadline: '2026-03-15', completed: true, importance: 'medium', assignees: ['user_004'] },
      { id: 'tgoal_007', title: 'Design mobile app wireframes', description: 'Create low-fi wireframes for apps', deadline: '2026-05-01', completed: false, importance: 'medium', assignees: ['user_004'] }
    ],
    marketing: [
      { id: 'tgoal_002', title: 'Reach 500 active users', description: 'Grow the user base', deadline: '2026-06-01', completed: false, importance: 'high', assignees: ['user_005'] },
      { id: 'tgoal_006', title: 'Launch social media campaign', description: 'Content strategy for Q2', deadline: '2026-04-01', completed: false, importance: 'low', assignees: ['user_005'] }
    ]
  },

  // ── Individual User Goals ───────────────────────────────────
  // INTEGRATION: GET /api/staff/user-goals/:userId
  //   Source: data/staff.json -> user_goals[userId]
  //   Auth: requireAuth + requireStaff (users see own, admin sees all)
  //   Response: { goals: [{ id, title, description, deadline, importance, completed, completed_at }] }
  //   Admin CRUD: POST/PATCH/DELETE /api/staff/user-goals/:userId/:goalId
  userGoals: {
    user_001: [
      { id: 'ugoal_001', title: 'Review security audit report', description: 'Go through the full security audit and address critical items', deadline: '2026-03-25', importance: 'high', completed: false, createdAt: '2026-03-01' },
      { id: 'ugoal_002', title: 'Update API documentation', description: 'Document all new endpoints for v2.0', deadline: '2026-04-01', importance: 'medium', completed: false, createdAt: '2026-03-05' },
      { id: 'ugoal_003', title: 'Complete onboarding docs', description: 'Write developer onboarding guide', deadline: '2026-03-15', importance: 'medium', completed: true, completedAt: '2026-03-13T14:00:00Z', createdAt: '2026-02-20' }
    ],
    user_002: [
      { id: 'ugoal_004', title: 'Implement search v2', description: 'Full-text search with filters and sorting', deadline: '2026-04-10', importance: 'high', completed: false, createdAt: '2026-03-01' },
      { id: 'ugoal_005', title: 'Fix mobile responsive bugs', description: 'Address all reported mobile UI issues', deadline: '2026-03-20', importance: 'medium', completed: false, createdAt: '2026-03-10' }
    ],
    user_003: [
      { id: 'ugoal_006', title: 'Finalize Q2 budget', description: 'Complete budget allocation for all departments', deadline: '2026-03-28', importance: 'high', completed: false, createdAt: '2026-03-05' },
      { id: 'ugoal_007', title: 'Schedule investor meetings', description: 'Book 5 investor meetings for April', deadline: '2026-04-05', importance: 'medium', completed: false, createdAt: '2026-03-10' }
    ],
    user_004: [
      { id: 'ugoal_008', title: 'Design new dashboard layout', description: 'Create mockups for the admin dashboard', deadline: '2026-03-30', importance: 'high', completed: false, createdAt: '2026-03-01' },
      { id: 'ugoal_009', title: 'Create icon set', description: 'Design 20 custom icons for the platform', deadline: '2026-04-15', importance: 'low', completed: false, createdAt: '2026-03-15' }
    ],
    user_005: [
      { id: 'ugoal_010', title: 'Write 10 blog posts', description: 'Create content for the company blog', deadline: '2026-04-30', importance: 'medium', completed: false, createdAt: '2026-03-01' },
      { id: 'ugoal_011', title: 'Set up analytics tracking', description: 'Implement GA4 and conversion tracking', deadline: '2026-03-22', importance: 'high', completed: false, createdAt: '2026-03-10' }
    ]
  },

  // ── Tasks ───────────────────────────────────────────────────
  // INTEGRATION: New concept. Extend staff.json with a "tasks" section.
  //   GET /api/staff/tasks?scope=company|team|individual
  //   POST /api/staff/tasks (admin only)
  //   PATCH /api/staff/tasks/:id (status update, assignee change)
  //   DELETE /api/staff/tasks/:id (admin only)
  tasks: [
    { id: 'task_001', title: 'Review pull request #42', description: 'Code review for the new auth module', assignee: 'user_001', assigneeName: 'anisohaney', team: 'dev', priority: 'high', status: 'in_progress', dueDate: '2026-03-18', createdAt: '2026-03-12' },
    { id: 'task_002', title: 'Write unit tests for matching engine', description: 'Cover edge cases in similarity scoring', assignee: 'user_002', assigneeName: 'johndoe', team: 'dev', priority: 'medium', status: 'todo', dueDate: '2026-03-22', createdAt: '2026-03-10' },
    { id: 'task_003', title: 'Update competitor analysis', description: 'Research 3 new competitor platforms', assignee: 'user_003', assigneeName: 'janedoe', team: 'business', priority: 'medium', status: 'review', dueDate: '2026-03-20', createdAt: '2026-03-05' },
    { id: 'task_004', title: 'Design new onboarding flow', description: 'Create high-fidelity mockups', assignee: 'user_004', assigneeName: 'alexchen', team: 'design', priority: 'high', status: 'in_progress', dueDate: '2026-03-25', createdAt: '2026-03-08' },
    { id: 'task_005', title: 'Draft email newsletter', description: 'Q1 recap and Q2 preview', assignee: 'user_005', assigneeName: 'sarahsmith', team: 'marketing', priority: 'low', status: 'done', dueDate: '2026-03-15', createdAt: '2026-03-01' },
    { id: 'task_006', title: 'Fix login redirect bug', description: 'Users not redirected after session expiry', assignee: 'user_002', assigneeName: 'johndoe', team: 'dev', priority: 'high', status: 'done', dueDate: '2026-03-12', createdAt: '2026-03-10' },
    { id: 'task_007', title: 'Prepare quarterly report', description: 'Compile metrics and growth data', assignee: 'user_003', assigneeName: 'janedoe', team: 'business', priority: 'high', status: 'todo', dueDate: '2026-03-28', createdAt: '2026-03-15' },
    { id: 'task_008', title: 'Create social media templates', description: 'Design Canva templates for Instagram', assignee: 'user_005', assigneeName: 'sarahsmith', team: 'marketing', priority: 'medium', status: 'in_progress', dueDate: '2026-03-20', createdAt: '2026-03-12' },
    { id: 'task_009', title: 'Audit database performance', description: 'Identify slow queries and optimize', assignee: 'user_001', assigneeName: 'anisohaney', team: 'dev', priority: 'medium', status: 'todo', dueDate: '2026-03-30', createdAt: '2026-03-18' },
    { id: 'task_010', title: 'Update style guide', description: 'Add new components to the design system', assignee: 'user_004', assigneeName: 'alexchen', team: 'design', priority: 'low', status: 'todo', dueDate: '2026-04-05', createdAt: '2026-03-15' },
    { id: 'task_011', title: 'Set up Google Ads campaign', description: 'Create and launch paid search campaign', assignee: 'user_005', assigneeName: 'sarahsmith', team: 'marketing', priority: 'medium', status: 'review', dueDate: '2026-03-25', createdAt: '2026-03-10' },
    { id: 'task_012', title: 'Refactor user authentication module', description: 'Migrate to JWT-based sessions', assignee: 'user_001', assigneeName: 'anisohaney', team: 'dev', priority: 'high', status: 'in_progress', dueDate: '2026-04-01', createdAt: '2026-03-01' }
  ],

  // ── Calendar Events ─────────────────────────────────────────
  // INTEGRATION: New concept. Add to staff.json:
  //   GET /api/staff/calendar?month=YYYY-MM&scope=company|team|individual
  //   POST /api/staff/calendar (admin only)
  //   PATCH /api/staff/calendar/:id (admin only)
  //   DELETE /api/staff/calendar/:id (admin only)
  calendarEvents: [
    { id: 'evt_001', title: 'Sprint Planning', date: '2026-03-17', time: '10:00', duration: 60, type: 'meeting', team: 'dev', description: 'Plan sprint tasks for next 2 weeks' },
    { id: 'evt_002', title: 'Design Review', date: '2026-03-19', time: '14:00', duration: 45, type: 'meeting', team: 'design', description: 'Review onboarding flow mockups' },
    { id: 'evt_003', title: 'v2.0 Alpha Release', date: '2026-03-25', time: '09:00', duration: 0, type: 'milestone', team: 'dev', description: 'Internal alpha release of v2.0' },
    { id: 'evt_004', title: 'All-Hands Meeting', date: '2026-03-20', time: '11:00', duration: 60, type: 'meeting', team: null, description: 'Monthly all-hands with entire team' },
    { id: 'evt_005', title: 'Investor Meeting', date: '2026-03-22', time: '15:00', duration: 90, type: 'meeting', team: 'business', description: 'Pitch meeting with Seed Fund Capital' },
    { id: 'evt_006', title: 'Security Audit Deadline', date: '2026-03-25', time: '23:59', duration: 0, type: 'deadline', team: 'dev', description: 'Complete all critical security fixes' },
    { id: 'evt_007', title: 'Blog Post Publishing', date: '2026-03-28', time: '09:00', duration: 0, type: 'deadline', team: 'marketing', description: 'Q1 recap blog post goes live' },
    { id: 'evt_008', title: 'Q2 Budget Finalization', date: '2026-03-28', time: '16:00', duration: 30, type: 'deadline', team: 'business', description: 'Final Q2 budget approval' },
    { id: 'evt_009', title: 'Design System Workshop', date: '2026-04-02', time: '13:00', duration: 120, type: 'meeting', team: 'design', description: 'Collaborative design system session' },
    { id: 'evt_010', title: 'Social Media Campaign Launch', date: '2026-04-01', time: '09:00', duration: 0, type: 'milestone', team: 'marketing', description: 'Q2 social media campaign goes live' }
  ],

  // ── Activity Logs ───────────────────────────────────────────
  // INTEGRATION: GET /api/staff/logs?search=&type=&limit=50
  //   Source: data/staff.json -> logs
  //   Auth: requireAuth + requireStaff
  //   Response: { logs: [{ id, type, action, details, user_id, username, timestamp, metadata }] }
  //   Types: team_goal, user_goal, staff, git_push, system
  //   Admin POST: /api/staff/logs (manual log entry)
  logs: [
    { id: 'log_001', type: 'git_push', action: 'push', details: 'feat: add staff dashboard with goals and logging', username: 'anisohaney', timestamp: '2026-03-16T14:32:00Z', metadata: { hash: 'a1b2c3d', branch: 'main' } },
    { id: 'log_002', type: 'team_goal', action: 'add', details: 'Added team goal: "Launch v2.0 of the platform"', username: 'anisohaney', timestamp: '2026-03-16T14:30:00Z', metadata: { goal_id: 'tgoal_001', title: 'Launch v2.0 of the platform' } },
    { id: 'log_003', type: 'staff', action: 'add_member', details: 'Added staff member: sarahsmith', username: 'anisohaney', timestamp: '2026-03-15T16:45:00Z', metadata: { target_username: 'sarahsmith' } },
    { id: 'log_004', type: 'git_push', action: 'push', details: 'fix: resolve session expiry redirect bug', username: 'johndoe', timestamp: '2026-03-15T11:20:00Z', metadata: { hash: 'e4f5g6h', branch: 'main' } },
    { id: 'log_005', type: 'team_goal', action: 'complete', details: 'Completed team goal: "Set up CI/CD pipeline"', username: 'johndoe', timestamp: '2026-03-15T11:00:00Z', metadata: { goal_id: 'tgoal_005', title: 'Set up CI/CD pipeline' } },
    { id: 'log_006', type: 'user_goal', action: 'complete', details: 'Completed goal for anisohaney: "Complete onboarding docs"', username: 'anisohaney', timestamp: '2026-03-13T14:00:00Z', metadata: { goal_id: 'ugoal_003' } },
    { id: 'log_007', type: 'git_push', action: 'push', details: 'feat: implement user dropdown menu', username: 'anisohaney', timestamp: '2026-03-12T16:30:00Z', metadata: { hash: 'i7j8k9l', branch: 'main' } },
    { id: 'log_008', type: 'team_goal', action: 'add', details: 'Added team goal: "Complete brand guidelines"', username: 'alexchen', timestamp: '2026-03-12T10:00:00Z', metadata: { goal_id: 'tgoal_004', title: 'Complete brand guidelines' } },
    { id: 'log_009', type: 'system', action: 'backup', details: 'Daily data backup completed successfully', username: 'system', timestamp: '2026-03-12T03:00:00Z', metadata: {} },
    { id: 'log_010', type: 'git_push', action: 'push', details: 'style: update card hover animations', username: 'alexchen', timestamp: '2026-03-11T15:10:00Z', metadata: { hash: 'm0n1o2p', branch: 'feature/ui' } },
    { id: 'log_011', type: 'staff', action: 'remove_member', details: 'Removed staff member: testuser', username: 'anisohaney', timestamp: '2026-03-10T09:00:00Z', metadata: { target_username: 'testuser' } },
    { id: 'log_012', type: 'team_goal', action: 'edit', details: 'Edited team goal: "Reach 500 active users" - updated deadline', username: 'anisohaney', timestamp: '2026-03-09T14:20:00Z', metadata: { goal_id: 'tgoal_002' } },
    { id: 'log_013', type: 'git_push', action: 'push', details: 'feat: add matching engine similarity scoring', username: 'johndoe', timestamp: '2026-03-08T10:45:00Z', metadata: { hash: 'q3r4s5t', branch: 'main' } },
    { id: 'log_014', type: 'system', action: 'deploy', details: 'Deployment to production completed - v1.3.0', username: 'anisohaney', timestamp: '2026-03-07T18:00:00Z', metadata: { version: '1.3.0' } },
    { id: 'log_015', type: 'team_goal', action: 'add', details: 'Added team goal: "Launch social media campaign"', username: 'sarahsmith', timestamp: '2026-03-06T11:00:00Z', metadata: { goal_id: 'tgoal_006' } },
    { id: 'log_016', type: 'git_push', action: 'push', details: 'docs: update API documentation for auth routes', username: 'anisohaney', timestamp: '2026-03-05T09:30:00Z', metadata: { hash: 'u6v7w8x', branch: 'main' } },
    { id: 'log_017', type: 'user_goal', action: 'add', details: 'Added goal for johndoe: "Implement search v2"', username: 'anisohaney', timestamp: '2026-03-01T14:00:00Z', metadata: { goal_id: 'ugoal_004' } },
    { id: 'log_018', type: 'system', action: 'backup', details: 'Daily data backup completed successfully', username: 'system', timestamp: '2026-03-01T03:00:00Z', metadata: {} },
    { id: 'log_019', type: 'git_push', action: 'push', details: 'feat: add opportunity matching algorithm', username: 'johndoe', timestamp: '2026-02-28T16:00:00Z', metadata: { hash: 'y9z0a1b', branch: 'main' } },
    { id: 'log_020', type: 'team_goal', action: 'complete', details: 'Completed team goal: "Complete brand guidelines"', username: 'alexchen', timestamp: '2026-03-12T16:20:00Z', metadata: { goal_id: 'tgoal_004', title: 'Complete brand guidelines' } }
  ],

  // ── Resources ───────────────────────────────────────────────
  // INTEGRATION: New concept. Add to staff.json:
  //   GET /api/staff/resources?scope=company|team&search=
  //   POST /api/staff/resources (admin only)
  //   DELETE /api/staff/resources/:id (admin only)
  resources: [
    { id: 'res_001', title: 'Node.js Style Guide', url: 'https://nodejs.org/en/docs/guides/', description: 'Official Node.js coding conventions', team: 'dev', addedBy: 'user_001', addedAt: '2026-01-20' },
    { id: 'res_002', title: 'Figma Design System', url: 'https://figma.com/example', description: 'Our main design system components in Figma', team: 'design', addedBy: 'user_004', addedAt: '2026-02-01' },
    { id: 'res_003', title: 'Brand Assets Drive', url: 'https://drive.google.com/example', description: 'Logos, icons, and brand guidelines', team: 'design', addedBy: 'user_004', addedAt: '2026-02-15' },
    { id: 'res_004', title: 'Q1 Marketing Playbook', url: 'https://docs.google.com/example', description: 'Marketing strategy and content calendar', team: 'marketing', addedBy: 'user_005', addedAt: '2026-01-10' },
    { id: 'res_005', title: 'API Documentation', url: '/api-docs', description: 'Internal API reference for all endpoints', team: null, addedBy: 'user_001', addedAt: '2026-01-15' },
    { id: 'res_006', title: 'Competitor Analysis Sheet', url: 'https://docs.google.com/example', description: 'Tracking competitor features and pricing', team: 'business', addedBy: 'user_003', addedAt: '2026-02-20' },
    { id: 'res_007', title: 'Deployment Checklist', url: 'https://github.com/example', description: 'Pre-deployment and post-deployment steps', team: 'dev', addedBy: 'user_002', addedAt: '2026-03-01' },
    { id: 'res_008', title: 'Investor Contact List', url: 'https://docs.google.com/example', description: 'VC firms and angel investors database', team: 'business', addedBy: 'user_003', addedAt: '2026-02-25' }
  ],

  // ── Data Management Info ────────────────────────────────────
  // INTEGRATION: GET /api/staff/data-size (requireStaffAdmin)
  //   Source: Scans data/ directory with fs.readdirSync + fs.statSync
  //   Response: { sizeGB: number, path: string }
  //   For file breakdown, iterate data/ files and report individually
  dataInfo: {
    sizeGB: 0.0234,
    path: '/data/',
    files: [
      { name: 'users.json',      sizeKB: 12.4,  lastModified: '2026-03-16T10:00:00Z' },
      { name: 'opportunities.json', sizeKB: 8.2, lastModified: '2026-03-15T14:30:00Z' },
      { name: 'staff.json',      sizeKB: 4.8,   lastModified: '2026-03-16T14:32:00Z' },
      { name: 'sessions.json',   sizeKB: 1.2,   lastModified: '2026-03-16T15:00:00Z' },
      { name: 'drafts.json',     sizeKB: 0.6,   lastModified: '2026-03-14T09:00:00Z' },
      { name: 'legal_versions.json', sizeKB: 0.3, lastModified: '2026-02-01T11:00:00Z' }
    ]
  },

  // ── Inbox (for Home tab) ────────────────────────────────────
  // INTEGRATION: GET /api/staff/inbox
  //   Source: Compares goal created_at against staff_portal_opens[userId].previous_open
  //   Response: { newTasks: number, newTeamGoals: number, newTeamGoalTitles: string[], urgencyAlerts: Alert[] }
  //   Also: POST /api/staff/portal-open to record that the staff opened the portal
  inbox: {
    newTasks: 2,
    newTeamGoals: 1,
    newTeamGoalTitles: ['Design mobile app wireframes'],
    urgencyAlerts: [
      { type: 'individual', urgency: 'urgent', title: 'Review security audit report', deadline: '2026-03-25', importance: 'high', message: 'URGENT: "Review security audit report" is due soon!' },
      { type: 'team', urgency: 'warning', title: 'Prepare investor pitch deck', deadline: '2026-03-20', message: 'Team goal "Prepare investor pitch deck" is due in 2 days.' }
    ]
  }
};

// ── Data Access Functions ─────────────────────────────────────
// These simulate what the real backend does. When integrating,
// replace each function body with the corresponding fetch() call.

const DataStore = {
  persist(collection, item) {
    return fetch(`/api/staff/data/${collection}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) }).catch(() => null);
  },
  persistUpdate(collection, id, updates) {
    return fetch(`/api/staff/data/${collection}/${encodeURIComponent(id)}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }).catch(() => null);
  },
  persistDelete(collection, id) {
    return fetch(`/api/staff/data/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' }).catch(() => null);
  },
  hydrateLive(payload) {
    if (!payload) return;
    DEMO_DATA.staffMembers = (payload.members || []).map(member => ({
      userId: member.id || member.userId, username: member.username, firstName: member.first_name || member.firstName || '',
      lastNameInitial: member.last_name_initial || member.lastNameInitial || '', permissions: member.permissions || [],
      addedAt: member.added_at || member.addedAt, addedBy: member.added_by || member.addedBy, isAdmin: !!member.isAdmin
    }));
    DEMO_DATA.currentUser = DEMO_DATA.staffMembers.find(member => member.userId === App?.currentUser?.id) || DEMO_DATA.staffMembers[0] || DEMO_DATA.currentUser;
    if (payload.logs) DEMO_DATA.logs = payload.logs;
    if (payload.tasks) DEMO_DATA.tasks = payload.tasks;
    if (payload.calendarEvents) DEMO_DATA.calendarEvents = payload.calendarEvents;
    if (payload.resources) DEMO_DATA.resources = payload.resources;
    if (payload.userGoals) DEMO_DATA.userGoals = Object.fromEntries(Object.entries(payload.userGoals).map(([userId, goals]) => [userId, (goals || []).map(goal => ({ ...goal, createdAt: goal.createdAt || goal.created_at, completedAt: goal.completedAt || goal.completed_at }))]));
    if (payload.teamGoals) {
      DEMO_DATA.companyGoals = payload.teamGoals.map(goal => ({ ...goal, createdAt: goal.createdAt || goal.created_at, completedAt: goal.completedAt || goal.completed_at }));
      DEMO_DATA.teamGoals = {};
      payload.teamGoals.forEach(goal => {
        const team = goal.team || 'company';
        if (!DEMO_DATA.teamGoals[team]) DEMO_DATA.teamGoals[team] = [];
        DEMO_DATA.teamGoals[team].push(goal);
      });
    }
  },

  getCurrentUser() {
    // INTEGRATION: fetch('/api/auth/me', { credentials: 'include' })
    // Then: fetch('/api/staff/check', { credentials: 'include' })
    return { ...DEMO_DATA.currentUser };
  },

  getStats() {
    // INTEGRATION: fetch('/api/staff/stats', { credentials: 'include' })
    // Source counts from data/users.json + data/opportunities.json
    return { ...DEMO_DATA.stats };
  },

  getInbox() {
    // INTEGRATION: fetch('/api/staff/inbox', { credentials: 'include' })
    // Also POST /api/staff/portal-open to track when staff last opened portal
    return { ...DEMO_DATA.inbox };
  },

  getStaffMembers() {
    // INTEGRATION: fetch('/api/staff/members', { credentials: 'include' })
    // Source: data/staff.json -> staff_members
    return [...DEMO_DATA.staffMembers];
  },

  getTeams() {
    // INTEGRATION: fetch('/api/staff/teams', { credentials: 'include' })
    // New endpoint - when implementing, add teams to staff.json
    return { ...DEMO_DATA.teams };
  },

  getCompanyGoals() {
    // INTEGRATION: fetch('/api/staff/team-goals', { credentials: 'include' })
    // Source: data/staff.json -> team_goals
    // Response: { goals: [...] }
    return [...DEMO_DATA.companyGoals];
  },

  getTeamGoals(team) {
    // INTEGRATION: fetch('/api/staff/team-goals?team=' + team, { credentials: 'include' })
    // Extended version of team-goals endpoint with team filter
    if (team) return DEMO_DATA.teamGoals[team] || [];
    return { ...DEMO_DATA.teamGoals };
  },

  getUserGoals(userId) {
    // INTEGRATION: fetch('/api/staff/user-goals/' + userId, { credentials: 'include' })
    // Source: data/staff.json -> user_goals[userId]
    // Users see own goals; admin (anisohaney) sees all
    if (userId) return DEMO_DATA.userGoals[userId] || [];
    return { ...DEMO_DATA.userGoals };
  },

  getAllUserGoals() {
    // INTEGRATION: Loop through all staff members, call GET /api/staff/user-goals/:userId for each
    // Only available to admin (anisohaney)
    const all = {};
    for (const [uid, goals] of Object.entries(DEMO_DATA.userGoals)) {
      all[uid] = [...goals];
    }
    return all;
  },

  getTasks(scope, filter) {
    // INTEGRATION: fetch('/api/staff/tasks?scope=' + scope, { credentials: 'include' })
    // New endpoint - extend staff.json with tasks section
    let tasks = [...DEMO_DATA.tasks];
    if (scope === 'my') tasks = tasks.filter(t => (t.assigneeIds || [t.assignee]).includes(DEMO_DATA.currentUser.id));
    if (filter && filter !== 'all') tasks = tasks.filter(t => t.status === filter);
    return tasks;
  },

  getCalendarEvents(month, scope) {
    // INTEGRATION: fetch('/api/staff/calendar?month=' + month + '&scope=' + scope, { credentials: 'include' })
    // New endpoint - extend staff.json with calendar section
    let events = [...DEMO_DATA.calendarEvents];
    if (month) events = events.filter(e => e.date.startsWith(month));
    if (scope === 'team') events = events.filter(e => e.team === DEMO_DATA.currentUser.team || e.team === null);
    return events;
  },

  getLogs(filter, search) {
    // INTEGRATION: fetch('/api/staff/logs?search=' + search + '&type=' + filter + '&limit=50', { credentials: 'include' })
    // Source: data/staff.json -> logs
    // Types: team_goal, user_goal, staff, git_push, system
    let logs = [...DEMO_DATA.logs];
    if (filter && filter !== 'all') logs = logs.filter(l => l.type === filter);
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(l =>
        l.details.toLowerCase().includes(q) ||
        l.username.toLowerCase().includes(q) ||
        (l.metadata.title || '').toLowerCase().includes(q)
      );
    }
    return logs;
  },

  getResources(scope, search) {
    // INTEGRATION: fetch('/api/staff/resources?scope=' + scope + '&search=' + search, { credentials: 'include' })
    // New endpoint - extend staff.json with resources section
    let resources = [...DEMO_DATA.resources];
    if (search) {
      const q = search.toLowerCase();
      resources = resources.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.label || r.category || '').toLowerCase().includes(q)
      );
    }
    return resources;
  },

  getDataInfo() {
    // INTEGRATION: fetch('/api/staff/data-size', { credentials: 'include' })
    // For file breakdown, add GET /api/staff/data-files endpoint
    // Source: fs.readdirSync(DATA_DIR) + fs.statSync for each file
    return { ...DEMO_DATA.dataInfo };
  },

  // ── Mutations (demo stubs) ──────────────────────────────────
  // These show the API shape. In demo mode, they modify DEMO_DATA in-memory.
  // In production, they call the real API endpoints.

  addGoal(type, userId, goal) {
    // INTEGRATION:
    //   Team goal: POST /api/staff/team-goals { title, description, deadline }
    //   User goal: POST /api/staff/user-goals/:userId { title, description, deadline, importance }
    // Source: data/staff.json (atomic update)
    // Auth: requireStaffAdmin
    // Also: POST /api/staff/logs to record the action
    const id = 'goal_' + Date.now();
    const newGoal = { id, ...goal, createdAt: new Date().toISOString(), createdBy: DEMO_DATA.currentUser.id };
    if (type === 'team') {
      DEMO_DATA.companyGoals.unshift(newGoal);
      this.persist('team_goals', newGoal);
    } else if (type === 'user' && userId) {
      if (!DEMO_DATA.userGoals[userId]) DEMO_DATA.userGoals[userId] = [];
      DEMO_DATA.userGoals[userId].unshift(newGoal);
      this.persist('user_goals', { ...newGoal, user_id: userId });
    }
    return newGoal;
  },

  updateGoal(type, goalId, userId, updates) {
    // INTEGRATION:
    //   Team goal: PATCH /api/staff/team-goals/:id { ...updates }
    //   User goal: PATCH /api/staff/user-goals/:userId/:goalId { ...updates }
    // Auth: requireStaff (users can only toggle own goals' completed status)
    // Also: POST /api/staff/logs to record the action
    // Also: record goal completion if completed changed to true
    if (type === 'team') {
      const idx = DEMO_DATA.companyGoals.findIndex(g => g.id === goalId);
      if (idx !== -1) Object.assign(DEMO_DATA.companyGoals[idx], updates);
      this.persistUpdate('team_goals', goalId, updates);
    } else if (type === 'user' && userId) {
      const goals = DEMO_DATA.userGoals[userId] || [];
      const idx = goals.findIndex(g => g.id === goalId);
      if (idx !== -1) Object.assign(goals[idx], updates);
      this.persistUpdate('user_goals', goalId, { ...updates, user_id: userId });
    }
  },

  deleteGoal(type, goalId, userId) {
    // INTEGRATION:
    //   Team goal: DELETE /api/staff/team-goals/:id
    //   User goal: DELETE /api/staff/user-goals/:userId/:goalId
    // Auth: requireStaffAdmin
    // Also: POST /api/staff/logs to record the action
    if (type === 'team') {
      DEMO_DATA.companyGoals = DEMO_DATA.companyGoals.filter(g => g.id !== goalId);
      this.persistDelete('team_goals', goalId);
    } else if (type === 'user' && userId) {
      DEMO_DATA.userGoals[userId] = (DEMO_DATA.userGoals[userId] || []).filter(g => g.id !== goalId);
      this.persistDelete('user_goals', goalId);
    }
  },

  addTask(task) {
    // INTEGRATION: POST /api/staff/tasks { title, description, assignee, team, priority, dueDate }
    // Auth: requireStaffAdmin
    const id = 'task_' + Date.now();
    const newTask = { id, ...task, status: 'todo', createdAt: new Date().toISOString() };
    DEMO_DATA.tasks.unshift(newTask);
    this.persist('tasks', newTask);
    return newTask;
  },

  updateTask(taskId, updates) {
    // INTEGRATION: PATCH /api/staff/tasks/:id { ...updates }
    // Auth: requireStaff (assignee can update status)
    const idx = DEMO_DATA.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) Object.assign(DEMO_DATA.tasks[idx], updates);
    this.persistUpdate('tasks', taskId, updates);
  },

  addEvent(event) {
    // INTEGRATION: POST /api/staff/calendar { title, date, time, duration, type, team, description }
    // Auth: requireStaffAdmin
    const id = 'evt_' + Date.now();
    const newEvent = { id, ...event };
    DEMO_DATA.calendarEvents.push(newEvent);
    this.persist('calendar_events', newEvent);
    return newEvent;
  },

  addResource(resource) {
    // INTEGRATION: POST /api/staff/resources { title, url, description, team }
    // Auth: requireStaffAdmin
    const id = 'res_' + Date.now();
    const newResource = { id, ...resource, addedBy: DEMO_DATA.currentUser.id, addedAt: new Date().toISOString() };
    DEMO_DATA.resources.unshift(newResource);
    this.persist('resources', newResource);
    return newResource;
  },

  async addStaffMember(userId) {
    // POST /api/staff/members { userId }
    // Auth: requireStaffAdmin
    // Also: updates user record with staff_access: true in data/users.json
    // Also: POST /api/staff/logs to record the action
    const res = await fetch('/api/staff/members', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not add staff member');
    const member = data.member || {};
    DEMO_DATA.staffMembers.push({
      userId: member.userId || userId,
      username: member.username || '',
      firstName: member.first_name || member.firstName || '',
      lastNameInitial: member.last_name_initial || member.lastNameInitial || '',
      permissions: [],
      addedAt: new Date().toISOString(),
      addedBy: DEMO_DATA.currentUser?.id || ''
    });
    return data.member;
  },

  async removeStaffMember(userId) {
    // DELETE /api/staff/members/:userId
    // Auth: requireStaffAdmin
    // Also: updates user record with staff_access: false in data/users.json
    // Also: POST /api/staff/logs to record the action
    const res = await fetch(`/api/staff/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not remove staff member');
    DEMO_DATA.staffMembers = DEMO_DATA.staffMembers.filter(m => m.userId !== userId);
  }
};

// ── Resolve current staff user ───────────────────────────────
// Reads the main demo's session from localStorage ('larpable_demo_session',
// written by js/data.js login/logout — the standalone equivalent of the real
// app's shared larpable_session cookie);
// falls back to the first staff member for guest access.
(function resolveStaffUser() {
  let sessionId = null;
  try { sessionId = localStorage.getItem('larpable_demo_session'); } catch (e) {}
  if (sessionId && DEMO_DATA.staffMembers.some(m => m.userId === sessionId)) {
    const member = DEMO_DATA.staffMembers.find(m => m.userId === sessionId);
    DEMO_DATA.currentUser = {
      id: member.userId,
      username: member.username,
      firstName: member.firstName,
      lastNameInitial: member.lastNameInitial,
      team: member.team,
      isAdmin: member.userId === DEMO_DATA.staffMembers[0].userId, // first member = admin (demo)
      hasAccess: true
    };
  } else {
    const m = DEMO_DATA.staffMembers[0];
    DEMO_DATA.currentUser = {
      id: m.userId,
      username: m.username,
      firstName: m.firstName,
      lastNameInitial: m.lastNameInitial,
      team: m.team,
      isAdmin: true,
      hasAccess: true
    };
  }
})();
