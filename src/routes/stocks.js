import express from "express";
import Stock from "../models/stock.js";
import User from "../models/user.js";
import Client from "../api/koInvTokenUpdate.js";
import { syncPortfolioToKoInv, syncPortfolioToRatio } from "../utils/utils.js";

const router = express.Router();

//Base Domain
router.get("/", function (req, res) {
  res.send({ msg: "Stock Base Domain" });
});

// SearchStock
router.get("/SearchStock", async function ({ query: { uid, name } }, res) {
  if (!uid) res.send({ msg: "uid was not sent" });
  const user = await User.findById(uid);
  const api = new Client(
    user.appkey,
    user.appsecret,
    user.accNumFront,
    user.accNumBack,
    { token: user.token, tokenExpiration: user.tokenExpiration }
  );

  const stocks = await Stock.find({
    $or: [
      { name: new RegExp(`^${name}`, "i") },
      { ticker: new RegExp(`^${name}`, "i") },
    ],
  }).limit(10);

  const newStocks = [];
  for (const stock of stocks) {
    const response = await api.getPrice(stock.ticker);
    newStocks.push({
      ticker: stock.ticker,
      name: stock.name,
      dailyProfit: response.body.output.prdy_ctrt * 0.01, //TODO
    });
  }

  res.send({ stocks: newStocks });
});

// Portfolio - 종목별 - 종목명, 지분율, 수익률
// 총자산, 전체 수익률
router.get("/Portfolio", async function ({ query: { uid } }, res) {
  await syncPortfolioToKoInv(uid);

  User.findById(uid).then((user) => {
    const portfolio = [];

    for (const x of user.portfolio) {
      portfolio.push({
        name: x.name,
        ratio: x.estimatedValue / user.totalBalance,
        rateOfReturn: x.rateOfReturn,
      });
    }

    for (const x of user.subscription)
      portfolio.push({
        name: x.nickname,
        ratio: x.balance / user.totalBalance,
        rateOfReturn: x.balance / x.inputBalance,
      });

    res.send({
      portfolio: portfolio,
      totalBalance: user.totalBalance,
      rateOfReturn: user.rateOfReturn,
    });
  });
});

//IsSubscribed
router.get("/IsSubscribed", function ({ query: { uid, targetUid } }, res) {
  User.findById(uid).then((user) => {
    if (!user) res.status(500).send({ msg: "User not found" });

    for (const subscription of user.subscription) {
      if (subscription.uid === targetUid) {
        res.send({ isSubscribed: true });
        return;
      }
    }

    res.send({ isSubscribed: false });
  });
});

//Kline
router.get(
  "/Kline",
  async function ({ query: { uid, ticker, interval } }, res) {
    if (!uid) res.send({ msg: "uid was not sent" });
    const user = await User.findById(uid);
    const api = new Client(
      user.appkey,
      user.appsecret,
      user.accNumFront,
      user.accNumBack,
      { token: user.token, tokenExpiration: user.tokenExpiration }
    );

    const response = await api.getKline(ticker, interval);
    const newKline = response.body.output.map((x) => ({
      date: x.stck_bsop_date,
      open: x.stck_oprc,
      high: x.stck_hgpr,
      low: x.stck_lwpr,
      close: x.stck_clpr,
      volume: x.acml_vol,
    }));

    res.send({ kline: newKline });
  }
);

//SyncPortfolio
router.post(
  "/SyncPortfolio",
  async function ({ body: { uid, newPortfolioRatio } }, res) {
    await syncPortfolioToRatio(uid, newPortfolioRatio);
    res.send({ msg: "Synced Portfolio" });
  }
);

//AddStock
router.post("/AddStock", function ({ body: { stocks } }, res) {
  for (const stock of stocks)
    Stock.create({ ticker: stock.ticker, name: stock.name });

  res.send({ msg: `${stocks.length} stocks has been added` });
});

//ReloadPortfolio
router.post("/ReloadPortfolio", async function ({ body: { uid } }, res) {
  await syncPortfolioToKoInv(uid);
  res.send({ msg: "Synced" });
});

router.get("/test", function ({ body: { uid } }, res) {
  syncPortfolioToKoInv(uid).then(() => res.send({ msg: "Done" }));
});

export default router;
