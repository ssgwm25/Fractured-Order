import { describe, it, expect } from 'vitest';
import { manifest, validate, raceSql, assertRace, assertCommitted } from '../../scripts/gc08-contention-contract.mjs';
import { cleanupSql, hostedPost } from '../../scripts/gc08-contention-check.mjs';

const fixture = () => ({ ...manifest(), gm:'10000000-0000-4000-8000-000000000001', actor:'10000000-0000-4000-8000-000000000002' });
const response = receipt => ({status:201,data:[{receipt}]});
function receipts(mode='identical') {
    const winner={id:'20000000-0000-4000-8000-000000000001'};
    const error={conflicting:['PT409','GC08_RETRY_CONFLICT'],'setup-first':['42501','GC03_TOPOLOGY_ROLE_MISMATCH'],'join-first':['23514','GC04A_SEAT_MODEL_FROZEN']}[mode];
    return [response({result:'PASS: A observed B blocked',connection_a:101,connection_b:202,blocking:{wait_event_type:'Lock',wait_event:'advisory',blockers:[101]},value:winner}),
        response({result:`PASS: ${mode}`,connection_a:101,connection_b:202,waited_ms:1050,precommit:{sqlstate:'P0002'},value:error?{sqlstate:error[0],message:error[1]}:winner})];
}
describe('GC08 independent contention evidence (no network)',()=>{
    it('uses native Fetch Response.ok and does not expose error response bodies',async()=>{
        await expect(hostedPost('https://example.test','public-key',null,{},async()=>new Response('{"user":{"id":"synthetic"}}',{status:200}))).resolves.toEqual({user:{id:'synthetic'}});
        await expect(hostedPost('https://example.test','public-key',null,{},async()=>new Response('{"message":"private diagnostic"}',{status:403}))).rejects.toThrow('request failed (403)');
    });
    it('uses canonical uppercase codes matching the real creation RPC',()=>{
        const m=fixture();expect(m.cases.every(c=>c.code===c.code.toUpperCase())).toBe(true);expect(()=>validate(m)).not.toThrow();
    });
    it.each(['identical','conflicting','setup-first','join-first'])('accepts complete matching evidence for %s',mode=>{
        expect(assertRace(mode,...receipts(mode))).toMatchObject({mode,connectionA:101,connectionB:202,waitedMs:1050});
    });
    it('rejects a single backend reused as both competitors',()=>{
        const [a,b]=receipts(); a.data[0].receipt.connection_b=101;b.data[0].receipt.connection_b=101;
        expect(()=>assertRace('identical',a,b)).toThrow('distinct matching backend');
    });
    it('requires direct blocking evidence, not elapsed time alone',()=>{
        const [a,b]=receipts();a.data[0].receipt.blocking.blockers=[999];
        expect(()=>assertRace('identical',a,b)).toThrow('observed blocking');
    });
    it('rejects uncommitted lookup visibility',()=>{
        const [a,b]=receipts();b.data[0].receipt.precommit={lookup:{id:a.data[0].receipt.value.id}};
        expect(()=>assertRace('identical',a,b)).toThrow('uncommitted creation');
    });
    it('rejects duplicate IDs despite successful responses',()=>{
        const [a,b]=receipts();b.data[0].receipt.value={id:'different'};
        expect(()=>assertRace('identical',a,b)).toThrow('same session');
    });
    it('rejects an unrelated SQL error or absent response as conflict evidence',()=>{
        const [a,b]=receipts('conflicting');b.data[0].receipt.value={sqlstate:'42501',message:'not authorized'};
        expect(()=>assertRace('conflicting',a,b)).toThrow('exact competing rejection');
        expect(()=>assertRace('conflicting',a,null)).toThrow('one-row');
    });
    it('rejects forged fixture provenance and unsafe session identifiers before SQL generation',()=>{
        const m=fixture();m.cases[0].code="other'; DELETE FROM sessions;--";
        expect(()=>validate(m)).toThrow('fixture identity');
        const safe=fixture();safe.cases[2].sessionId="not-a-uuid";
        expect(()=>raceSql(safe,safe.cases[2])).toThrow('UUID');
    });
    it('retains commit receipts, lock observations and exact opposite-order denials in generated SQL',()=>{
        const m=fixture();m.cases[2].sessionId='20000000-0000-4000-8000-000000000001';m.cases[3].sessionId='20000000-0000-4000-8000-000000000002';
        const setup=raceSql(m,m.cases[2]),join=raceSql(m,m.cases[3]);
        expect(setup.a).toContain('pg_backend_pid()=ANY(pg_blocking_pids(peer))');
        expect(setup.b).toContain('GC03_TOPOLOGY_ROLE_MISMATCH');
        expect(join.b).toContain('GC04A_SEAT_MODEL_FROZEN');
        expect(join.a).toMatch(/COMMIT;[\s\S]*SELECT receipt/);
    });
    it('rejects duplicate clocks and receipt intent drift in committed readback',()=>{
        const m=fixture(),c=m.cases[0];c.sessionId='20000000-0000-4000-8000-000000000001';
        const row={sessions:[{id:c.sessionId,name:c.name,session_code:c.code,status:'active',session_topology_version:2,green_seat_model:'shared_facilitator_v1',green_roster_version:m.roster}],clocks:[{session_id:c.sessionId}],receipts:[{session_id:c.sessionId,operator_id:m.gm,request_key:c.key,request:{name:c.name}}],seats:[]};
        expect(()=>assertCommitted(m,c,row,{winner:{id:c.sessionId}})).not.toThrow();
        row.clocks.push({session_id:c.sessionId});expect(()=>assertCommitted(m,c,row,{winner:{id:c.sessionId}})).toThrow('one committed');
        row.clocks.pop();row.receipts[0].request.name='mutated';expect(()=>assertCommitted(m,c,row,{winner:{id:c.sessionId}})).toThrow('original intent');
    });
    it('archives only exact owned fixtures without deleting evidence or rewriting approvals',()=>{
        const m=fixture(),sql=cleanupSql(m);
        expect(sql).toContain('GC08 cleanup identity mismatch');
        expect(sql).toContain('public.archive_live_demo_session');
        expect(sql).not.toMatch(/DELETE\s+FROM|UPDATE\s+public|INSERT\s+INTO/i);
        for(const c of m.cases)expect(sql).toContain(c.name);
    });
});
