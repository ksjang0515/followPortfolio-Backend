import express from "express";
import Stock from "../models/stock.js";
import User from "../models/user.js";
import Client from "../api/koInvTokenUpdate.js";

const router = express.Router();

const getStockInfo = async (api, tickers) => {
  const promises = tickers.map((ticker) => {
    return api.getPrice(ticker);
  });

  const info = await Promise.all(promises);
  return info;
};

const syncPortfolioToKoInv = async (uid) => {
  User.findById(uid).then((user) => {
    const api = new Client(
      user.appkey,
      user.appsecret,
      user.accNumFront,
      user.accNumBack,
      { token: user.token, tokenExpiration: user.tokenExpiration }
    );
    console.log("send response");
    api.balance("01").then((response) => {
      console.log("response acquired");

      for (let i = 0; i < response.body.output1.length; i++) {
        const elem = response.body.output1[i];
        const idx = user.portfolio.findIndex(
          (stock) => stock.ticker === elem.pdno
        );

        user.portfolio[idx] = Object.assign(user.portfolio[idx], {
          price: elem.prpr,
          entryPrice: elem.pchs_avg_pric,
          estimatedValue: elem.evlu_amt,
          rateOfReturn: elem.evlu_pfls_rt,
        });
      }

      // 예수금
      user.remainingCash = response.body.output2[0].prvs_rcdl_excc_amt;

      // Subscription마다 주식 잔고와 예수금 제외 및 subscription 정보로 저장
      for (let i = 0; i < user.subscription.length; i++) {
        const elem = user.subscription[i];
        user.subscription[i].balance = user.subscription[i].remainingCash;
        user.remainingCash -= user.subscription[i].remainingCash; //Subscription 예수금과 일반 예수금 따로 관리
        /*
        {
        uid: String,
        nickname: String,
        stock: [
            {
            ticker: String,
            name: String,
            qty: Number,
            price: Number,
            estimatedValue: Number,
            },
        ],
        inputBalance: Number,
        balance: Number,
        remainingCash: Number,
        }
        */

        for (let j = 0; j < elem.stock.length; j++) {
          const stock = elem.stock[j];
          /*
          {
            ticker: String,
            name: String,
            qty: Number,
            price: Number,
            estimatedValue: Number,
          }
          */
          const idx = user.portfolio.findIndex(
            (stock) => stock.ticker === elem.pdno
          );
          const portfolioObj = user.portfolio[idx];

          user.subscription[i].stock[j] = Object.assign(stock, {
            price: portfolioObj.price,
            estimatedValue: portfolioObj.price * stock.qty,
          });

          user.portfolio[idx].estimatedValue -=
            user.subscription[i].stock[j].estimatedValue;
          user.portfolio[idx].qty -= user.subscription[i].stock[j].qty;

          user.subscription[i].balance +=
            user.subscription[i].stock[j].estimatedValue;
        }
      }

      // 바꾼 정보를 DB에 저장
      user.save();
    });
  });
};

const syncPortfolioToSub = (uid, targetUid) => {};

const syncPortfolioToRatio = (uid) => {
  User.findById(uid).then((user) => {
    // get current stock data of owned stocks and subscriptions
    syncPortfolioToKoInv(uid);

    // get margin rate of stocks

    // calculate portfolio based on set portfolio ratio (consider )

    // buy/sell on calculated portfolio
  });
};

router.get("/", function (req, res) {
  res.send("Stock Base Domain");
});

router.get("/test", function ({ body: { uid } }, res) {
  console.log("calling syncPortfolioToKoInv");
  syncPortfolioToKoInv(uid).then(() => {
    console.log("called syncPortfolioToKoInv");
  });
});

// SearchStock
router.get("/SearchStock", function ({ body: { name } }, res) {
  Stock.find({
    $or: [{ name: { $regex: name } }, { ticker: { $regex: name } }],
  }).then((stocks) => {
    res.send({ stocks });
  });
});

// Portfolio
router.get("/Portfolio", function ({ body: { uid } }, res) {
  User.findById(uid).then((user) => {
    const api = new Client(
      user.appkey,
      user.appsecret,
      user.accNumFront,
      user.accNumBack,
      { token: user.token, tokenExpiration: user.tokenExpiration }
    );
    api.balance("01").then((response) => {
      const portfolio = {};

      for (let i = 0; i < response.body.output1.length; i++) {
        const elem = response.body.output1[i];

        portfolio[elem.pdno] = {
          name: elem.prdt_name,
          price: elem.prpr,
          estimatedValue: elem.evlu_amt,
          rateOfReturn: elem.evlu_pfls_rt,
        };
      }

      portfolio["deposit"] = {
        name: "deposit",
        price: 1,
        estimatedValue: response.output[0].prvs_rcdl_excc_amt,
        rateOfReturn: 1,
      };

      for (let i = 0; i < user.subscription.length; i++) {
        const elem = user.subscription[i];
        let estimatedValue = 0;
        for (let j = 0; j < elem.stock.length; j++) {
          const stock = elem.stock[j];

          const ticker = stock.ticker,
            price = portfolio[ticker].price,
            qty = portfolio[ticker].qty;

          portfolio[ticker].estimatedValue -= price * qty;
          estimatedValue += price * qty;
        }
        portfolio["balance"] -= elem.remainingCash;
        estimatedValue += elem.remainingCash;

        portfolio[user.nickname] = {
          name: user.nickname,
          estimatedValue,
          rateOfReturn: estimatedValue / elem.balance,
        };
      }

      res.send({
        portfolio: Object.values(portfolio),
        totalBalance: response.tot_evlu_amt,
      });
    });
  });
});

//IsSubscribed
router.get("/IsSubscribed", function ({ body: { uid, targetUid } }, res) {
  User.findById(uid).then((user) => {
    if (!user) res.status(500).send({ msg: "User not found" });

    for (let i = 0; i < user.subscription.length; i++) {
      if (user.subscription[i].uid === targetUid) {
        res.send({ isSubscribed: true });
        return;
      }
    }

    res.send({ isSubscribed: false });
  });
});

// ChangePortfolio
router.post("/ChangePortfolio", function (req, res) {});

//Subscribe
router.post("/Subscribe", function ({ body: { uid, targetUid, amount } }) {
  User.findById(uid).then((user) => {
    User.findById(targerUid).then((targerUser) => {
      // sync portfolio
      syncPortfolioToKoInv(uid);
      // buy stock and set remaining cash
      // save
    });
  });
});

//Unsubscribe
router.post("/Unsubscribe", function ({ body: { uid, targetUid } }) {
  User.findById(uid).then((user) => {
    User.findById(targetUid).then((targetUser) => {
      // sell stock
      const api = new Client(
        user.appkey,
        user.appsecret,
        user.accNumFront,
        user.accNumBack,
        { token: user.token, tokenExpiration: user.tokenExpiration }
      );

      const idx = user.subscription.findIndex((sub) => {
        return sub.uid === targetUid;
      });
      const sub = user.subscription[idx];
      const promises = sub.stock.map((stock) => {
        api.MarketSell(stock.ticker, stock.qty);
      });

      Promise.all(promises).then((responses) => {
        user.subscription.splice(idx, 1);
        const targetIdx = targetUser.subscriber.findIndex((sub) => {
          return sub.uid === uid;
        });
        targetUser.subscriber.splice(targetIdx, 1);

        user.save();
        targetUser.save();

        syncPortfolioToKoInv(uid);
      });
    });
  });
});

//AddStock
router.post("/AddStock", function ({ body: { stocks } }, res) {
  stocks.map((stock) => {
    Stock.create({
      ticker: stock.ticker,
      name: stock.name,
      market: stock.market,
    });
  });

  res.send({ msg: "Complete" });
});

export default router;
