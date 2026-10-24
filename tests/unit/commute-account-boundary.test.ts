import {describe,it,expect,vi} from 'vitest';
import {createSessionHandler,createLogoutHandler} from '@/src/modules/auth/http.server';
import {createFollowPostHandler} from '@/src/modules/follow/http.server';
import {createUserSessionCookie} from '@/src/modules/auth/session.server';
const origin='https://preppy.example';
const secret='schoolmap-test-only-secret-at-least-thirty-two-bytes';
const now=new Date('2026-10-15T00:00:00Z');
const accountA='6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const accountB='7ba7b810-9dad-11d1-80b4-00c04fd430c8';
const institutionId='550e8400-e29b-41d4-a716-446655440000';
function request(account:string,body:object){
  const cookie=createUserSessionCookie(account,{secret,now});
  return new Request(`${origin}/api/me/follows`,{method:'POST',headers:{origin,'content-type':'application/json',cookie:`${cookie.name}=${encodeURIComponent(cookie.value)}`},body:JSON.stringify(body)});
}
describe('schoolmap account import safety boundary (no real accounts or DB)',()=>{
  it('cannot distinguish account A to B from the public boolean session response',async()=>{
    const handler=createSessionHandler({getCurrentUser:vi.fn().mockResolvedValueOnce({id:accountA}).mockResolvedValueOnce({id:accountB}).mockResolvedValueOnce(null)});
    const a=await (await handler(new Request(`${origin}/api/auth/session`))).json();
    const b=await (await handler(new Request(`${origin}/api/auth/session`))).json();
    const loggedOut=await (await handler(new Request(`${origin}/api/auth/session`))).json();
    expect(a).toEqual({authenticated:true});expect(b).toEqual(a);expect(loggedOut).toEqual({authenticated:false});
  });
  it('binds each POST to the cookie at that request, without a batch account precondition',async()=>{
    const activateFollow=vi.fn().mockResolvedValue({institutionId,state:'ACTIVE'});
    const handler=createFollowPostHandler({appBaseUrl:origin,sessionSecret:secret,now:()=>now,activateFollow});
    expect((await handler(request(accountA,{institutionId}))).status).toBe(200);
    expect((await handler(request(accountB,{institutionId}))).status).toBe(200);
    expect(activateFollow.mock.calls.map(call=>call[0].userId)).toEqual([accountA,accountB]);
    // This is deliberately rejected, not a supported compare-and-set account guard.
    expect((await handler(request(accountB,{institutionId,expectedAccountId:accountA}))).status).toBe(400);
    expect(activateFollow).toHaveBeenCalledTimes(2);
  });
  it('logout clears only the HTTP-only account cookie; browser saves need a separate policy',async()=>{
    const logout=createLogoutHandler({appBaseUrl:origin,production:true});
    const response=await logout(new Request(`${origin}/api/auth/logout`,{method:'POST',headers:{origin}}));
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toMatch(/preppy_user_session=;.*Max-Age=0/);
    expect(response.headers.has('clear-site-data')).toBe(false);
  });
});
