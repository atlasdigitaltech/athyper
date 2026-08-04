import { Client } from 'pg';
const admin = new Client({connectionString: process.env.ADMIN_URL});
await admin.connect();
await admin.query('DROP DATABASE IF EXISTS athyper_neon_fv_finalv');
await admin.query('CREATE DATABASE athyper_neon_fv_finalv');
await admin.end();
console.log('created');
