/**
 * LARPABLE — Staff Routes
 * 
 * Protected routes for staff dashboard functionality.
 * All routes require authentication and staff access.
 * 
 * GET    /api/staff/check         - Check staff access
 * GET    /api/staff/stats         - User/post counts
 * GET    /api/staff/team-goals    - Get team goals
 * POST   /api/staff/team-goals    - Add team goal (anisohaney only)
 * PATCH  /api/staff/team-goals/:id - Update team goal
 * DELETE /api/staff/team-goals/:id - Delete team goal (anisohaney only)
 * GET    /api/staff/user-goals/:userId - Get user goals
 * POST   /api/staff/user-goals/:userId - Add user goal (anisohaney only)
 * PATCH  /api/staff/user-goals/:userId/:goalId - Update user goal
 * DELETE /api/staff/user-goals/:userId/:goalId - Delete user goal (anisohaney only)
 * GET    /api/staff/logs          - Get logs
 * POST   /api/staff/logs          - Add log
 * GET    /api/staff/members       - Get staff members
 * POST   /api/staff/members       - Add staff member (anisohaney only)
 * DELETE /api/staff/members/:userId - Remove staff member (anisohaney only)
 * GET    /api/staff/users         - Get all users (anisohaney only)
 * POST   /api/staff/portal-open   - Record staff portal open
 * GET    /api/staff/inbox         - Get staff inbox (new goals + urgency)
 * GET    /api/staff/goal-completions/:userId - Get completion history
 */

const express = require('express');
const router = express.Router();
const auth = require('../../backend/auth');
const store = require('../../backend/store');
const crypto = require('../../backend/crypto');
const path = require('path');
const fs = require('fs');

const COOKIE_NAME = 'larpable_session';
const STAFF_FILE = 'staff.json';
const STAFF_ADMIN_USERNAME = 'anisohaney';

// ── Middleware: require auth ──────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const user = await auth.getUserFromToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  req.user = user;
  next();
}

// ── Middleware: require staff access ──────────────────────────
async function requireStaff(req, res, next) {
  // Check if user has staff_access flag
  if (req.user.staff_access === true) {
    return next();
  }
  
  // Special case: admin always has access
  if (req.user.role === 'admin') {
    return next();
  }
  
  // Check if this is the first user (by creation date)
  try {
    const users = await store.read('users.json');
    const sortedUsers = Object.entries(users)
      .filter(([id, user]) => user.type !== 'admin')
      .sort((a, b) => new Date(a[1].created_at) - new Date(b[1].created_at));
    
    if (sortedUsers.length > 0 && sortedUsers[0][0] === req.user.id) {
      const rawUser = await store.getRawUser(req.user.id);
      if (rawUser) {
        rawUser.staff_access = true;
        await store.saveUser(req.user.id, rawUser);
      }
      return next();
    }
  } catch (e) {
    console.error('Staff access check error:', e);
  }
  
  return res.status(403).json({ error: 'Staff access required' });
}

// ── Middleware: require staff admin (anisohaney) ──────────────
async function requireStaffAdmin(req, res, next) {
  // Check username from decrypted fields
  const username = req.user.encrypted_fields?.username || '';
  
  if (username === STAFF_ADMIN_USERNAME) {
    return next();
  }
  
  // Special case: admin always has access
  if (req.user.role === 'admin') {
    return next();
  }
  
  // Check if this is the first user (by creation date)
  try {
    const users = await store.read('users.json');
    const sortedUsers = Object.entries(users)
      .filter(([id, user]) => user.type !== 'admin') // Exclude admin
      .sort((a, b) => new Date(a[1].created_at) - new Date(b[1].created_at));
    
    if (sortedUsers.length > 0 && sortedUsers[0][0] === req.user.id) {
      return next();
    }
  } catch (e) {
    console.error('Error checking first user:', e);
  }
  
  return res.status(403).json({ error: 'Staff admin access required' });
}

// ── GET /api/staff/check ─────────────────────────────────────
router.get('/check', requireAuth, async (req, res) => {
  try {
    const username = req.user.encrypted_fields?.username || '';
    
    // Check if user has staff_access flag OR is the staff admin username
    // Also check if user is the first user (by creation date) - they become staff admin
    let hasAccess = req.user.staff_access === true || req.user.role === 'admin';
    let isAdmin = username === STAFF_ADMIN_USERNAME;
    
    // If this is the staff admin username, automatically grant access
    if (username === STAFF_ADMIN_USERNAME && !hasAccess) {
      hasAccess = true;
      isAdmin = true;
      
      // Update user record with staff_access flag
      try {
        const rawUser = await store.getRawUser(req.user.id);
        if (rawUser) {
          rawUser.staff_access = true;
          await store.saveUser(req.user.id, rawUser);
        }
      } catch (e) {
        console.error('Failed to update staff_access:', e);
      }
    }
    
    // If no staff access yet, check if this is the first user (by creation date)
    // First user becomes staff admin
    if (!hasAccess && !isAdmin) {
      const users = await store.read('users.json');
      const sortedUsers = Object.entries(users)
        .filter(([id, user]) => user.type !== 'admin') // Exclude admin
        .sort((a, b) => new Date(a[1].created_at) - new Date(b[1].created_at));
      
      if (sortedUsers.length > 0 && sortedUsers[0][0] === req.user.id) {
        hasAccess = true;
        isAdmin = true;
        
        // Update user record with staff_access flag
        try {
          const rawUser = await store.getRawUser(req.user.id);
          if (rawUser) {
            rawUser.staff_access = true;
            await store.saveUser(req.user.id, rawUser);
          }
        } catch (e) {
          console.error('Failed to update staff_access:', e);
        }
      }
    }
    
    res.json({ 
      hasAccess,
      isAdmin,
      username
    });
  } catch (e) {
    console.error('Staff check error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/staff/stats ─────────────────────────────────────
router.get('/stats', requireAuth, requireStaff, async (req, res) => {
  try {
    // Get user count
    const users = await store.read('users.json');
    const userCount = Object.keys(users).length;
    
    // Get opportunity counts by type
    const opportunities = await store.read('opportunities.json');
    let nonprofitCount = 0;
    let projectCount = 0;
    let companyCount = 0;
    
    for (const opp of Object.values(opportunities)) {
      const decrypted = crypto.decryptObject(opp);
      if (decrypted.type === 'nonprofit') nonprofitCount++;
      else if (decrypted.type === 'project') projectCount++;
      else if (decrypted.type === 'company') companyCount++;
    }
    
    res.json({
      users: userCount,
      nonprofits: nonprofitCount,
      projects: projectCount,
      companies: companyCount,
      totalPosts: nonprofitCount + projectCount + companyCount
    });
  } catch (e) {
    console.error('Staff stats error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/staff/team-goals ────────────────────────────────
router.get('/team-goals', requireAuth, requireStaff, async (req, res) => {
  try {
    const staffData = await store.read(STAFF_FILE);
    const goals = staffData.team_goals || {};
    
    // Convert to array and sort by created_at
    const goalsArray = Object.entries(goals).map(([id, goal]) => ({
      id,
      ...goal
    })).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    res.json({ goals: goalsArray });
  } catch (e) {
    console.error('Get team goals error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/staff/team-goals ───────────────────────────────
router.post('/team-goals', requireAuth, requireStaffAdmin, async (req, res) => {
  try {
    const { title, description, deadline } = req.body;
    
    if (!title || !deadline) {
      return res.status(400).json({ error: 'Title and deadline required' });
    }
    
    // Check goal limit
    const staffData = await store.read(STAFF_FILE);
    const goals = staffData.team_goals || {};
    const goalCount = Object.keys(goals).length;
    
    if (goalCount >= 15) {
      return res.status(400).json({ error: 'Maximum 15 team goals allowed' });
    }
    
    // Generate goal ID
    const goalId = 'tgoal_' + crypto.sha256(title + Date.now()).hash.substring(0, 12);
    
    const newGoal = {
      title,
      description: description || '',
      deadline,
      completed: false,
      completed_at: null,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      last_modified_by: req.user.id,
      last_modified_at: new Date().toISOString()
    };
    
    // Save goal
    await store.atomicUpdate(STAFF_FILE, (data) => {
      if (!data.team_goals) data.team_goals = {};
      data.team_goals[goalId] = newGoal;
      return data;
    });
    
    // Log the action
    await addLog({
      type: 'team_goal',
      action: 'add',
      details: `Added team goal: "${title}"`,
      user_id: req.user.id,
      username: req.user.encrypted_fields?.username || 'unknown',
      metadata: { goal_id: goalId, title }
    });
    
    res.json({ goal: { id: goalId, ...newGoal } });
  } catch (e) {
    console.error('Add team goal error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/staff/team-goals/:id ──────────────────────────
router.patch('/team-goals/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Only anisohaney can edit goals
    const username = req.user.encrypted_fields?.username || '';
    if (username !== STAFF_ADMIN_USERNAME && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only staff admin can edit goals' });
    }
    
    const staffData = await store.read(STAFF_FILE);
    const goal = staffData.team_goals?.[id];
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Track if completed status changed
    const wasCompleted = goal.completed;
    const isCompleted = updates.completed !== undefined ? updates.completed : wasCompleted;
    
    // Update goal
    const updatedGoal = {
      ...goal,
      ...updates,
      last_modified_by: req.user.id,
      last_modified_at: new Date().toISOString()
    };
    
    // Set completed_at if just completed
    if (!wasCompleted && isCompleted) {
      updatedGoal.completed_at = new Date().toISOString();
      // Record goal completion
      await recordGoalCompletion(req.user.id, { ...updatedGoal, id }, updatedGoal.completed_at);
    } else if (wasCompleted && !isCompleted) {
      updatedGoal.completed_at = null;
    }
    
    await store.atomicUpdate(STAFF_FILE, (data) => {
      data.team_goals[id] = updatedGoal;
      return data;
    });
    
    // Log the action
    const action = wasCompleted !== isCompleted ? (isCompleted ? 'complete' : 'uncomplete') : 'edit';
    await addLog({
      type: 'team_goal',
      action,
      details: `${action === 'complete' ? 'Completed' : action === 'uncomplete' ? 'Uncompleted' : 'Edited'} team goal: "${updatedGoal.title}"`,
      user_id: req.user.id,
      username: req.user.encrypted_fields?.username || 'unknown',
      metadata: { goal_id: id, title: updatedGoal.title }
    });
    
    res.json({ goal: { id, ...updatedGoal } });
  } catch (e) {
    console.error('Update team goal error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/staff/team-goals/:id ─────────────────────────
router.delete('/team-goals/:id', requireAuth, requireStaffAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const staffData = await store.read(STAFF_FILE);
    const goal = staffData.team_goals?.[id];
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Delete goal
    await store.atomicUpdate(STAFF_FILE, (data) => {
      delete data.team_goals[id];
      return data;
    });
    
    // Log the action
    await addLog({
      type: 'team_goal',
      action: 'remove',
      details: `Removed team goal: "${goal.title}"`,
      user_id: req.user.id,
      username: req.user.encrypted_fields?.username || 'unknown',
      metadata: { goal_id: id, title: goal.title }
    });
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete team goal error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/staff/user-goals/:userId ────────────────────────
router.get('/user-goals/:userId', requireAuth, requireStaff, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Users can only see their own goals unless they're admin/anisohaney
    const username = req.user.encrypted_fields?.username || '';
    const isSelf = req.user.id === userId;
    const isAdmin = req.user.role === 'admin';
    const isStaffAdmin = username === STAFF_ADMIN_USERNAME;
    
    if (!isSelf && !isAdmin && !isStaffAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const staffData = await store.read(STAFF_FILE);
    const userGoals = staffData.user_goals?.[userId] || {};
    
    // Convert to array and sort by deadline
    const goalsArray = Object.entries(userGoals).map(([id, goal]) => ({
      id,
      ...goal
    })).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    
    res.json({ goals: goalsArray });
  } catch (e) {
    console.error('Get user goals error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/staff/user-goals/:userId ───────────────────────
router.post('/user-goals/:userId', requireAuth, requireStaffAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, description, deadline, importance } = req.body;
    
    if (!title || !deadline || !importance) {
      return res.status(400).json({ error: 'Title, deadline, and importance required' });
    }
    
    if (!['high', 'medium', 'low'].includes(importance)) {
      return res.status(400).json({ error: 'Importance must be high, medium, or low' });
    }
    
    // Generate goal ID
    const goalId = 'ugoal_' + crypto.sha256(title + userId + Date.now()).hash.substring(0, 12);
    
    const newGoal = {
      title,
      description: description || '',
      deadline,
      importance,
      completed: false,
      completed_at: null,
      created_by: req.user.id,
      created_at: new Date().toISOString()
    };
    
    // Save goal
    await store.atomicUpdate(STAFF_FILE, (data) => {
      if (!data.user_goals) data.user_goals = {};
      if (!data.user_goals[userId]) data.user_goals[userId] = {};
      data.user_goals[userId][goalId] = newGoal;
      return data;
    });
    
    // Get target user's username for logging
    const targetUser = await store.getUser(userId);
    const targetUsername = targetUser?.encrypted_fields?.username || userId;
    
    // Log the action
    await addLog({
      type: 'user_goal',
      action: 'add',
      details: `Added goal for ${targetUsername}: "${title}"`,
      user_id: req.user.id,
      username: req.user.encrypted_fields?.username || 'unknown',
      metadata: { goal_id: goalId, target_user_id: userId, title }
    });
    
    res.json({ goal: { id: goalId, ...newGoal } });
  } catch (e) {
    console.error('Add user goal error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/staff/user-goals/:userId/:goalId ──────────────
router.patch('/user-goals/:userId/:goalId', requireAuth, requireStaff, async (req, res) => {
  try {
    const { userId, goalId } = req.params;
    const updates = req.body;
    
    // Check permissions
    const username = req.user.encrypted_fields?.username || '';
    const isSelf = req.user.id === userId;
    const isAdmin = req.user.role === 'admin';
    const isStaffAdmin = username === STAFF_ADMIN_USERNAME;
    
    // Users can only mark their own goals as complete
    if (isSelf && !isStaffAdmin && !isAdmin) {
      // Can only toggle completed status
      const allowedUpdates = {};
      if (updates.completed !== undefined) {
        allowedUpdates.completed = updates.completed;
      }
      Object.assign(updates, allowedUpdates);
      // Only allow completed field
      for (const key of Object.keys(updates)) {
        if (key !== 'completed') delete updates[key];
      }
    } else if (!isSelf && !isStaffAdmin && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const staffData = await store.read(STAFF_FILE);
    const goal = staffData.user_goals?.[userId]?.[goalId];
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Track if completed status changed
    const wasCompleted = goal.completed;
    const isCompleted = updates.completed !== undefined ? updates.completed : wasCompleted;
    
    // Update goal
    const updatedGoal = {
      ...goal,
      ...updates
    };
    
    // Set completed_at if just completed
    if (!wasCompleted && isCompleted) {
      updatedGoal.completed_at = new Date().toISOString();
      // Record goal completion
      await recordGoalCompletion(userId, { ...updatedGoal, id: goalId }, updatedGoal.completed_at);
    } else if (wasCompleted && !isCompleted) {
      updatedGoal.completed_at = null;
    }
    
    await store.atomicUpdate(STAFF_FILE, (data) => {
      data.user_goals[userId][goalId] = updatedGoal;
      return data;
    });
    
    // Get target user's username for logging
    const targetUser = await store.getUser(userId);
    const targetUsername = targetUser?.encrypted_fields?.username || userId;
    
    // Log the action
    const action = wasCompleted !== isCompleted ? (isCompleted ? 'complete' : 'uncomplete') : 'edit';
    await addLog({
      type: 'user_goal',
      action,
      details: `${action === 'complete' ? 'Completed' : action === 'uncomplete' ? 'Uncompleted' : 'Edited'} goal for ${targetUsername}: "${updatedGoal.title}"`,
      user_id: req.user.id,
      username: req.user.encrypted_fields?.username || 'unknown',
      metadata: { goal_id: goalId, target_user_id: userId, title: updatedGoal.title }
    });
    
    res.json({ goal: { id: goalId, ...updatedGoal } });
  } catch (e) {
    console.error('Update user goal error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/staff/user-goals/:userId/:goalId ─────────────
router.delete('/user-goals/:userId/:goalId', requireAuth, requireStaffAdmin, async (req, res) => {
  try {
    const { userId, goalId } = req.params;
    
    const staffData = await store.read(STAFF_FILE);
    const goal = staffData.user_goals?.[userId]?.[goalId];
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Delete goal
    await store.atomicUpdate(STAFF_FILE, (data) => {
      delete data.user_goals[userId][goalId];
      return data;
    });
    
    // Get target user's username for logging
    const targetUser = await store.getUser(userId);
    const targetUsername = targetUser?.encrypted_fields?.username || userId;
    
    // Log the action
    await addLog({
      type: 'user_goal',
      action: 'remove',
      details: `Removed goal for ${targetUsername}: "${goal.title}"`,
      user_id: req.user.id,
      username: req.user.encrypted_fields?.username || 'unknown',
      metadata: { goal_id: goalId, target_user_id: userId, title: goal.title }
    });
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete user goal error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/staff/logs ──────────────────────────────────────
router.get('/logs', requireAuth, requireStaff, async (req, res) => {
  try {
    const { search, type, limit = 50 } = req.query;
    
    const staffData = await store.read(STAFF_FILE);
    let logs = staffData.logs || {};
    
    // Convert to array
    let logsArray = Object.entries(logs).map(([id, log]) => ({
      id,
      ...log
    }));
    
    // Filter out user_goal entries
    logsArray = logsArray.filter(log => log.type !== 'user_goal');
    
    // Filter by type if specified
    if (type) {
      logsArray = logsArray.filter(log => log.type === type);
    }
    
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      logsArray = logsArray.filter(log => 
        log.details?.toLowerCase().includes(searchLower) ||
        log.username?.toLowerCase().includes(searchLower) ||
        log.metadata?.title?.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort by timestamp (newest first)
    logsArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit results
    logsArray = logsArray.slice(0, parseInt(limit));
    
    res.json({ logs: logsArray });
  } catch (e) {
    console.error('Get logs error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/staff/logs ─────────────────────────────────────
router.post('/logs', requireAuth, requireStaff, async (req, res) => {
  try {
    const logEntry = req.body;
    
    const log = await addLog({
      type: logEntry.type || 'system',
      action: logEntry.action || 'info',
      details: logEntry.details || '',
      user_id: req.user.id,
      username: req.user.encrypted_fields?.username || 'unknown',
      metadata: logEntry.metadata || {}
    });
    
    res.json({ log });
  } catch (e) {
    console.error('Add log error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/staff/members ───────────────────────────────────
router.get('/members', requireAuth, requireStaff, async (req, res) => {
  try {
    const staffData = await store.read(STAFF_FILE);
    const members = staffData.staff_members || {};
    
    // Convert to array
    const membersArray = Object.entries(members).map(([userId, member]) => ({
      id: userId,
      userId,
      ...member
    }));
    
    res.json({ members: membersArray });
  } catch (e) {
    console.error('Get staff members error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/staff/members ──────────────────────────────────
router.post('/members', requireAuth, requireStaffAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }
    
    // Get user data
    const user = await store.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const fields = user.encrypted_fields || {};
    const username = fields.username || '';
    const firstName = fields.firstName || fields.first_name || '';
    const lastName = fields.lastName || fields.last_name || '';
    const lastNameInitial = lastName ? lastName.charAt(0).toUpperCase() : '';
    
    // Check if already a staff member
    const staffData = await store.read(STAFF_FILE);
    if (staffData.staff_members?.[userId]) {
      return res.status(409).json({ error: 'User is already a staff member' });
    }
    
    // Add to staff members
    await store.atomicUpdate(STAFF_FILE, (data) => {
      if (!data.staff_members) data.staff_members = {};
      data.staff_members[userId] = {
        username,
        first_name: firstName,
        last_name_initial: lastNameInitial,
        added_by: req.user.id,
        added_at: new Date().toISOString()
      };
      return data;
    });
    
    // Update user record with staff_access flag
    const rawUser = await store.getRawUser(userId);
    if (rawUser) {
      rawUser.staff_access = true;
      await store.saveUser(userId, rawUser);
    }
    
    // Log the action
    await addLog({
      type: 'staff',
      action: 'add_member',
      details: `Added staff member: ${username}`,
      user_id: req.user.id,
      username: req.user.encrypted_fields?.username || 'unknown',
      metadata: { target_user_id: userId, target_username: username }
    });
    
    res.json({ 
      member: { 
        userId, 
        username, 
        first_name: firstName, 
        last_name_initial: lastNameInitial 
      } 
    });
  } catch (e) {
    console.error('Add staff member error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/staff/members/:userId/permissions ─────────────
// The redesigned portal uses this endpoint to grant/revoke the six
// explicit staff capabilities. Admin access itself remains derived from the
// staff-admin rule and cannot be granted through this route.
router.patch('/members/:userId/permissions', requireAuth, requireStaffAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const requested = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const allowed = new Set([
      'modify_calendar', 'assign_goals', 'assign_tasks',
      'manage_staff', 'skills_control', 'user_control'
    ]);
    const staffData = await store.read(STAFF_FILE);
    const member = staffData.staff_members?.[userId];
    if (!member) return res.status(404).json({ error: 'Staff member not found' });
    if (member.added_by === userId) {
      return res.status(400).json({ error: 'Admin permissions cannot be changed' });
    }
    const permissions = [...new Set(requested.filter(permission => allowed.has(permission)))];
    await store.atomicUpdate(STAFF_FILE, data => {
      data.staff_members[userId].permissions = permissions;
      return data;
    });
    res.json({ ok: true, permissions });
  } catch (e) {
    console.error('Update staff permissions error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/staff/members/:userId ────────────────────────
router.delete('/members/:userId', requireAuth, requireStaffAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const staffData = await store.read(STAFF_FILE);
    if (!staffData.staff_members?.[userId]) {
      return res.status(404).json({ error: 'Staff member not found' });
    }
    
    const member = staffData.staff_members[userId];
    
    // Remove from staff members
    await store.atomicUpdate(STAFF_FILE, (data) => {
      delete data.staff_members[userId];
      return data;
    });
    
    // Update user record to remove staff_access flag
    const rawUser = await store.getRawUser(userId);
    if (rawUser) {
      rawUser.staff_access = false;
      await store.saveUser(userId, rawUser);
    }
    
    // Log the action
    await addLog({
      type: 'staff',
      action: 'remove_member',
      details: `Removed staff member: ${member.username}`,
      user_id: req.user.id,
      username: req.user.encrypted_fields?.username || 'unknown',
      metadata: { target_user_id: userId, target_username: member.username }
    });
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Remove staff member error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/staff/users ─────────────────────────────────────
router.get('/users', requireAuth, requireStaffAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    
    const users = await store.read('users.json');
    
    let usersArray = Object.entries(users).map(([userId, user]) => {
      // Decrypt the encrypted fields to get actual usernames
      const fields = crypto.decryptObject(user.encrypted_fields || {});
      const username = fields.username || '';
      const firstName = fields.firstName || fields.first_name || '';
      const lastName = fields.lastName || fields.last_name || '';
      const lastNameInitial = lastName ? lastName.charAt(0).toUpperCase() : '';
      
      // Build display string: prefer username, fall back to first name
      let display;
      if (username) {
        display = `${username}: ${firstName.toLowerCase()} ${lastNameInitial.toLowerCase()}`.trim();
      } else {
        display = `${firstName} ${lastNameInitial}`.trim() || 'Unknown';
      }
      
      return {
        userId,
        username,
        first_name: firstName,
        last_name_initial: lastNameInitial,
        display
      };
    });
    
    // Filter out admin user
    usersArray = usersArray.filter(u => u.username !== 'admin');
    
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      usersArray = usersArray.filter(u => 
        u.username.toLowerCase().includes(searchLower) ||
        u.first_name.toLowerCase().includes(searchLower) ||
        u.display.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort by username
    usersArray.sort((a, b) => a.username.localeCompare(b.username));
    
    res.json({ users: usersArray });
  } catch (e) {
    console.error('Get users error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Helper: Add log entry ────────────────────────────────────
async function addLog(logData) {
  const logId = 'log_' + crypto.sha256(JSON.stringify(logData) + Date.now()).hash.substring(0, 12);
  
  const log = {
    ...logData,
    timestamp: new Date().toISOString()
  };
  
  await store.atomicUpdate(STAFF_FILE, (data) => {
    if (!data.logs) data.logs = {};
    data.logs[logId] = log;
    
    // Trim logs if exceeding 5000 — delete oldest 50%
    const logCount = Object.keys(data.logs).length;
    if (logCount > 5000) {
      const entries = Object.entries(data.logs)
        .sort((a, b) => new Date(a[1].timestamp) - new Date(b[1].timestamp));
      const toDelete = Math.ceil(entries.length / 2);
      for (let i = 0; i < toDelete; i++) {
        delete data.logs[entries[i][0]];
      }
    }
    
    return data;
  });
  
  return { id: logId, ...log };
}

// ── GET /api/staff/git-logs ──────────────────────────────────
// Returns recent git commits from the app repository
// App directory is parallel to data directory (both in same parent folder)
router.get('/git-logs', requireAuth, requireStaff, async (req, res) => {
  try {
    const { execSync } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    
    // Path to the git repo - app dir is parallel to data dir
    // Check for /<parent>/app first, then /<parent>/larpable.me
    const parentDir = path.dirname(store.DATA_DIR);
    let gitDir = path.join(parentDir, 'app');
    if (!fs.existsSync(gitDir)) {
      gitDir = path.join(parentDir, 'larpable.me');
    }
    
    // Get recent commits with date and message
    // Format: hash|date|message
    const gitLog = execSync(
      'git log --format="%H|%ai|%s" -20 --no-merges',
      { 
        cwd: gitDir, 
        encoding: 'utf8',
        timeout: 5000
      }
    ).trim();
    
    const commits = gitLog ? gitLog.split('\n').map(line => {
      const [hash, date, ...messageParts] = line.split('|');
      return {
        hash: hash.substring(0, 7),
        date,
        message: messageParts.join('|')
      };
    }) : [];
    
    res.json({ commits });
  } catch (e) {
    console.error('Git logs error:', e.message);
    // Return empty if git is not available or repo doesn't exist
    res.json({ commits: [], error: 'Git history unavailable' });
  }
});

// ── POST /api/staff/portal-open ──────────────────────────────
router.post('/portal-open', requireAuth, requireStaff, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date().toISOString();
    
    await store.atomicUpdate(STAFF_FILE, (data) => {
      if (!data.staff_portal_opens) data.staff_portal_opens = {};
      data.staff_portal_opens[userId] = {
        last_opened: now,
        previous_open: data.staff_portal_opens[userId]?.last_opened || null
      };
      return data;
    });
    
    res.json({ ok: true, last_opened: now });
  } catch (e) {
    console.error('Portal open error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/staff/inbox ─────────────────────────────────────
router.get('/inbox', requireAuth, requireStaff, async (req, res) => {
  try {
    const userId = req.user.id;
    const staffData = await store.read(STAFF_FILE);
    
    // Get last portal open time — use previous_open to compare against goals
    // (last_opened is updated in the same request, so it would always be "now")
    const portalOpen = staffData.staff_portal_opens?.[userId];
    const lastOpened = portalOpen?.previous_open;
    
    // Get all user goals assigned to this user
    const userGoals = staffData.user_goals?.[userId] || {};
    const userGoalsArray = Object.entries(userGoals).map(([id, goal]) => ({ id, ...goal }));
    
    // Get all team goals
    const teamGoals = staffData.team_goals || {};
    const teamGoalsArray = Object.entries(teamGoals).map(([id, goal]) => ({ id, ...goal }));
    
    // Find new individual goals (created after last open)
    const newTasks = lastOpened 
      ? userGoalsArray.filter(g => new Date(g.created_at) > new Date(lastOpened) && !g.completed)
      : [];
    
    // Find new team goals (created after last open)
    const newTeamGoals = lastOpened
      ? teamGoalsArray.filter(g => new Date(g.created_at) > new Date(lastOpened) && !g.completed)
      : [];
    
    // Urgency alerts for incomplete goals
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const urgencyAlerts = [];
    
    userGoalsArray.filter(g => !g.completed).forEach(goal => {
      const deadline = new Date(goal.deadline);
      const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
      const daysLeft = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysLeft <= 0) {
        // Due today or overdue - urgent
        urgencyAlerts.push({
          type: 'individual',
          urgency: 'urgent',
          title: goal.title,
          deadline: goal.deadline,
          importance: goal.importance,
          message: `URGENT: "${goal.title}" is due${daysLeft < 0 ? ' (overdue)' : ' today'}!`
        });
      } else if (daysLeft === 1) {
        // Due tomorrow - warning
        urgencyAlerts.push({
          type: 'individual',
          urgency: 'warning',
          title: goal.title,
          deadline: goal.deadline,
          importance: goal.importance,
          message: `"${goal.title}" is due tomorrow.`
        });
      }
    });
    
    // Team goal urgency
    teamGoalsArray.filter(g => !g.completed).forEach(goal => {
      const deadline = new Date(goal.deadline);
      const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
      const daysLeft = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysLeft <= 0) {
        urgencyAlerts.push({
          type: 'team',
          urgency: 'urgent',
          title: goal.title,
          deadline: goal.deadline,
          message: `URGENT team goal: "${goal.title}" is due${daysLeft < 0 ? ' (overdue)' : ' today'}!`
        });
      } else if (daysLeft === 1) {
        urgencyAlerts.push({
          type: 'team',
          urgency: 'warning',
          title: goal.title,
          deadline: goal.deadline,
          message: `Team goal "${goal.title}" is due tomorrow.`
        });
      }
    });
    
    // Sort urgency: urgent first, then warnings
    urgencyAlerts.sort((a, b) => {
      if (a.urgency === 'urgent' && b.urgency !== 'urgent') return -1;
      if (a.urgency !== 'urgent' && b.urgency === 'urgent') return 1;
      return 0;
    });
    
    res.json({
      newTasks: newTasks.length,
      newTeamGoals: newTeamGoals.length,
      newTeamGoalTitles: newTeamGoals.map(g => g.title),
      urgencyAlerts
    });
  } catch (e) {
    console.error('Get inbox error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/staff/goal-completions/:userId ───────────────────
router.get('/goal-completions/:userId', requireAuth, requireStaff, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Users can only see their own completions unless admin/anisohaney
    const username = req.user.encrypted_fields?.username || '';
    const isSelf = req.user.id === userId;
    const isAdmin = req.user.role === 'admin';
    const isStaffAdmin = username === STAFF_ADMIN_USERNAME;
    
    if (!isSelf && !isAdmin && !isStaffAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const staffData = await store.read(STAFF_FILE);
    const completions = staffData.goal_completions?.[userId] || [];
    
    res.json({ completions });
  } catch (e) {
    console.error('Get goal completions error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Helper: Record goal completion ───────────────────────────
async function recordGoalCompletion(userId, goal, completedAt) {
  const deadline = new Date(goal.deadline);
  const completed = new Date(completedAt);
  const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const completedDate = new Date(completed.getFullYear(), completed.getMonth(), completed.getDate());
  const onTime = completedDate <= deadlineDate;
  
  const record = {
    goal_id: goal.id || 'unknown',
    title: goal.title,
    deadline: goal.deadline,
    completed_at: completedAt,
    on_time: onTime,
    importance: goal.importance || null
  };
  
  await store.atomicUpdate(STAFF_FILE, (data) => {
    if (!data.goal_completions) data.goal_completions = {};
    if (!data.goal_completions[userId]) data.goal_completions[userId] = [];
    data.goal_completions[userId].push(record);
    return data;
  });
  
  return record;
}

// ── GET /api/staff/data ──────────────────────────────────────
// One read-only payload hydrates the redesigned staff portal. The response
// deliberately preserves the existing staff.json shapes while accepting both
// object and array collections introduced by newer portal versions.
router.get('/data', requireAuth, requireStaff, async (req, res) => {
  try {
    const staff = await store.read(STAFF_FILE);
    const entries = (value) => Array.isArray(value)
      ? value
      : Object.entries(value || {}).map(([id, item]) => ({ id, ...item }));
    res.json({
      members: entries(staff.staff_members),
      logs: entries(staff.logs).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)),
      teamGoals: entries(staff.team_goals),
      userGoals: staff.user_goals || {},
      tasks: entries(staff.tasks),
      calendarEvents: entries(staff.calendar_events),
      resources: entries(staff.resources)
    });
  } catch (e) {
    console.error('Get staff data error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/staff/overview ─────────────────────────────────
// Read-only operational metrics for the redesigned dashboard. It computes
// directly from the configured data directory, so local and production data
// use the same code path and no fixture is copied or rewritten.
router.get('/overview', requireAuth, requireStaff, async (req, res) => {
  try {
    const rawUsers = await store.read('users.json');
    const users = Object.entries(rawUsers).map(([id, raw]) => {
      const decrypted = crypto.decryptObject(raw);
      const fields = decrypted.encrypted_fields || {};
      return {
        id,
        username: fields.username || '',
        first_name: fields.first_name || fields.firstName || '',
        last_name: fields.last_name || fields.lastName || '',
        skills: Array.isArray(fields.skills) ? fields.skills : [],
        interests: Array.isArray(fields.interests) ? fields.interests : [],
        created_at: decrypted.created_at || raw.created_at || null,
        verified: !!(decrypted.verified || fields.verified || fields.email_verified || fields.emailVerified)
      };
    });      const posts = await store.getAllOpportunities(null);
    const staff = await store.read(STAFF_FILE);
    const count = new Map();
    const countValues = (values) => (values || []).forEach(value => {
      const key = String(value || '').trim();
      if (key) count.set(key, (count.get(key) || 0) + 1);
    });
    const top = (map, limit = 8) => [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([label, value]) => ({ label, count: value }));
    const skillCounts = new Map(), interestCounts = new Map(), fieldCounts = new Map();
    users.forEach(user => { countValues(user.skills); (user.skills || []).forEach(value => skillCounts.set(value, (skillCounts.get(value) || 0) + 1)); (user.interests || []).forEach(value => interestCounts.set(value, (interestCounts.get(value) || 0) + 1)); });
    const postsByType = {};
    posts.forEach(post => {
      const fields = post.encrypted_fields || {};
      postsByType[post.type || 'unknown'] = (postsByType[post.type || 'unknown'] || 0) + 1;
      const field = fields.industry || fields.nonprofit_field || fields.field;
      if (field) fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
    });
    const dates = users.map(user => user.created_at).filter(Boolean).sort();
    const launchDate = dates[0] ? dates[0].slice(0, 10) : new Date().toISOString().slice(0, 10);
    const now = Date.now();
    const daysAgo = days => now - days * 24 * 60 * 60 * 1000;
    const usersLast7Days = users.filter(user => new Date(user.created_at).getTime() >= daysAgo(7)).length;
    const usersLast30Days = users.filter(user => new Date(user.created_at).getTime() >= daysAgo(30)).length;
    const postsLast7Days = posts.filter(post => new Date(post.created_at).getTime() >= daysAgo(7)).length;
    const postsLast30Days = posts.filter(post => new Date(post.created_at).getTime() >= daysAgo(30)).length;
    const staffCount = Object.keys(staff.staff_members || {}).length;
    const recentUsers = [...users].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 8);
    const recentPosts = [...posts].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 8).map(post => {
      const fields = post.encrypted_fields || {};
      return { title: fields.title || post.title || 'Untitled', type: post.type || 'unknown', field: fields.industry || fields.nonprofit_field || fields.field || '', created_at: post.created_at };
    });
    const growth = [];
    const start = new Date(launchDate + 'T00:00:00Z');
    for (let day = new Date(start); day <= new Date(); day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0, 10);
      growth.push({ date, users: users.filter(user => (user.created_at || '').slice(0, 10) === date).length });
    }
    res.json({
      generatedAt: new Date().toISOString(), launchDate,
      totals: { users: users.length, usersSinceLaunch: users.length, usersLast7Days, usersLast30Days, posts: posts.length, postsSinceLaunch: posts.length, postsLast7Days, postsLast30Days, verifiedUsers: users.filter(user => user.verified).length, staff: staffCount },
      postsByType, topSkills: top(skillCounts), topInterests: top(interestCounts), topFields: top(fieldCounts),
      recentUsers, recentPosts, growth
    });
  } catch (e) {
    console.error('Staff overview error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Staff collection persistence used by the redesigned portal ──
router.post('/data/:collection', requireAuth, requireStaff, async (req, res) => {
  try {
    const permissions = { team_goals: 'assign_goals', user_goals: 'assign_goals', tasks: 'assign_tasks', calendar_events: 'modify_calendar', resources: 'manage_staff' };
    const permission = permissions[req.params.collection];
    if (!permission || !(req.user.role === 'admin' || req.user.encrypted_fields?.username === STAFF_ADMIN_USERNAME || (req.user.staff_access && (await store.read(STAFF_FILE)).staff_members?.[req.user.id]?.permissions || []).includes(permission))) return res.status(403).json({ error: 'Permission required' });
    const item = { id: req.body?.id || `${req.params.collection}_${Date.now()}`, ...req.body, created_at: req.body?.created_at || new Date().toISOString() };
    await store.atomicUpdate(STAFF_FILE, data => {
      if (req.params.collection === 'team_goals') { data.team_goals ||= {}; const { id, ...value } = item; data.team_goals[id] = value; }
      else if (req.params.collection === 'user_goals') { data.user_goals ||= {}; const userId = item.user_id || req.user.id; data.user_goals[userId] ||= {}; const { id, user_id, ...value } = item; data.user_goals[userId][id] = value; }
      else { data[req.params.collection] ||= []; if (!Array.isArray(data[req.params.collection])) data[req.params.collection] = Object.entries(data[req.params.collection]).map(([id, value]) => ({ id, ...value })); data[req.params.collection].push(item); }
      return data;
    });
    res.status(201).json(item);
  } catch (e) { console.error('Staff collection create error:', e); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/data/:collection/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    const staff = await store.read(STAFF_FILE);
    const collection = req.params.collection;
    const permission = { team_goals: 'assign_goals', user_goals: 'assign_goals', tasks: 'assign_tasks', calendar_events: 'modify_calendar', resources: 'manage_staff' }[collection];
    if (!permission || !(req.user.role === 'admin' || req.user.encrypted_fields?.username === STAFF_ADMIN_USERNAME || (staff.staff_members?.[req.user.id]?.permissions || []).includes(permission))) return res.status(403).json({ error: 'Permission required' });
    let found;
    await store.atomicUpdate(STAFF_FILE, data => {
      if (collection === 'team_goals' || collection === 'user_goals') {
        const buckets = collection === 'team_goals' ? data.team_goals || {} : data.user_goals || {};
        for (const [owner, values] of Object.entries(collection === 'team_goals' ? { company: buckets } : buckets)) {
          if (collection === 'team_goals') { if (values[req.params.id]) { values[req.params.id] = { ...values[req.params.id], ...req.body }; found = { id: req.params.id, ...values[req.params.id] }; } }
          else if (values[req.params.id]) { values[req.params.id] = { ...values[req.params.id], ...req.body }; found = { id: req.params.id, ...values[req.params.id] }; }
        }
      } else {
        const items = Array.isArray(data[collection]) ? data[collection] : [];
        const index = items.findIndex(item => item.id === req.params.id);
        if (index >= 0) { items[index] = { ...items[index], ...req.body }; found = items[index]; data[collection] = items; }
      }
      return data;
    });
    if (!found) return res.status(404).json({ error: 'Staff item not found' });
    res.json(found);
  } catch (e) { console.error('Staff collection update error:', e); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/data/:collection/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    const staff = await store.read(STAFF_FILE);
    const collection = req.params.collection;
    const permission = { team_goals: 'assign_goals', user_goals: 'assign_goals', tasks: 'assign_tasks', calendar_events: 'modify_calendar', resources: 'manage_staff' }[collection];
    if (!permission || !(req.user.role === 'admin' || req.user.encrypted_fields?.username === STAFF_ADMIN_USERNAME || (staff.staff_members?.[req.user.id]?.permissions || []).includes(permission))) return res.status(403).json({ error: 'Permission required' });
    let removed = false;
    await store.atomicUpdate(STAFF_FILE, data => {
      if (collection === 'team_goals') { if (data.team_goals?.[req.params.id]) { delete data.team_goals[req.params.id]; removed = true; } }
      else if (collection === 'user_goals') Object.values(data.user_goals || {}).forEach(goals => { if (goals[req.params.id]) { delete goals[req.params.id]; removed = true; } });
      else if (Array.isArray(data[collection])) { const before = data[collection].length; data[collection] = data[collection].filter(item => item.id !== req.params.id); removed = data[collection].length !== before; }
      return data;
    });
    if (!removed) return res.status(404).json({ error: 'Staff item not found' });
    res.json({ ok: true });
  } catch (e) { console.error('Staff collection delete error:', e); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/staff/data-size ──────────────────────────────────
// Returns size of data folder in GB (anisohaney only)
// Uses store.DATA_DIR which resolves to /data/ (or /larpable_data/ as fallback),
// parallel to /app/ regardless of deployment path
router.get('/data-size', requireAuth, requireStaffAdmin, async (req, res) => {
  try {
    const dataDir = store.DATA_DIR;
    
    function getDirSize(dir) {
      let total = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          total += getDirSize(fullPath);
        } else {
          total += fs.statSync(fullPath).size;
        }
      }
      return total;
    }
    
    const sizeBytes = getDirSize(dataDir);
    const sizeGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(4);
    
    res.json({ sizeGB: parseFloat(sizeGB), path: dataDir });
  } catch (e) {
    console.error('Get data size error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Middleware: require specific staff permission ─────────────
function requirePermission(permission) {
  return async (req, res, next) => {
    if (req.user.role === 'admin') return next();
    const username = req.user.encrypted_fields?.username || '';
    if (username === STAFF_ADMIN_USERNAME) return next();
    try {
      const staffData = await store.read(STAFF_FILE);
      const member = staffData.staff_members?.[req.user.id];
      if (member && (member.permissions || []).includes(permission)) return next();
    } catch (e) {
      console.error('Permission check error:', e);
    }
    return res.status(403).json({ error: 'Permission required' });
  };
}

// ── Work Tab: Taxonomy (skills_control) ─────────────────────
const MATCH_DIR = path.join(__dirname, '..', '..', 'backend', 'matching');

function readMatchFile(name) {
  try { return JSON.parse(fs.readFileSync(path.join(MATCH_DIR, name), 'utf8')); }
  catch { return {}; }
}

async function writeMatchFile(name, data) {
  const tmp = path.join(MATCH_DIR, name + '.tmp.' + process.pid);
  const dest = path.join(MATCH_DIR, name);
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.promises.rename(tmp, dest);
}

router.get('/work/taxonomy', requireAuth, requireStaff, requirePermission('skills_control'), async (req, res) => {
  try {
    const taxonomy = readMatchFile('taxonomy.json');
    const skillSynonyms = readMatchFile('skill_synonyms.json');
    const relationSynonyms = readMatchFile('taxonomy_synonyms.json');
    res.json({
      skills: taxonomy.skills || [],
      interests: taxonomy.interests || [],
      fields: taxonomy.fields || [],
      skill_synonyms: skillSynonyms.synonyms || {},
      taxonomy_synonyms: relationSynonyms.synonyms || { interests: {}, fields: {} }
    });
  } catch (e) {
    console.error('Get taxonomy error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/work/taxonomy', requireAuth, requireStaff, requirePermission('skills_control'), async (req, res) => {
  try {
    const kind = req.body?.kind;
    const label = String(req.body?.label || '').trim();
    const allowed = ['skill', 'interest', 'field'];
    if (!allowed.includes(kind)) return res.status(400).json({ error: 'kind must be skill, interest or field' });
    if (!label) return res.status(400).json({ error: 'A word is required' });

    const listKey = `${kind}s`;
    const taxonomy = readMatchFile('taxonomy.json');
    const list = taxonomy[listKey] || [];
    if (list.some(x => String(x).toLowerCase() === label.toLowerCase())) {
      return res.status(409).json({ error: `${label} already exists as a ${kind}` });
    }

    const sentences = (req.body?.sentences || []).map(String).map(s => s.trim()).filter(Boolean);
    const synonyms = (req.body?.synonyms || []).map(String).map(s => s.trim()).filter(Boolean);
    if (!sentences.length && !synonyms.length) {
      return res.status(400).json({ error: 'Add at least one definition sentence or synonym' });
    }

    // Generate vector via Python embed script
    const { spawnSync } = require('child_process');
    const script = path.join(MATCH_DIR, 'embed_terms.py');
    const input = JSON.stringify([{ term: label, sentences, synonyms }]);
    const result = spawnSync('python3', [script], {
      input, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, timeout: 300000
    });
    if (result.status !== 0) {
      console.error('Embedding failed:', result.stderr || result.error || 'unknown');
      return res.status(500).json({ error: 'Vector generation failed' });
    }
    let vector;
    try { vector = JSON.parse(result.stdout)[label]; } catch { vector = null; }
    if (!vector) return res.status(500).json({ error: 'Vector generation failed' });

    const vectors = readMatchFile('vectors.json');
    if (!vectors.vectors) vectors.vectors = {};
    if (!vectors.vectors[kind]) vectors.vectors[kind] = {};
    vectors.vectors[kind][label] = vector;

    const skillSynonyms = readMatchFile('skill_synonyms.json');
    const relationSynonyms = readMatchFile('taxonomy_synonyms.json');
    if (kind === 'skill') {
      if (!skillSynonyms.synonyms) skillSynonyms.synonyms = {};
      skillSynonyms.synonyms[label] = synonyms;
    } else {
      if (!relationSynonyms.synonyms) relationSynonyms.synonyms = {};
      if (!relationSynonyms.synonyms[`${kind}s`]) relationSynonyms.synonyms[`${kind}s`] = {};
      relationSynonyms.synonyms[`${kind}s`][label] = synonyms;
    }

    list.push(label);
    taxonomy[listKey] = list;
    await writeMatchFile('taxonomy.json', taxonomy);
    await writeMatchFile('vectors.json', vectors);
    if (kind === 'skill') await writeMatchFile('skill_synonyms.json', skillSynonyms);
    else await writeMatchFile('taxonomy_synonyms.json', relationSynonyms);

    res.status(201).json({ kind, label, sentences: sentences.length, synonyms, vector_generated: true });
  } catch (e) {
    console.error('Add taxonomy error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/work/taxonomy/:kind/:label', requireAuth, requireStaff, requirePermission('skills_control'), async (req, res) => {
  try {
    const kind = req.params.kind;
    const allowed = ['skill', 'interest', 'field'];
    if (!allowed.includes(kind)) return res.status(400).json({ error: 'kind must be skill, interest or field' });
    const label = String(req.params.label || '');
    const listKey = `${kind}s`;
    const taxonomy = readMatchFile('taxonomy.json');
    const list = taxonomy[listKey] || [];
    const index = list.findIndex(x => String(x).toLowerCase() === label.toLowerCase());
    if (index === -1) return res.status(404).json({ error: `${label} not found as a ${kind}` });
    const actual = list[index];
    list.splice(index, 1);

    const vectors = readMatchFile('vectors.json');
    if (vectors.vectors?.[kind]) delete vectors.vectors[kind][actual];

    const skillSynonyms = readMatchFile('skill_synonyms.json');
    const relationSynonyms = readMatchFile('taxonomy_synonyms.json');
    if (kind === 'skill') delete skillSynonyms.synonyms?.[actual];
    else delete relationSynonyms.synonyms?.[`${kind}s`]?.[actual];

    await writeMatchFile('taxonomy.json', taxonomy);
    await writeMatchFile('vectors.json', vectors);
    if (kind === 'skill') await writeMatchFile('skill_synonyms.json', skillSynonyms);
    else await writeMatchFile('taxonomy_synonyms.json', relationSynonyms);

    res.json({ success: true, removed: actual });
  } catch (e) {
    console.error('Delete taxonomy error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Work Tab: Users (user_control) ──────────────────────────

router.get('/work/users', requireAuth, requireStaff, requirePermission('user_control'), async (req, res) => {
  try {
    const users = await store.read('users.json');
    const staff = await store.read(STAFF_FILE);
    const list = Object.entries(users).map(([id, raw]) => {
      const decrypted = crypto.decryptObject(raw);
      const ef = decrypted.encrypted_fields || {};
      return {
        id,
        username: ef.username || '',
        first_name: ef.first_name || ef.firstName || '',
        last_name: ef.last_name || ef.lastName || '',
        email: ef.email || '',
        type: decrypted.type || 'student',
        created_at: decrypted.created_at || raw.created_at || null,
        age: ef.age || '',
        grade: ef.grade || '',
        location: ef.location || '',
        city: ef.city || '',
        state: ef.state || '',
        country: ef.country || '',
        skills: ef.skills || [],
        interests: ef.interests || [],
        staffAccess: !!staff.staff_members?.[id]
      };
    });
    res.json({ users: list });
  } catch (e) {
    console.error('Get work users error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/work/users/:id', requireAuth, requireStaff, requirePermission('user_control'), async (req, res) => {
  try {
    const userId = req.params.id;
    const users = await store.read('users.json');
    if (!users[userId]) return res.status(404).json({ error: 'User not found' });
    if (userId === req.user.id) return res.status(400).json({ error: 'You cannot remove your own account' });

    const staff = await store.read(STAFF_FILE);
    const member = staff.staff_members?.[userId];
    const isStaffAdminUser = member && !member.added_by; // original admin
    if (isStaffAdminUser) return res.status(400).json({ error: 'The platform admin cannot be removed' });

    delete users[userId];
    await store.atomicUpdate('users.json', () => users);

    // Drop sessions
    const sessions = await store.read('sessions.json');
    const sessionHashes = Object.keys(sessions).filter(h => sessions[h].user_id === userId);
    if (sessionHashes.length) {
      await store.atomicUpdate('sessions.json', (s) => {
        sessionHashes.forEach(h => delete s[h]);
        return s;
      });
    }

    // Drop drafts
    const drafts = await store.read('drafts.json');
    const draftIds = Object.keys(drafts).filter(id => drafts[id].user_id === userId);
    if (draftIds.length) {
      await store.atomicUpdate('drafts.json', (d) => {
        draftIds.forEach(id => delete d[id]);
        return d;
      });
    }

    // Drop opportunities
    const opportunities = await store.read('opportunities.json');
    const oppIds = Object.keys(opportunities).filter(id => {
      try { return crypto.decryptObject(opportunities[id]).created_by === userId; } catch { return false; }
    });
    if (oppIds.length) {
      await store.atomicUpdate('opportunities.json', (o) => {
        oppIds.forEach(id => delete o[id]);
        return o;
      });
    }

    // Revoke staff access
    if (member) {
      await store.atomicUpdate(STAFF_FILE, (s) => {
        delete s.staff_members?.[userId];
        return s;
      });
    }

    res.json({ success: true, removed: userId, sessions: sessionHashes.length, drafts: draftIds.length, opportunities: oppIds.length, staff: !!member });
  } catch (e) {
    console.error('Delete work user error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
