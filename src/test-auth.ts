import http from 'http';
import app from '../src/app';
import { prisma } from '../src/config/db';

async function runTests() {
  console.log('=== Starting Auth Verification Suite ===\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4001, () => resolve()));
  const baseUrl = 'http://localhost:4001';

  let cookies: string[] = [];

  const request = async (
    path: string,
    method = 'GET',
    body?: any,
    headers: Record<string, string> = {}
  ) => {
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (cookies.length > 0) {
      reqHeaders['Cookie'] = cookies.join('; ');
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      cookies = [setCookie.split(';')[0]];
    }

    const data: any = await res.json().catch(() => ({}));
    return { status: res.status, data, headers: res.headers };
  };

  try {
    // 1. Health check
    console.log('1. Testing GET /health ...');
    const health = await request('/health');
    console.log(`   Status: ${health.status}, Response:`, health.data);
    if (health.status !== 200) throw new Error('Health check failed');

    // 2. Login with incorrect password
    console.log('\n2. Testing POST /api/auth/login with incorrect credentials ...');
    const badLogin = await request('/api/auth/login', 'POST', {
      email: 'admin@velozity.com',
      password: 'WrongPassword!',
    });
    console.log(`   Status: ${badLogin.status}, Response:`, badLogin.data);
    if (badLogin.status !== 401 || badLogin.data.error.code !== 'INVALID_CREDENTIALS') {
      throw new Error('Failed bad login test');
    }

    // 3. Login as Admin
    console.log('\n3. Testing POST /api/auth/login as Admin ...');
    const adminLogin = await request('/api/auth/login', 'POST', {
      email: 'admin@velozity.com',
      password: 'Password123!',
    });
    console.log(`   Status: ${adminLogin.status}`);
    console.log(`   User:`, adminLogin.data.user);
    console.log(`   Has Access Token:`, !!adminLogin.data.accessToken);
    console.log(`   Set-Cookie Header:`, adminLogin.headers.get('set-cookie'));
    if (adminLogin.status !== 200 || !adminLogin.data.accessToken) {
      throw new Error('Admin login failed');
    }
    const adminToken = adminLogin.data.accessToken;

    // 4. Test POST /api/auth/refresh with cookie
    console.log('\n4. Testing POST /api/auth/refresh with httpOnly cookie ...');
    const refreshRes = await request('/api/auth/refresh', 'POST');
    console.log(`   Status: ${refreshRes.status}`);
    console.log(`   Has new Access Token:`, !!refreshRes.data.accessToken);
    if (refreshRes.status !== 200 || !refreshRes.data.accessToken) {
      throw new Error('Refresh failed');
    }

    // 5. Test POST /api/auth/register with Admin token (Valid registration)
    console.log('\n5. Testing POST /api/auth/register as Admin ...');
    const newEmail = `test.user.${Date.now()}@velozity.com`;
    const regRes = await request(
      '/api/auth/register',
      'POST',
      {
        name: 'Automated Test User',
        email: newEmail,
        password: 'Password123!',
        role: 'DEVELOPER',
      },
      { Authorization: `Bearer ${adminToken}` }
    );
    console.log(`   Status: ${regRes.status}`);
    console.log(`   Registered User:`, regRes.data.user);
    if (regRes.status !== 201 || regRes.data.user.email !== newEmail) {
      throw new Error('Register user as Admin failed');
    }

    // 6. Test duplicate registration (Conflict)
    console.log('\n6. Testing POST /api/auth/register duplicate email ...');
    const dupRes = await request(
      '/api/auth/register',
      'POST',
      {
        name: 'Automated Test User',
        email: newEmail,
        password: 'Password123!',
        role: 'DEVELOPER',
      },
      { Authorization: `Bearer ${adminToken}` }
    );
    console.log(`   Status: ${dupRes.status}, Error:`, dupRes.data.error);
    if (dupRes.status !== 409 || dupRes.data.error.code !== 'USER_EXISTS') {
      throw new Error('Duplicate email test failed');
    }

    // 7. Login as Developer (dev1@velozity.com) and verify requireRole restricts access
    console.log('\n7. Testing requireRole restriction: Developer attempting to register ...');
    const devLogin = await request('/api/auth/login', 'POST', {
      email: 'dev1@velozity.com',
      password: 'Password123!',
    });
    const devToken = devLogin.data.accessToken;

    const devRegRes = await request(
      '/api/auth/register',
      'POST',
      {
        name: 'Unauthorized User',
        email: 'unauth@velozity.com',
        password: 'Password123!',
        role: 'DEVELOPER',
      },
      { Authorization: `Bearer ${devToken}` }
    );
    console.log(`   Status: ${devRegRes.status}, Error:`, devRegRes.data.error);
    if (devRegRes.status !== 403 || devRegRes.data.error.code !== 'FORBIDDEN') {
      throw new Error('Developer restriction check failed');
    }

    // 8. Test Validation Error
    console.log('\n8. Testing Validation Error on register ...');
    const valRes = await request(
      '/api/auth/register',
      'POST',
      {
        name: '',
        email: 'invalid-email',
        password: '123',
        role: 'SUPERADMIN',
      },
      { Authorization: `Bearer ${adminToken}` }
    );
    console.log(`   Status: ${valRes.status}, Error:`, valRes.data.error);
    if (valRes.status !== 400 || valRes.data.error.code !== 'VALIDATION_ERROR') {
      throw new Error('Validation error test failed');
    }

    // 9. Test Logout
    console.log('\n9. Testing POST /api/auth/logout ...');
    const logoutRes = await request(
      '/api/auth/logout',
      'POST',
      undefined,
      { Authorization: `Bearer ${adminToken}` }
    );
    console.log(`   Status: ${logoutRes.status}, Message:`, logoutRes.data);
    console.log(`   Set-Cookie on logout:`, logoutRes.headers.get('set-cookie'));
    if (logoutRes.status !== 200) {
      throw new Error('Logout failed');
    }

    // Clean up test user
    await prisma.user.delete({ where: { email: newEmail } }).catch(() => {});

    console.log('\n=== ALL AUTH TESTS PASSED SUCCESSFULLY! ===');
  } catch (error) {
    console.error('\nTest suite failed:', error);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTests();
