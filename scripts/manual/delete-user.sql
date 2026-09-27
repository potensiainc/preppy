-- PREPPY 수동 회원 탈퇴 (docs/ACCOUNT_DELETION_MANUAL.md 참고)
-- 사용법:
--   psql "$DATABASE_URL" -v user_id='<users.id>' -f scripts/manual/delete-user.sql
-- 1) 먼저 조회 블록만 실행해 대상과 카카오 회원번호를 확인하세요.
-- 2) 카카오 연결 해제(런북의 curl)를 마친 뒤 이 파일 전체를 실행하세요.
-- 자동 탈퇴 코드(src/modules/account-deletion/repository.server.ts)와 같은 순서로 삭제해요.
\set ON_ERROR_STOP on

-- [조회] 대상 확인
select u.id, u.status, u.created_at,
       (select provider_subject from auth_identities a where a.user_id = u.id and a.provider = 'KAKAO' limit 1) as kakao_user_id,
       (select count(*) from follows f where f.user_id = u.id) as follows
from users u where u.id = :'user_id';

begin;
select set_config('preppy.user_id', :'user_id', true);

-- 이메일만으로 연결된 과거 구독자가 있으면 다른 사람 데이터일 수 있어 중단해요.
do $$ begin
  if exists (
    select 1 from subscribers s join user_emails e on e.email_normalized = s.email_normalized
    where e.user_id = current_setting('preppy.user_id')::uuid
  ) then raise exception 'LEGACY_OWNERSHIP_REVIEW: subscribers 테이블 확인 필요';
  end if;
end $$;

update users set status = 'DELETION_PENDING', updated_at = now() where id = :'user_id';

delete from outbox_events where aggregate_id in (
  select id from email_provider_events where exists (
    select 1 from notification_delivery_attempts a
    join notification_deliveries d on d.id = a.notification_delivery_id
    where d.user_id = :'user_id' and a.provider = email_provider_events.provider
      and a.provider_message_id = email_provider_events.provider_message_id))
  or aggregate_id in (select id from follows where user_id = :'user_id');
delete from email_provider_events where exists (
  select 1 from notification_delivery_attempts a
  join notification_deliveries d on d.id = a.notification_delivery_id
  where d.user_id = :'user_id' and a.provider = email_provider_events.provider
    and a.provider_message_id = email_provider_events.provider_message_id);
delete from outbox_events where aggregate_id in (select id from notification_deliveries where user_id = :'user_id') or aggregate_id = :'user_id';
delete from notification_delivery_attempts where notification_delivery_id in (select id from notification_deliveries where user_id = :'user_id');
delete from notification_deliveries where user_id = :'user_id';
delete from follow_episodes where follow_id in (select id from follows where user_id = :'user_id');
delete from follows where user_id = :'user_id';
delete from notification_preferences where user_id = :'user_id';
delete from consent_decisions where user_id = :'user_id';
delete from user_profiles where user_id = :'user_id';
delete from user_interest_regions where user_id = :'user_id';
delete from user_interest_categories where user_id = :'user_id';
delete from user_emails where user_id = :'user_id';
delete from auth_identities where user_id = :'user_id';
delete from audit_logs where entity_id = :'user_id';
delete from users where id = :'user_id' and status = 'DELETION_PENDING';

-- 결과 확인 후 commit (문제가 있으면 rollback)
select count(*) as remaining_user_rows from users where id = :'user_id';
commit;
