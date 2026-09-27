# 수동 회원 탈퇴 절차

자동 탈퇴(`ACCOUNT_DELETION_ENABLED`)를 켜기 전까지 이 절차로 처리해요. 약관 제8조·개인정보 처리방침 7~8조의 안내와 같은 내용이에요.

- 담당: 김경민 (개인정보 보호책임자)
- 접수 채널: potensiainc@gmail.com / 010-4685-4725
- 처리 기한: **접수 후 7일 안** (늦어지면 요청자에게 사유와 예정일을 안내)

## 1. 접수·본인 확인 (5분)

1. 요청자에게 카카오 로그인 상태로 `내 프레피 > 계정 설정` 화면을 캡처해 보내 달라고 요청해요. 또는 가입에 쓴 이메일로 회신받아요.
2. Admin `/admin/users`에서 회원을 찾아 `users.id`를 확인해요.
3. 아래 처리 기록표에 접수 행을 추가해요.

## 2. 카카오 연결 해제 (2분)

먼저 대상의 카카오 회원번호(`kakao_user_id`)를 조회해요.

```bash
psql "$DATABASE_URL" -v user_id='<users.id>' -c "select provider_subject from auth_identities where user_id = :'user_id' and provider = 'KAKAO';"
```

카카오 개발자 콘솔 > 앱 > 앱 키의 **Admin 키**로 연결을 해제해요.

```bash
curl -X POST "https://kapi.kakao.com/v1/user/unlink" \
  -H "Authorization: KakaoAK <ADMIN_KEY>" \
  -d "target_id_type=user_id" -d "target_id=<kakao_user_id>"
```

응답에 `{"id": <kakao_user_id>}`가 오면 성공이에요.

## 3. DB 삭제 (2분)

```bash
psql "$DATABASE_URL" -v user_id='<users.id>' -f scripts/manual/delete-user.sql
```

- `LEGACY_OWNERSHIP_REVIEW` 오류가 나면 자동으로 롤백돼요. `subscribers` 테이블의 같은 이메일 행이 본인 것인지 확인한 뒤 처리해요.
- 마지막 `remaining_user_rows`가 0이면 완료예요.
- 기관·입학정보·발송 콘텐츠 같은 공용 데이터는 삭제하지 않아요.

## 4. 백업 사본

처리방침상 백업에 남은 사본도 삭제 대상이에요. 수동 백업 파일을 보관 중이라면 다음 백업 교체 때 이전 파일을 지우고, 복구 시에는 처리 기록표의 `users.id`를 다시 삭제해요.

## 5. 완료 안내

요청자에게 "탈퇴와 정보 삭제, 카카오 연결 해제를 마쳤어요. 카카오계정 자체는 삭제되지 않아요."라고 회신해요.

## 처리 기록표

회원 식별정보는 남기지 않고 내부 ID와 날짜만 적어요. (별도 비공개 시트로 관리해도 돼요.)

| 접수일 | users.id | 카카오 해제 | DB 삭제 | 완료 안내 | 담당 |
|---|---|---|---|---|---|
| | | | | | |
