/**
 * Runs as the first plenary.html module so sessionStorage is populated
 * before main.js constructs the Supabase client and session store.
 */
import { adoptPlenarySession } from './plenaryHandoff.js';

adoptPlenarySession();
