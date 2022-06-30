import WebSocket from "ws";
import axios from "axios";

class KoreaInvestmentAPI {
  constructor(APIKEY, SECRETKEY, accNumFront, accNumBack, options = {}) {
    const base = "https://openapi.koreainvestment.com:9443";
    const testnet = "https://openapivts.koreainvestment.com:29443";
    const wsBase = "ws://ops.koreainvestment.com:21000";
    const wsTestnet = "ws://ops.koreainvestment.com:31000";

    const default_options = {
      recvWindow: 1000,
      reconnect: true,
      keepAlive: true,
      test: false,
      log: function (...args) {
        console.log(Array.prototype.slice.call(args));
      },
      APIKEY: APIKEY,
      SECRETKEY: SECRETKEY,
      accNumFront: accNumFront,
      accNumBack: accNumBack,
    };

    this.options = Object.assign(default_options, options);
    this.isTest = this.options.test;
    this.options.domain = this.isTest ? testnet : base;
    this.options.wsDomain = this.isTest ? wsTestnet : wsBase;

    this.appkey = this.options.APIKEY;
    this.appsecret = this.options.SECRETKEY;
    this.domain = this.options.domain;
  }

  isTokenExpired() {
    return this.options.tokenExpiration < new Date().getTime();
  }

  setToken(_token, _expire_in) {
    this.options.token = _token;
    this.options.tokenExpiration =
      new Date().getTime() + (_expire_in - 3600) * 1000;
  }

  async getToken() {
    if (this.isTokenExpired() || this.options.token === undefined) {
      const res = await this.issueToken();
      this.setToken(res.body.access_token, res.body.expires_in);
    }
    return this.options.token;
  }

  async request(obj, opt = {}) {
    const option = Object.assign(
      {
        addKey: true,
        addHash: false,
        addAccNum: true,
        addContentType: true,
        addAuth: true,
      },
      opt
    );

    if (obj.data === undefined) obj.data = {};
    if (obj.headers === undefined) obj.headers = {};

    if (option.addKey)
      obj.headers = Object.assign(obj.headers, {
        appkey: this.options.APIKEY,
        appsecret: this.options.SECRETKEY,
      });

    if (option.addAccNum)
      obj.data = Object.assign(obj.data, {
        CANO: this.options.accNumFront,
        ACNT_PRDT_CD: this.options.accNumBack,
      });

    if (option.addContentType)
      obj.headers = Object.assign(obj.headers, {
        "content-type": "application/json",
      });

    if (option.addAuth) {
      const token = await this.getToken();
      obj.headers = Object.assign(obj.headers, {
        authorization: `Bearer ${token}`,
      });
    }

    if (option.addHash) {
      const hash = await this.getHashkey(obj.data);
      obj.headers = Object.assign(obj.headers, { hashkey: hash });
    }

    obj.url = this.domain + obj.url;

    return axios(obj)
      .then((res) => ({
        header: res.headers,
        body: res.data,
      }))
      .catch((err) => {
        console.log(err);
      });
  }

  connect(url, tr_id, tr_key) {
    const wsDomain = this.options.wsDomain;
    const appkey = this.options.APIKEY,
      appsecret = this.options.SECRETKEY;

    const obj = function () {
      this.socket = new WebSocket(wsDomain + url);

      this.open = () => {
        this.socket.send({
          header: {
            appkey,
            appsecret,
            custtype: "P",
            tr_type: "1",
            "content-type": "utf-8",
          },
          body: { input: { tr_id, tr_key } },
        });
      };

      this.close = () => {
        this.socket.send({
          header: {
            appkey,
            appsecret,
            custtype: "P",
            tr_type: "2",
            "content-type": "utf-8",
          },
          body: { input: { tr_id, tr_key } },
        });
        socket.close();
      };
    };

    return new obj();
  }

  //OAuth
  //Hashkey
  hashkey(data) {
    const obj = {
      url: "/uapi/hashkey",
      headers: { "content-type": "application/json" },
      data,
      method: "POST",
    };

    return this.request(obj, { addAccNum: false, addAuth: false });
  }

  async getHashkey(data) {
    const res = await this.hashkey(data);
    return res.body.HASH;
  }

  //접근토큰발급(P)
  async issueToken() {
    if (this.options.token) await this.discardToken();

    const obj = {
      url: "/oauth2/tokenP",
      data: {
        grant_type: "client_credentials",
        appkey: this.appkey,
        appsecret: this.appsecret,
      },
      method: "POST",
    };

    return this.request(obj, {
      addKey: false,
      addAccNum: false,
      addContentType: false,
      addAuth: false,
    });
  }

  //접근토큰폐기(P)
  async discardToken(token = this.options.token) {
    if (token === undefined) throw "token was undefined";

    const obj = {
      url: "/oauth2/revokeP",
      data: { token, appkey: this.appkey, appsecret: this.appsecret },
      method: "POST",
    };

    return this.request(obj, {
      addKey: false,
      addAccNum: false,
      addContentType: false,
      addAuth: false,
    });
  }

  //Domestic Stock Order
  //주식주문(현금)
  async orderCash(ticker, type, orderType, qty, price) {
    const obj = {
      url: "/uapi/domestic-stock/v1/trading/order-cash",
      headers: {},
      data: {
        PDNO: ticker,
        ORD_DVSN: orderType,
        ORD_QTY: qty,
        ORD_UNPR: price,
      },
      method: "POST",
    };

    if (type === "BUY")
      obj.headers.tr_id = this.isTest ? "VTTC0802U" : "TTTC0802U";
    else if (type === "SELL")
      obj.headers.tr_id = this.isTest ? "VTTC0801U" : "TTTC0801U";
    else throw "type should be either BUY or SELL";

    return this.request(obj, { addHash: true });
  }

  async balance(
    viewBy,
    CTX_AREA_FK100 = undefined,
    CTX_AREA_NK100 = undefined
  ) {
    // "01" - 대출일별, "02" - 종목별
    if (viewBy !== "01" && viewBy !== "02")
      throw 'viewBy must be either "01" or "02"';

    const token = await this.getToken();

    const obj = {
      url:
        this.options.domain + "/uapi/domestic-stock/v1/trading/inquire-balance",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        appkey: this.appkey,
        appsecret: this.appsecret,
        tr_id: this.isTest ? "VTTC8434R" : "TTTC8434R",
      },
      params: {
        CANO: this.options.accNumFront,
        ACNT_PRDT_CD: this.options.accNumBack,
        AFHR_FLPR_YN: "N",
        INQR_DVSN: viewBy,
        UNPR_DVSN: "01",
        FUND_STTL_ICLD_YN: "N",
        FNCG_AMT_AUTO_RDPT_YN: "N",
        PRCS_DVSN: "00",
        OFL_YN: "N",
        CTX_AREA_FK100: "",
        CTX_AREA_NK100: "",
      },
      method: "GET",
    };

    if (CTX_AREA_FK100 && CTX_AREA_NK100) {
      obj.headers.tr_cont = "N";
      obj.params.CTX_AREA_FK100 = CTX_AREA_FK100;
      obj.params.CTX_AREA_NK100 = CTX_AREA_NK100;
    }

    return axios(obj)
      .then((res) => ({
        header: res.headers,
        body: res.data,
      }))
      .catch((err) => {
        console.log(err);
      });
  }

  async possibleOrder(ticker, price, orderType) {
    const obj = {
      url: "/uapi/domestic-stock/v1/trading/inquire-psbl-order",
      headers: {
        tr_id: this.isTest,
      },
      data: {
        PDNO: ticker,
        ORD_UNPR: price,
        ORD_DVSN: orderType,
        CMA_EVLU_AMT_ICLD_YN: "N",
        OVRS_ICLD_YN: "N",
      },
      method: "GET",
    };

    return this.request(obj);
  }

  async getPrice(ticker) {
    const obj = {
      headers: {
        tr_id: "tr_id",
      },
      data: {
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: ticker,
      },
      method: "GET",
    };

    return this.request(obj, {
      addAccNum: false,
    });
  }

  async getKline(ticker, interval, resume = false) {
    const obj = {
      url: "/uapi/domestic-stock/v1/quotations/inquire-daily-price",
      headers: {
        tr_id: "FHKST01010400",
      },
      data: {
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: ticker,
        FID_PERIOD_DIV_CODE: interval,
        FID_ORG_ADJ_PRC: "1",
      },
      method: "GET",
    };
    if (resume) obj.headers.tr_cont = "N";

    return this.request(obj, { addAccNum: false });
  }

  tradeStream(ticker) {
    let connected = false;
    const socket = this.connect("/tryitout/H0STCNT0", "H0STCNT0", ticker);
    socket.socket.on("message", (event) => {
      console.log(event);
    });

    socket.socket.on("open", (event) => {
      console.log("OPEN");
    });

    socket.socket.on("error", (err) => {
      console.log("ERROR");
    });

    socket.socket.on("close", (event) => {
      console.log(event);
    });

    return socket;
  }

  /*
  openEventFunction = (event) => event,
  closeEventFunction = (event) => event,
  errorEventFunction = (event) => event,
  messageEventFunction = (event) => event

  
  this.socket.addEventListener("close", (event) => {
    closeEventFunction(event);
  });
  this.socket.addEventListener("open", (event) => {
    openEventFunction(event);
  });
  this.socket.addEventListener("error", (event) => {
    errorEventFunction(event);
  });
  this.socket.addEventListener("message", (event) => {
    messageEventFunction(event);
  });
  */
}

class Client extends KoreaInvestmentAPI {
  async MarketBuy(ticker, qty) {
    return await this.orderCash(ticker, "BUY", "01", qty, "0");
  }

  async MarketSell(ticker, qty) {
    return await this.orderCash(ticker, "SELL", "01", qty, "0");
  }
}

export default Client;
