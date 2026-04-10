# 로젠택배 API 프록시 서버

카페24 물류시스템을 위한 로젠택배 Open API 프록시 서버입니다.

## 엔드포인트

- `GET /` - 헬스체크
- `POST /getSlipNo` - 송장번호 채번
- `POST /integratedInquiry` - 배송정보 통합조회
- `POST /slipPrintM` - 송장 주문정보 등록
- `POST /createInvoice` - 전체 프로세스 한번에 처리 (채번→조회→등록)

## 환경변수

- `PORT` - 서버 포트 (기본 3000)
- `LOGEN_ENV` - `prod` 설정 시 운영계 사용 (기본 개발계)
