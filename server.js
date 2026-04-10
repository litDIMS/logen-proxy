const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// ── 로젠 API 설정 ──
const LOGEN = {
  SECRET_KEY: '2FN10s3b_gHpZDsfskdjfjD8WCx8_oNBFdffsLui1mYxt-w',
  USER_ID: '24550119',
  CUST_CD: '24550119',
  BASE_URL: 'https://openapi.ilogen.com',  // 운영계
  DEV_URL:  'https://topenapi.ilogen.com', // 개발계
  // 송하인 정보
  SND_CUST_NM:   '천안인재사',
  SND_TEL_NO:    '01053216916',
  SND_ADDR1:     '서울시 종로구 창신동 381, 1층 천안인재사',
  SND_ADDR2:     '',
  SND_ZIP_CD:    '03090',
  // 운임 설정
  FARE_TY:       '010',  // 선불
  DLV_FARE:      2750,
  EXTRA_FARE:    0,
};

// 개발계/운영계 전환 (환경변수로 제어)
const API_URL = process.env.LOGEN_ENV === 'prod' ? LOGEN.BASE_URL : LOGEN.DEV_URL;

const logenHeaders = {
  'secretKey': LOGEN.SECRET_KEY,
  'Content-Type': 'application/json',
};

// ── 헬스체크 ──
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: '로젠 API 프록시 서버', env: process.env.LOGEN_ENV || 'dev' });
});

// ── 아웃바운드 IP 확인 ──
app.get('/my-ip', async (req, res) => {
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    res.json({ outbound_ip: response.data.ip });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ── 1. 송장번호 채번 ──
app.post('/getSlipNo', async (req, res) => {
  try {
    const { slipQty = 1 } = req.body;
    const response = await axios.post(`${API_URL}/lrm02b-edi/edi/getSlipNo`, {
      userId: LOGEN.USER_ID,
      data: [{ slipQty }],
    }, { headers: logenHeaders });
    res.json(response.data);
  } catch (err) {
    console.error('getSlipNo error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message, detail: err.response?.data });
  }
});

// ── 2. 송장 출력정보 통합조회 ──
app.post('/integratedInquiry', async (req, res) => {
  try {
    const { addr, custCd } = req.body;
    const response = await axios.post(`${API_URL}/lrm02b-edi/edi/integratedInquiry`, {
      userId: LOGEN.USER_ID,
      data: [{ custCd: custCd || LOGEN.CUST_CD, addr }],
    }, { headers: logenHeaders });
    res.json(response.data);
  } catch (err) {
    console.error('integratedInquiry error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message, detail: err.response?.data });
  }
});

// ── 3. 송장 출력 주문정보 등록 ──
app.post('/slipPrintM', async (req, res) => {
  try {
    const {
      slipNo,
      rcvCustNm,
      rcvTelNo,
      rcvCellNo,
      rcvZipCd,
      rcvCustAddr1,
      rcvCustAddr2,
      rcvBranCd,
      goodsNm,
      goodsAmt = 0,
      qty = 1,
      takeDt,
      fixTakeNo,
      remarks,
      jejuAmt = 0,
      shipFare = 0,
      montFare = 0,
      jejuAmtTy,
      shipYn = 'N',
    } = req.body;

    // 오늘 날짜 기본값
    const today = new Date();
    const dateStr = takeDt || today.toISOString().slice(0,10).replace(/-/g,'');

    const response = await axios.post(`${API_URL}/lrm02b-edi/edi/slipPrintM`, {
      userId: LOGEN.USER_ID,
      data: {
        printYn:      'Y',
        slipNo,
        slipTy:       '100',
        custCd:       LOGEN.CUST_CD,
        sndCustNm:    LOGEN.SND_CUST_NM,
        sndTelNo:     LOGEN.SND_TEL_NO,
        sndCellNo:    LOGEN.SND_TEL_NO,
        sndZipCd:     LOGEN.SND_ZIP_CD,
        sndCustAddr1: LOGEN.SND_ADDR1,
        sndCustAddr2: LOGEN.SND_ADDR2,
        rcvCustNm,
        rcvTelNo:     rcvTelNo || rcvCellNo,
        rcvCellNo:    rcvCellNo || rcvTelNo,
        rcvZipCd,
        rcvCustAddr1,
        rcvCustAddr2: rcvCustAddr2 || '',
        fareTy:       LOGEN.FARE_TY,
        qty,
        rcvBranCd,
        goodsNm:      goodsNm || '택배',
        dlvFare:      LOGEN.DLV_FARE,
        extraFare:    LOGEN.EXTRA_FARE,
        goodsAmt,
        takeDt:       dateStr,
        fixTakeNo:    fixTakeNo || '',
        remarks:      remarks || '',
        jejuAmtTy:    jejuAmtTy || '',
        shipYn,
        jejuAmt,
        shipFare,
        montFare,
      },
    }, { headers: logenHeaders });
    res.json(response.data);
  } catch (err) {
    console.error('slipPrintM error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message, detail: err.response?.data });
  }
});

// ── 4. 전체 프로세스 한번에 처리 ──
// 채번 → 지점코드 조회 → 등록 → 결과 반환
app.post('/createInvoice', async (req, res) => {
  try {
    const {
      rcvCustNm,
      rcvTelNo,
      rcvCellNo,
      rcvZipCd,
      rcvCustAddr1,
      rcvCustAddr2,
      goodsNm,
      goodsAmt,
      fixTakeNo,
      remarks,
    } = req.body;

    // Step 1: 송장번호 채번
    const slipRes = await axios.post(`${API_URL}/lrm02b-edi/edi/getSlipNo`, {
      userId: LOGEN.USER_ID,
      data: [{ slipQty: 1 }],
    }, { headers: logenHeaders });

    const slipData = slipRes.data;
    if (slipData.sttsCd !== 'SUCCESS' && slipData.sttsMsg?.includes('FAIL')) {
      return res.status(400).json({ error: '송장번호 채번 실패', detail: slipData });
    }

    const slipNo = slipData.data?.[0]?.slipNo || slipData.data?.startSlipNo;
    if (!slipNo) {
      return res.status(400).json({ error: '송장번호를 가져오지 못했습니다', detail: slipData });
    }

    // Step 2: 배송정보 조회 (지점코드 획득)
    const inqRes = await axios.post(`${API_URL}/lrm02b-edi/edi/integratedInquiry`, {
      userId: LOGEN.USER_ID,
      data: [{ custCd: LOGEN.CUST_CD, addr: rcvCustAddr1 }],
    }, { headers: logenHeaders });

    const inqData = inqRes.data?.data?.[0] || {};
    const rcvBranCd = inqData.branCd || '000';
    const jejuAmtTy = inqData.jejuRegYn === 'Y' ? LOGEN.FARE_TY : '';
    const shipYn = inqData.shipYn || 'N';
    const jejuAmt = inqData.jejuRegYn === 'Y' ? LOGEN.DLV_FARE : 0;
    const shipFare = inqData.shipYn === 'Y' ? LOGEN.DLV_FARE : 0;
    const montFare = inqData.montYn === 'Y' ? LOGEN.DLV_FARE : 0;

    // Step 3: 주문정보 등록
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const printRes = await axios.post(`${API_URL}/lrm02b-edi/edi/slipPrintM`, {
      userId: LOGEN.USER_ID,
      data: {
        printYn:      'Y',
        slipNo,
        slipTy:       '100',
        custCd:       LOGEN.CUST_CD,
        sndCustNm:    LOGEN.SND_CUST_NM,
        sndTelNo:     LOGEN.SND_TEL_NO,
        sndCellNo:    LOGEN.SND_TEL_NO,
        sndZipCd:     LOGEN.SND_ZIP_CD,
        sndCustAddr1: LOGEN.SND_ADDR1,
        sndCustAddr2: LOGEN.SND_ADDR2,
        rcvCustNm,
        rcvTelNo:     rcvTelNo || rcvCellNo,
        rcvCellNo:    rcvCellNo || rcvTelNo,
        rcvZipCd:     rcvZipCd || '',
        rcvCustAddr1,
        rcvCustAddr2: rcvCustAddr2 || '',
        fareTy:       LOGEN.FARE_TY,
        qty:          1,
        rcvBranCd,
        goodsNm:      goodsNm || '택배',
        dlvFare:      LOGEN.DLV_FARE,
        extraFare:    LOGEN.EXTRA_FARE,
        goodsAmt:     goodsAmt || 0,
        takeDt:       today,
        fixTakeNo:    fixTakeNo || '',
        remarks:      remarks || '',
        jejuAmtTy,
        shipYn,
        jejuAmt,
        shipFare,
        montFare,
      },
    }, { headers: logenHeaders });

    const printData = printRes.data;

    res.json({
      success: true,
      slipNo,
      branCd: rcvBranCd,
      classCd: inqData.classCd,
      salesNm: inqData.salesNm,
      jejuRegYn: inqData.jejuRegYn,
      shipYn: inqData.shipYn,
      montYn: inqData.montYn,
      printResult: printData,
    });

  } catch (err) {
    console.error('createInvoice error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message, detail: err.response?.data });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`로젠 API 프록시 서버 실행 중: port ${PORT}`);
  console.log(`환경: ${process.env.LOGEN_ENV || 'dev'} (${API_URL})`);
});
