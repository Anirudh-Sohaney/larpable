/**
 * LARPABLE — Comprehensive Vulnerability & Stress Test (v2)
 * 
 * Uses HTTP requests via Node.js http module for reliable cookie handling.
 */

const http = require('http');

const BASE_HOST = 'localhost';
const BASE_PORT = 9194;

let passed = 0;
let failed = 0;
let total = 0;
const failures = [];

function test(name, fn) {
  total++;
  return fn().then(result => {
    if (result === false) {
      failed++;
      failures.push(`FAIL: ${name}`);
      console.log(`  ❌ ${name}`);
    } else {
      passed++;
      console.log(`  ✅ ${name}`);
    }
  }).catch(e => {
    failed++;
    failures.push(`CRASH: ${name} → ${e.message}`);
    console.log(`  💥 CRASH: ${name} → ${e.message}`);
  });
}

function httpReq(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (body) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    if (cookie) headers['Cookie'] = cookie;

    const req = http.request({ hostname: BASE_HOST, port: BASE_PORT, path, method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        // Extract set-cookie
        const setCookie = res.headers['set-cookie'] || [];
        let newCookie = cookie;
        for (const sc of setCookie) {
          const m = sc.match(/(larpable_session=[^;]+)/);
          if (m) newCookie = m[1];
        }
        resolve({ status: res.statusCode, json, text: data, cookie: newCookie });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Helper: create user and return their cookie
async function createUser(username) {
  return httpReq('POST', '/api/auth/signup', {
    username, password: 'Test123456', type: 'student',
    firstName: 'Test', lastName: 'User',
    age: '17', location: 'Austin, TX, United States',
    interests: ['Artificial Intelligence', 'Web Development', 'Entrepreneurship'],
    skills: ['Python', 'JavaScript', 'React']
  });
}

// Helper: login and return cookie
async function login(username, cookie) {
  return httpReq('POST', '/api/auth/login', {
    username, password: 'Test123456'
  }, cookie);
}

async function run() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  LARPABLE — Vulnerability & Stress Test v2');
  console.log('═══════════════════════════════════════════\n');

  // ━━━ SECTION 1: Crash Vectors ━━━
  console.log('── 1. CRASH VECTORS ──');

  await test('Empty POST body to signup', async () => {
    const r = await httpReq('POST', '/api/auth/signup', {});
    return r.status === 400;
  });

  await test('Null body to signup', async () => {
    const r = await httpReq('POST', '/api/auth/signup', null);
    // With null body, express.json() should return 400
    return r.status === 400 || r.status === 415;
  });

  await test('Malformed JSON body', async () => {
    // Send raw broken JSON via http
    return new Promise((resolve) => {
      const req = http.request({ hostname: BASE_HOST, port: BASE_PORT, path: '/api/auth/signup', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(res.statusCode === 400));
      });
      req.write('{broken json!!!');
      req.end();
    });
  });

  await test('Empty JSON body to login', async () => {
    const r = await httpReq('POST', '/api/auth/login', {});
    return r.status === 400;
  });

  await test('String body to signup', async () => {
    return new Promise((resolve) => {
      const req = http.request({ hostname: BASE_HOST, port: BASE_PORT, path: '/api/auth/signup', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(res.statusCode === 400));
      });
      req.write('"just a string"');
      req.end();
    });
  });

  await test('Array body to signup', async () => {
    const r = await httpReq('POST', '/api/auth/signup', [1, 2, 3]);
    return r.status === 400;
  });

  await test('Extremely long username (10000 chars)', async () => {
    const r = await httpReq('POST', '/api/auth/signup', {
      username: 'a'.repeat(10000), password: 'Test123456', type: 'student'
    });
    return r.status === 400;
  });

  await test('Extremely long password (100000 chars)', async () => {
    const r = await httpReq('POST', '/api/auth/signup', {
      username: 'longpwdtest2', password: 'x'.repeat(100000), type: 'student'
    });
    return r.status < 500;
  });

  await test('SQL injection in username', async () => {
    const r = await httpReq('POST', '/api/auth/login', {
      username: "'; DROP TABLE users; --", password: 'anything'
    });
    return r.status === 401;
  });

  await test('SQL injection in password', async () => {
    const r = await httpReq('POST', '/api/auth/login', {
      username: 'testuser', password: "' OR 1=1 --"
    });
    return r.status === 401;
  });

  await test('XSS in signup fields is sanitized', async () => {
    const r = await httpReq('POST', '/api/auth/signup', {
      username: 'xsstest_v2', password: 'Test123456', type: 'student',
      firstName: '<script>alert("xss")</script>',
      lastName: '"><img src=x onerror=alert(1)>',
      interests: ['AI', 'Web Dev', 'Startups'],
      skills: ['Python', 'JS', 'React']
    });
    if (r.status !== 200 && r.status !== 201) return true;
    // Check stored data
    const me = await httpReq('GET', '/api/auth/me', null, r.cookie);
    const name = me.json?.user?.displayName || '';
    return !name.includes('<script>') && !name.includes('<img');
  });

  await test('GET nonexistent opportunity returns 404', async () => {
    const r = await httpReq('GET', '/api/opportunities/nonexistent_id_12345');
    return r.status === 404;
  });

  await test('POST opportunity without auth returns 401', async () => {
    const r = await httpReq('POST', '/api/opportunities', { type: 'project', title: 'Test' });
    return r.status === 401;
  });

  await test('POST opportunity with invalid type returns 400', async () => {
    const { cookie } = await login('xsstest_v2');
    const r = await httpReq('POST', '/api/opportunities', { type: 'invalid', title: 'X' }, cookie);
    return r.status === 400;
  });

  await test('POST opportunity with no title returns 400', async () => {
    const { cookie } = await login('xsstest_v2');
    const r = await httpReq('POST', '/api/opportunities', { type: 'project' }, cookie);
    return r.status === 400;
  });

  await test('PATCH nonexistent opportunity returns 404', async () => {
    const { cookie } = await login('xsstest_v2');
    const r = await httpReq('PATCH', '/api/opportunities/fake_id', { title: 'X' }, cookie);
    return r.status === 404;
  });

  await test('DELETE nonexistent opportunity returns 404', async () => {
    const { cookie } = await login('xsstest_v2');
    const r = await httpReq('DELETE', '/api/opportunities/fake_id', null, cookie);
    return r.status === 404;
  });

  await test('GET similarity without params returns 400', async () => {
    const r = await httpReq('GET', '/api/match/similarity');
    return r.status === 400;
  });

  await test('POST rank with empty body returns 400', async () => {
    const { cookie } = await login('xsstest_v2');
    const r = await httpReq('POST', '/api/match/rank', {}, cookie);
    return r.status === 400;
  });

  await test('POST rank with >50 opportunities returns 400', async () => {
    const { cookie } = await login('xsstest_v2');
    const r = await httpReq('POST', '/api/match/rank', {
      user: { skills: ['Python'] },
      opportunities: Array(51).fill(null).map((_, i) => ({ id: `${i}`, skills: ['Python'], industry: 'Tech' }))
    }, cookie);
    return r.status === 400;
  });

  await test('Unicode in signup fields works', async () => {
    const r = await httpReq('POST', '/api/auth/signup', {
      username: 'unicode_v2', password: 'Test123456', type: 'student',
      firstName: 'Ünïcödé', lastName: 'テスト',
      interests: ['AI', 'Web Dev', 'Startups'],
      skills: ['Python', 'JS', 'React']
    });
    return r.status < 500;
  });

  // ━━━ SECTION 2: Auth Security ━━━
  console.log('\n── 2. AUTH SECURITY ──');

  await test('Forged cookie rejected', async () => {
    const r = await httpReq('GET', '/api/auth/me', null, 'larpable_session=fake_token_12345');
    return r.status === 401;
  });

  await test('Empty cookie rejected', async () => {
    const r = await httpReq('GET', '/api/auth/me', null, '');
    return r.status === 401;
  });

  await test('No cookie on protected route returns 401', async () => {
    const r = await httpReq('GET', '/api/auth/me');
    return r.status === 401;
  });

  await test('Wrong password rejected', async () => {
    await httpReq('POST', '/api/auth/signup', {
      username: 'wrongpwd_v2', password: 'Test123456', type: 'student',
      firstName: 'W', lastName: 'P',
      interests: ['AI', 'Web Dev', 'Startups'], skills: ['Python', 'JS', 'React']
    });
    const r = await httpReq('POST', '/api/auth/login', {
      username: 'wrongpwd_v2', password: 'WrongPassword123'
    });
    return r.status === 401;
  });

  await test('Duplicate signup rejected (409)', async () => {
    await httpReq('POST', '/api/auth/signup', {
      username: 'dupe_v2', password: 'Test123456', type: 'student',
      firstName: 'D', lastName: 'U',
      interests: ['AI', 'Web Dev', 'Startups'], skills: ['Python', 'JS', 'React']
    });
    const r = await httpReq('POST', '/api/auth/signup', {
      username: 'dupe_v2', password: 'Test123456', type: 'student',
      firstName: 'D', lastName: 'U',
      interests: ['AI', 'Web Dev', 'Startups'], skills: ['Python', 'JS', 'React']
    });
    return r.status === 409;
  });

  await test('Logout invalidates session', async () => {
    await httpReq('POST', '/api/auth/signup', {
      username: 'logout_v2', password: 'Test123456', type: 'student',
      firstName: 'L', lastName: 'O',
      interests: ['AI', 'Web Dev', 'Startups'], skills: ['Python', 'JS', 'React']
    });
    const { cookie } = await login('logout_v2');
    await httpReq('POST', '/api/auth/logout', null, cookie);
    const r = await httpReq('GET', '/api/auth/me', null, cookie);
    return r.status === 401;
  });

  await test('Logout with no cookie is safe (no crash)', async () => {
    const r = await httpReq('POST', '/api/auth/logout');
    return r.status < 500;
  });

  await test('Auth/me returns no sensitive fields', async () => {
    const { cookie } = await login('xsstest_v2');
    const r = await httpReq('GET', '/api/auth/me', null, cookie);
    const user = r.json?.user || {};
    return !user.password_hash && !user.password_salt && !user.username_hash;
  });

  // ━━━ SECTION 3: IDOR ━━━
  console.log('\n── 3. IDOR / Authorization ──');

  await test('User A cannot edit User B opportunity (403)', async () => {
    // Create users A and B
    const signupA = await httpReq('POST', '/api/auth/signup', {
      username: 'idor_a_v2', password: 'Test123456', type: 'student',
      firstName: 'A', lastName: 'U',
      interests: ['AI', 'Web Dev', 'Startups'], skills: ['Python', 'JS', 'React']
    });
    const loginA = await httpReq('POST', '/api/auth/login', {
      username: 'idor_a_v2', password: 'Test123456'
    });
    const signupB = await httpReq('POST', '/api/auth/signup', {
      username: 'idor_b_v2', password: 'Test123456', type: 'student',
      firstName: 'B', lastName: 'U',
      interests: ['AI', 'Web Dev', 'Startups'], skills: ['Python', 'JS', 'React']
    });
    const loginB = await httpReq('POST', '/api/auth/login', {
      username: 'idor_b_v2', password: 'Test123456'
    });

    // A creates an opportunity
    const create = await httpReq('POST', '/api/opportunities', {
      type: 'project', title: 'A Project', description: 'test',
      looking_for: 'dev', skills: ['Python'], contact: 'a@test.com', remote: true
    }, loginA.cookie);
    const oppId = create.json?.id;
    if (!oppId) return false;

    // B tries to edit
    const r = await httpReq('PATCH', `/api/opportunities/${oppId}`, { title: 'HACKED' }, loginB.cookie);
    return r.status === 403;
  });

  await test('User A cannot delete User B opportunity (403)', async () => {
    const loginA = await httpReq('POST', '/api/auth/login', {
      username: 'idor_a_v2', password: 'Test123456'
    });
    const loginB = await httpReq('POST', '/api/auth/login', {
      username: 'idor_b_v2', password: 'Test123456'
    });

    const create = await httpReq('POST', '/api/opportunities', {
      type: 'project', title: 'Delete Me', description: 'test',
      looking_for: 'dev', skills: ['Python'], contact: 'a@test.com', remote: true
    }, loginA.cookie);
    const oppId = create.json?.id;

    const r = await httpReq('DELETE', `/api/opportunities/${oppId}`, null, loginB.cookie);
    return r.status === 403;
  });

  await test('PATCH cannot inject created_by', async () => {
    const loginA = await httpReq('POST', '/api/auth/login', {
      username: 'idor_a_v2', password: 'Test123456'
    });
    const create = await httpReq('POST', '/api/opportunities', {
      type: 'project', title: 'Inject Test', description: 'test',
      looking_for: 'dev', skills: ['Python'], contact: 'a@test.com', remote: true
    }, loginA.cookie);
    const oppId = create.json?.id;

    await httpReq('PATCH', `/api/opportunities/${oppId}`, { created_by: 'hacked_user' }, loginA.cookie);

    const get = await httpReq('GET', `/api/opportunities/${oppId}`);
    const r = get.json;
    // created_by should NOT be 'hacked_user'
    return r && r.created_by !== 'hacked_user';
  });

  // ━━━ SECTION 4: Path Traversal ━━━
  console.log('\n── 4. PATH TRAVERSAL ──');

  await test('Path traversal in opportunity ID', async () => {
    const r = await httpReq('GET', '/api/opportunities/../../etc/passwd');
    return r.status === 404 || r.status === 400;
  });

  await test('Null byte in opportunity ID', async () => {
    const r = await httpReq('GET', '/api/opportunities/test%00.jpg');
    return r.status < 500;
  });

  // ━━━ SECTION 5: Edge Cases ━━━
  console.log('\n── 5. EDGE CASES ──');

  await test('Empty skills array returns 400', async () => {
    const r = await httpReq('POST', '/api/auth/signup', {
      username: 'empskill_v2', password: 'Test123456', type: 'student',
      interests: ['AI', 'Web Dev', 'Startups'], skills: []
    });
    return r.status === 400;
  });

  await test('Null values in signup returns 400', async () => {
    const r = await httpReq('POST', '/api/auth/signup', {
      username: null, password: null, type: null
    });
    return r.status === 400;
  });

  await test('Extremely large location string does not crash', async () => {
    const r = await httpReq('POST', '/api/auth/signup', {
      username: 'bigloctest_v2', password: 'Test123456', type: 'student',
      location: 'A'.repeat(10000),
      interests: ['AI', 'Web Dev', 'Startups'], skills: ['Python', 'JS', 'React']
    });
    return r.status < 500;
  });

  await test('PATCH with empty object succeeds (no-op)', async () => {
    const { cookie } = await login('idor_a_v2');
    const create = await httpReq('POST', '/api/opportunities', {
      type: 'project', title: 'Patch Empty', description: 'test',
      looking_for: 'dev', skills: ['Python'], contact: 'x@x.com', remote: true
    }, cookie);
    const oppId = create.json?.id;
    const r = await httpReq('PATCH', `/api/opportunities/${oppId}`, {}, cookie);
    return r.status === 200;
  });

  await test('Concurrent signups with different usernames', async () => {
    const results = await Promise.all([
      httpReq('POST', '/api/auth/signup', {
        username: 'simul_v2_1', password: 'Test123456', type: 'student',
        firstName: 'S', lastName: '1', interests: ['AI', 'Web Dev', 'Startups'], skills: ['Python', 'JS', 'React']
      }),
      httpReq('POST', '/api/auth/signup', {
        username: 'simul_v2_2', password: 'Test123456', type: 'student',
        firstName: 'S', lastName: '2', interests: ['AI', 'Web Dev', 'Startups'], skills: ['Python', 'JS', 'React']
      }),
      httpReq('POST', '/api/auth/signup', {
        username: 'simul_v2_3', password: 'Test123456', type: 'student',
        firstName: 'S', lastName: '3', interests: ['AI', 'Web Dev', 'Startups'], skills: ['Python', 'JS', 'React']
      }),
    ]);
    return results.every(r => r.status < 500);
  });

  // ━━━ SECTION 6: Concurrent Writes ━━━
  console.log('\n── 6. CONCURRENT WRITE SAFETY ──');

  await test('10 simultaneous opportunity creations', async () => {
    const { cookie } = await login('idor_a_v2');
    const results = await Promise.all(Array(10).fill(null).map((_, i) =>
      httpReq('POST', '/api/opportunities', {
        type: 'project', title: `Concurrent ${i}`, description: 'test',
        looking_for: 'dev', skills: ['Python'], contact: 'x@x.com', remote: true
      }, cookie)
    ));
    const allOk = results.every(r => r.json?.id);
    const ids = results.map(r => r.json?.id);
    const unique = new Set(ids).size === ids.length;
    return allOk && unique;
  });

  await test('10 simultaneous deletes', async () => {
    const { cookie } = await login('idor_a_v2');
    const created = await Promise.all(Array(10).fill(null).map((_, i) =>
      httpReq('POST', '/api/opportunities', {
        type: 'project', title: `DelConcurrent ${i}`, description: 'test',
        looking_for: 'dev', skills: ['Python'], contact: 'x@x.com', remote: true
      }, cookie)
    ));
    const ids = created.map(r => r.json?.id).filter(Boolean);
    const results = await Promise.all(ids.map(id =>
      httpReq('DELETE', `/api/opportunities/${id}`, null, cookie)
    ));
    return results.every(r => r.json?.ok === true);
  });

  await test('Read during concurrent writes is safe', async () => {
    const { cookie } = await login('idor_a_v2');
    const ops = [];
    for (let i = 0; i < 5; i++) {
      ops.push(httpReq('POST', '/api/opportunities', {
        type: 'project', title: `RW ${i}`, description: 'test',
        looking_for: 'dev', skills: ['Python'], contact: 'x@x.com', remote: true
      }, cookie));
      ops.push(httpReq('GET', '/api/opportunities'));
    }
    const results = await Promise.all(ops);
    return results.every(r => r.status < 500);
  });

  // ━━━ SECTION 7: 40-User Stress Test ━━━
  console.log('\n── 7. 40-USER STRESS TEST ──');

  await test('Create 40 users simultaneously', async () => {
    const results = await Promise.all(Array(40).fill(null).map((_, i) =>
      httpReq('POST', '/api/auth/signup', {
        username: `stress_v2_${i}`, password: 'Test123456', type: 'student',
        firstName: 'Stress', lastName: `U${i}`,
        location: 'Austin, TX, United States',
        interests: ['Artificial Intelligence', 'Web Development', 'Entrepreneurship'],
        skills: ['Python', 'JavaScript', 'React']
      })
    ));
    return results.every(r => r.status < 500);
  });

  await test('40 users login simultaneously', async () => {
    const results = await Promise.all(Array(40).fill(null).map((_, i) =>
      httpReq('POST', '/api/auth/login', {
        username: `stress_v2_${i}`, password: 'Test123456'
      })
    ));
    return results.every(r => r.status < 500);
  });

  await test('40 users create opportunities simultaneously', async () => {
    // First login all
    const logins = await Promise.all(Array(40).fill(null).map((_, i) =>
      httpReq('POST', '/api/auth/login', {
        username: `stress_v2_${i}`, password: 'Test123456'
      })
    ));
    // Then create
    const results = await Promise.all(logins.map((login, i) =>
      httpReq('POST', '/api/opportunities', {
        type: 'project', title: `Stress Project ${i}`,
        description: 'Stress test', looking_for: 'Devs',
        skills: ['Python', 'JavaScript', 'React'],
        contact: `stress${i}@test.com`, remote: true
      }, login.cookie)
    ));
    return results.every(r => r.json?.id);
  });

  await test('40 users read feed simultaneously', async () => {
    const results = await Promise.all(Array(40).fill(null).map(() =>
      httpReq('GET', '/api/opportunities')
    ));
    return results.every(r => r.status === 200 && r.json?.opportunities);
  });

  await test('40 users on auth/me simultaneously', async () => {
    const logins = await Promise.all(Array(40).fill(null).map((_, i) =>
      httpReq('POST', '/api/auth/login', {
        username: `stress_v2_${i}`, password: 'Test123456'
      })
    ));
    const results = await Promise.all(logins.map(l =>
      httpReq('GET', '/api/auth/me', null, l.cookie)
    ));
    return results.every(r => r.status === 200 && r.json?.user?.displayName);
  });

  // ━━━ SECTION 8: Session Edge Cases ━━━
  console.log('\n── 8. SESSION EDGE CASES ──');

  await test('Multiple logins: only latest session valid (old invalidated)', async () => {
    const login1 = await httpReq('POST', '/api/auth/login', {
      username: 'stress_v2_0', password: 'Test123456'
    });
    const login2 = await httpReq('POST', '/api/auth/login', {
      username: 'stress_v2_0', password: 'Test123456'
    });
    // login1 session should be invalidated, login2 should work
    const r1 = await httpReq('GET', '/api/auth/me', null, login1.cookie);
    const r2 = await httpReq('GET', '/api/auth/me', null, login2.cookie);
    return r1.status === 401 && r2.status === 200;
  });

  await test('Tampered cookie value rejected', async () => {
    const r = await httpReq('GET', '/api/auth/me', null,
      'larpable_session=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    return r.status === 401;
  });

  // ━━━ SECTION 9: Matching Edge Cases ━━━
  console.log('\n── 9. MATCHING EDGE CASES ──');

  await test('Similarity with empty strings', async () => {
    const r = await httpReq('GET', '/api/match/similarity?a=&b=');
    return r.status < 500;
  });

  await test('Similarity with non-existent entities', async () => {
    const r = await httpReq('GET', '/api/match/similarity?a=XYZNONEXISTENT&b=ABCNONEXISTENT');
    return r.status === 200 && typeof r.json?.score === 'number';
  });

  await test('Rank with empty user skills', async () => {
    const { cookie } = await login('stress_v2_0');
    const r = await httpReq('POST', '/api/match/rank', {
      user: { skills: [], interests: [] },
      opportunities: [{ id: '1', skills: ['Python'], industry: 'Tech / SaaS' }]
    }, cookie);
    return r.status < 500;
  });

  // ━━━ SECTION 10: Server Stability ━━━
  console.log('\n── 10. SERVER STABILITY ──');

  await test('Server still responds after all tests', async () => {
    const r = await httpReq('GET', '/');
    return r.status === 200;
  });

  await test('Server log has no unhandled exceptions', async () => {
    const fs = require('fs');
    const log = fs.readFileSync('/tmp/server.log', 'utf8');
    return !log.includes('UNCAUGHT EXCEPTION');
  });

  // ━━━ RESULTS ━━━
  console.log('\n═══════════════════════════════════════════');
  console.log(`  RESULTS: ${passed}/${total} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════');
  
  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    failures.forEach(f => console.log(`    ${f}`));
  }
  
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('\n💥 FATAL:', e);
  process.exit(1);
});
