// Operator-only, bounded rehearsal. Never imported by the application.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sourceSnapshot, sha } from './gc07-live-provenance.mjs';
import { concurrentPair, managedRaceSql } from './gc03-race-runner.mjs';
import { manifest, validate, check, literal, identity, description, guard, setupSql, raceSql, assertRace, readbackSql, assertCommitted, project, parentRun } from './gc08-contention-contract.mjs';

const parentDirectory = `test-results/gc08-live/${parentRun}`;
const canonical = x => JSON.stringify(x, (_,v) => v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v);
export async function hostedPost(url, key, token, body, send=fetch) {
    const response=await send(url,{method:'POST',redirect:'error',headers:{apikey:key,Authorization:`Bearer ${token||key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const data=await response.json();
    check(response.ok,`hosted auth/operator request failed (${response.status})`);
    return data;
}
export function historicalSql(m) {
    validate(m);
    return `SELECT clock_timestamp() AS observed_at,
(SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'[]')) FROM public.sessions s WHERE session_code NOT IN (${m.cases.map(c=>literal(c.code)).join(',')})) AS other_sessions,
(SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY version)::text,'[]')) FROM public.green_roster_approvals r) AS approvals;`;
}
export function cleanupSql(m) {
    validate(m);
    // Exact names/codes protect unrelated or protected sessions even after a partial failure.
    return `BEGIN; SET LOCAL statement_timeout='40s'; SET LOCAL lock_timeout='30s';
${identity(m.gm)}
DO $$ DECLARE s public.sessions%ROWTYPE; BEGIN
FOR s IN SELECT * FROM public.sessions WHERE session_code IN (${m.cases.map(c=>literal(c.code)).join(',')}) LOOP
IF s.is_protected OR NOT (${m.cases.map(c=>`(s.session_code=${literal(c.code)} AND s.name=${literal(c.name)})`).join(' OR ')})
OR s.metadata->>'description' IS DISTINCT FROM ${literal(description(m))} THEN RAISE EXCEPTION 'GC08 cleanup identity mismatch'; END IF;
IF s.status='active' THEN PERFORM public.archive_live_demo_session(s.id); END IF;
END LOOP; END $$; RESET ROLE;
SELECT 'PASS: owned synthetic sessions archived' AS result;
COMMIT;`;
}
async function configuration() {
    let local=''; try { local=await readFile('.env.local','utf8'); } catch(e) { if(e.code!=='ENOENT') throw e; }
    const env=name=>process.env[name]||local.match(new RegExp(`^\\s*${name}\\s*=\\s*['"]?([^\\s'"]+)`,'m'))?.[1];
    const config={token:env('SUPABASE_ACCESS_TOKEN')||env('SUPABASE_PERSONAL_TOKEN'), operator:env('GC08_OPERATOR_ACCESS_CODE')||env('OPERATOR_CODE'), key:env('VITE_SUPABASE_ANON_KEY'), url:env('VITE_SUPABASE_URL')};
    check(config.url?.replace(/\/$/,'')===`https://${project}.supabase.co` && config.key && config.operator && /^sbp_[\w-]+$/.test(config.token||''), 'confirmed target and secure local credentials required');
    return config;
}
export async function run() {
    const config=await configuration(), m=manifest(), secrets=[config.token,config.operator,config.key];
    const directory=resolve(parentDirectory,'contention',m.run); await mkdir(directory,{recursive:true});
    const report={version:1,startedAt:new Date().toISOString(),manifest:m,identityMode:'simulated JWT claims for users created by real hosted Auth; real operator grant; independent PostgreSQL backends',requests:[],races:[],passed:false,cleanup:{passed:false}};
    const safe=value=>{ let text=JSON.stringify(value,null,2); for(const secret of secrets) text=text.replaceAll(secret,'[REDACTED]'); return text; };
    let pending=Promise.resolve();
    const save=()=>{ const text=safe(report); pending=pending.then(()=>writeFile(resolve(directory,'results.json'),text+'\n')); return pending; };
    const sql=async(label,query,readOnly=false)=>{
        const entry={label,file:label+'.sql',sha256:sha(query),startedAt:new Date().toISOString(),readOnly}; report.requests.push(entry);
        await writeFile(resolve(directory,entry.file),query,{flag:'wx'}); await save();
        try {
            const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:readOnly}),signal:AbortSignal.timeout(45000)});
            entry.response={status:response.status,requestId:response.headers.get('sb-request-id')||response.headers.get('x-request-id'),data:await response.json()};
            return entry.response;
        } catch(error) { entry.error=error.message; throw error; }
        finally { entry.finishedAt=new Date().toISOString(); await save(); }
    };
    const rows=r=>{check(r?.status>=200&&r.status<300&&Array.isArray(r.data),'SQL transport/result failure (see retained response)');return r.data;};
    const api=(path,token,body)=>hostedPost(config.url.replace(/\/$/,'')+path,config.key,token,body);
    let initialHistory;
    try {
        report.source=await sourceSnapshot();
        const build=JSON.parse(await readFile(`${parentDirectory}/build-receipt.json`,'utf8'));
        // New verification scripts/tests/docs are expected; shipped code and migrations must still match.
        const runtimeFiles=Object.entries(build.source.files).filter(([p])=>/^(src\/|data\/|.*\.html$|package(?:-lock)?\.json$|vite\.config\.)/.test(p));
        check(runtimeFiles.every(([p,h])=>report.source.files[p]===h),'application/migration source changed since bound UI rehearsal');
        report.runtimeBinding={parentSourceDigest:build.source.digest,matchedFiles:runtimeFiles.length};
        const query=await readFile(`${parentDirectory}/database-preflight.sql`,'utf8');
        const installed=rows(await sql('installed-before',query,true))[0].gc08_preflight;
        const previous=JSON.parse(await readFile(`${parentDirectory}/database-final.json`,'utf8')).data[0].gc08_preflight;
        check(canonical(installed.functions)===canonical(previous.functions)&&canonical(installed.tables)===canonical(previous.tables),'installed definitions/ACLs drifted since source-bound UI verification');
        const dependencies=rows(await sql('locking-dependencies',`SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('green_require_open_session','configure_session_green_topology','lookup_joinable_session_by_code') ORDER BY 1;`,true));
        check(dependencies.length===3,'locking/lookup dependencies missing');
        for(const [name,file] of [['green_require_open_session','data/2026-09-19_green_regional_authorization.sql'],['configure_session_green_topology','data/2026-09-18_green_regional_storage.sql'],['lookup_joinable_session_by_code','data/2026-09-24_gc04a_shared_facilitator.sql']]) {
            const src=(await readFile(file,'utf8')).match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`))?.[1];
            const body=dependencies.find(f=>f.signature.startsWith(name+'('))?.definition.match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1];
            check(src&&body&&src.replaceAll('\r\n','\n').trim()===body.replaceAll('\r\n','\n').trim(),name+' installed body differs from latest local definition');
        }
        console.log('Installed definitions and locking dependencies verified. Authenticating isolated synthetic actors.');
        const tokens={};
        for(const role of ['gm','actor']) {
            const auth=await api('/auth/v1/signup',null,{data:{gc08_synthetic_contention:m.run,parent_rehearsal:parentRun}});
            check(auth.user?.id&&auth.access_token&&auth.refresh_token,'hosted anonymous identity missing'); secrets.push(auth.access_token,auth.refresh_token);m[role]=auth.user.id;tokens[role]=auth.access_token;await save();
        }
        validate(m);
        const grant=await api('/rest/v1/rpc/authorize_demo_operator',tokens.gm,{requested_surface:'gamemaster',requested_operator_code:config.operator,requested_session_id:null,requested_team_id:null,requested_role:'white',requested_operator_name:`GC08 synthetic contention ${m.run}`});
        report.operatorAuthorization={observedAt:new Date().toISOString(),userId:m.gm,data:grant};await save();
        rows(await sql('fixture-guard',`BEGIN; ${guard(m)} ${identity(m.gm)} DO $$ BEGIN IF NOT public.live_demo_has_operator_grant('gamemaster') THEN RAISE EXCEPTION 'GM missing'; END IF; END $$; RESET ROLE; SELECT true AS authorized; COMMIT;`));
        initialHistory=rows(await sql('history-before',historicalSql(m),true))[0];
        for(const c of m.cases) {
            console.log(`Running ${c.mode}: two concurrent transactions...`);
            if(c.mode.endsWith('-first')) {
                const fixture=rows(await sql(`fixture-${c.mode}`,managedRaceSql(setupSql(m,c))))[0].receipt.session;
                check(fixture?.id&&fixture.name===c.name&&fixture.session_topology_version===1,'new legacy fixture missing');c.sessionId=fixture.id;await save();
            }
            const queries=raceSql(m,c);
            const outcomes=await concurrentPair((side,q)=>sql(`${c.mode}-${side}`,q),queries.a,queries.b);
            check(outcomes.a.status==='fulfilled'&&outcomes.b.status==='fulfilled','both race requests must settle successfully');
            const receipt=assertRace(c.mode,outcomes.a.value,outcomes.b.value);
            if(!c.sessionId)c.sessionId=receipt.winner.id;
            const committed=rows(await sql(`${c.mode}-committed`,readbackSql(m,c),true))[0];
            assertCommitted(m,c,committed,receipt);
            report.races.push({...receipt,committed});await save();
            console.log(`Verified ${c.mode}: backend ${receipt.connectionA} blocked ${receipt.connectionB}; ${receipt.waitedMs.toFixed(0)} ms; committed readback matched.`);
        }
        const installedAfter=rows(await sql('installed-after',query,true))[0].gc08_preflight;
        check(canonical(installedAfter.functions)===canonical(installed.functions)&&canonical(installedAfter.tables)===canonical(installed.tables),'schema drift during contention');
        report.schemaUnchanged=true;
    } catch(error) { report.failure=error.message; }
    finally {
        // Both race promises settle before reaching here. Server-side timeouts bound uncertain requests.
        if(m.gm&&m.actor) {
            try {
                const before=[];
                for(const c of m.cases) before.push(rows(await sql(`cleanup-before-${c.mode}`,readbackSql(m,c),true))[0]);
                rows(await sql('cleanup-archive',managedRaceSql(cleanupSql(m))));
                const after=[];
                for(const c of m.cases) after.push(rows(await sql(`cleanup-after-${c.mode}`,readbackSql(m,c),true))[0]);
                for(let i=0;i<before.length;i++) {
                    const b=before[i],a=after[i];
                    check((a.sessions||[]).every(s=>s.status==='archived')&&(a.sessions||[]).length===(b.sessions||[]).length,'cleanup did not archive exact fixtures');
                    check(canonical(a.receipts)===canonical(b.receipts)&&canonical((a.clocks||[]).map(g=>g.id))===canonical((b.clocks||[]).map(g=>g.id)),'cleanup lost clocks or receipts');
                    const seats=x=>(x.seats||[]).map(s=>[s.id,s.role,s.display_name_snapshot]).sort();check(canonical(seats(a))===canonical(seats(b)),'cleanup lost seat history');
                }
                const finalHistory=rows(await sql('history-after',historicalSql(m),true))[0];
                check(!initialHistory||(initialHistory.other_sessions===finalHistory.other_sessions&&initialHistory.approvals===finalHistory.approvals),'historical sessions/approvals changed');
                report.cleanup={passed:true,before,after,historicalComparison:!!initialHistory};
            } catch(error) { report.cleanup={passed:false,error:error.message}; }
        }
        report.finishedAt=new Date().toISOString();
        report.sourceUnchanged=report.source?.digest===(await sourceSnapshot()).digest;
        report.passed=!report.failure&&report.races.length===4&&report.cleanup.passed&&report.sourceUnchanged&&report.schemaUnchanged;
        report.gc08Gate='NOT_PASSED_BY_THIS_RUN'; await save();
        console.log(`Evidence: ${relative(process.cwd(),directory)}`);
    }
    check(report.passed,report.failure||report.cleanup.error||'incomplete contention evidence');
    console.log('PASS: four independent-connection contention cases and committed readback. Overall GC08 remains open.');
    return directory;
}
export async function verify(directory) {
    const r=JSON.parse(await readFile(resolve(directory,'results.json'),'utf8'));validate(r.manifest);
    check(r.passed&&r.races.length===4&&r.cleanup?.passed&&r.schemaUnchanged&&r.sourceUnchanged,'run incomplete or failed');
    for(const c of r.manifest.cases){
        const a=r.requests.find(x=>x.label===c.mode+'-A'),b=r.requests.find(x=>x.label===c.mode+'-B');
        const race=assertRace(c.mode,a?.response,b?.response);
        const readback=r.requests.find(x=>x.label===c.mode+'-committed')?.response;
        check(readback?.status>=200&&readback.status<300&&readback.data?.length===1,'committed readback missing');
        assertCommitted(r.manifest,c,readback.data[0],race);
    }
    for(const entry of r.requests)check(sha(await readFile(resolve(directory,entry.file)))===entry.sha256,'submitted SQL hash mismatch');
    check((await sourceSnapshot()).digest===r.source.digest,'current source differs from recorded runner source');
    console.log('PASS: four recorded contention cases, committed readbacks, SQL hashes, and current source match. This does not rerun the database.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
    const args=process.argv.slice(2);
    const task=args[0]==='verify'&&args.length===2?()=>verify(args[1]):args.join(' ')===`run --project ${project} --parent-run ${parentRun}`?run:null;
    if(!task){console.error(`Usage: run --project ${project} --parent-run ${parentRun} | verify EVIDENCE_DIRECTORY`);process.exitCode=1;}
    else task().catch(()=>{console.error('GC08 contention verification failed. See the retained report; do not mark a gate passed.');process.exitCode=1;});
}
