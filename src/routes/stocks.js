import express from "express";
import Stock from "../models/stock.js";
import User from "../models/user.js";
import Client from "../api/koInvTokenUpdate.js";

const router = express.Router();

const syncPortfolioToKoInv = async function (uid) {
  User.findById(uid).then((user) => {
    if (!user) return;
    const api = new Client(
      user.appkey,
      user.appsecret,
      user.accNumFront,
      user.accNumBack,
      { token: user.token, tokenExpiration: user.tokenExpiration }
    );
    api.balance("01").then((response) => {
      for (const portfolio of user.portfolio) {
        for (const elem of response.body.output1) {
          if (elem.pdno === portfolio.ticker) {
            Object.assign(portfolio, {
              qty: elem.hldg_qty,
              estimatedValue: elem.evlu_amt,
              rateOfReturn: elem.evlu_pfls_rt,
            });
            break;
          }
        }
      }

      // 예수금
      let remainingCash = response.body.output2[0].prvs_rcdl_excc_amt;

      // Subscription마다 주식 잔고와 예수금 제외 및 subscription 정보로 저장
      for (const elem of user.subscription) {
        elem.balance = elem.remainingCash;
        remainingCash -= elem.remainingCash; //Subscription 예수금과 일반 예수금 따로 관리

        for (const stock of elem.stock) {
          const portfolioObj = user.portfolio.find(
            (x) => x.ticker === elem.pdno
          );

          Object.assign(stock, {
            price: portfolioObj.price,
            estimatedValue: portfolioObj.price * stock.qty,
          });

          portfolioObj.estimatedValue -= stock.estimatedValue;
          portfolioObj.qty -= stock.qty;

          elem.balance += stock.estimatedValue;
        }
      }

      const deposit = user.portfolio.find((x) => x.ticker === "000000");
      Object.assign(deposit, {
        qty: remainingCash,
        estimatedValue: remainingCash,
      });

      // 바꾼 정보를 DB에 저장
      user.save();
    });
  });
};

const getPriceNMarginRate = async (api, ticker) => {
  return await api.getPrice(ticker).then((response) => ({
    price: response.body.stck_prpr,
    marginRate: response.body.marg_rate,
  }));
};

const calQty = (balance, { price, marginRate }) =>
  (balance * (1 / (1 + marginRate))) / price;

const syncPortfolioToRatio = async function (uid, newPortfolioRatio = null) {
  // newPortfolioRatio: [{identifier, ratio, type}]
  User.findById(uid).then((user) => {
    // get current raw portfolio(made of only stocks and not subscriptions)
    // from korea Invest
    if (!newPortfolioRatio) newPortfolioRatio = user.portfolioRatio;

    const api = new Client(
      user.appkey,
      user.appsecret,
      user.accNumFront,
      user.accNumBack,
      { token: user.token, tokenExpiration: user.tokenExpiration }
    );
    api.balance("01").then((response) => {
      const currentRawPortfolio = {};
      for (const stock of response.body.output1)
        currentRawPortfolio[stock.pdno] = stock.hldg_qty;

      const totalBalance = response.body.output2[0].tot_evlu_amt;

      // calculate new raw portfolio from new ratio
      // and what stock/remaining cash will each subscription have
      const newRawPortfolio = {}, // qty
        newSubscription = [];
      for (const elem of newPortfolioRatio) {
        if (elem.ratioType === "stock") {
          const priceNMarginRate = getPriceNMarginRate(api, elem.identifier);
          newRawPortfolio[elem.identifier] = newRawPortfolio[elem.identifier]
            ? newRawPortfolio[elem.identifier] +
              calQty(totalBalance * elem.ratio, priceNMarginRate)
            : calQty(totalBalance * elem.ratio, priceNMarginRate);
        } else if (elem.ratioType === "subscription") {
          const subBalance = totalBalance * elem.ratio,
            obj = {
              uid: elem.identifier,
              stock: [],
              balance: subBalance,
            };

          let remainingCash = subBalance;
          User.findById(obj.uid).then((targetUser) => {
            // get portfolio ratio of target user
            for (const stockRatio of targetUser.portfolioRatio) {
              getPriceNMarginRate(api, stockRatio.ticker).then(
                (priceNMarginRate) => {
                  const balance = stockRatio.ratio * obj.balance,
                    qty = calQty(balance, priceNMarginRate);

                  const stockObj = {
                    ticker: stockRatio.ticker,
                    balance: balance,
                    qty: qty,
                    price: priceNMarginRate.price,
                    estimatedValue: qty * priceNMarginRate.price,
                  };

                  newRawPortfolio[stockObj.ticker] = newRawPortfolio[
                    stockObj.ticker
                  ]
                    ? newRawPortfolio[stockObj.ticker] + stockObj.qty
                    : stockObj.qty;

                  remainingCash -= stockObj.balance;
                  obj.stock.push(stockObj);
                }
              );
            }
            obj.stock.push({
              ticker: "000000",
              name: "예치금",
              qty: remainingCash,
              estimatedValue: remainingCash,
            });
          });
          newSubscription.push(obj);
        }
      }

      // newRawPortfolio to list of stocks
      // call api.getPrice and get price, marginRatio to calculate qty
      const tickerList = new Set(
        ...Object.keys(currentRawPortfolio),
        ...Object,
        keys(newRawPortfolio)
      );

      const sellActions = [],
        buyActions = [];
      for (const ticker of tickerList) {
        const oldQty = currentRawPortfolio.ticker
          ? currentRawPortfolio.ticker
          : 0;
        const newQty = newRawPortfolio.ticker ? newRawPortfolio.ticker : 0;
        if (oldQty > newQty) sellActions.push({ ticker, qty: oldQty - newQty });
        else if (newQty > oldQty)
          buyActions.push({ ticker, qty: newQty - oldQty });
      }

      const sellPromises = [];
      for (const action of sellActions) {
        const promise = api.MarketSell(action.ticker, action.qty);
        sellPromises.push(promise);
      }

      Promise.all(sellPromises).then(() => {
        const buyPromises = [];
        for (const action of buyActions) {
          const promise = api.MarketBuy(action.ticker, action.qty);
          buyPromises.push(promise);
        }
        Promise.all(buyPromises).then(() => {
          user.subscription = newSubscription.map((x) => {
            return User.findById(x.uid).then((targetUser) => {
              const subscriber = targetUser.subscriber.find(
                (y) => y.uid === uid
              );
              if (subscriber) {
                subscriber.stock = x.stock.map((y) => {
                  const stockObj = {
                    ticker: y.ticker,
                    qty: y.qty,
                  };
                  return stockObj;
                });
                subscriber.balance = x.balance;
              } else {
                targetUser.subscriber.push({
                  uid: uid,
                  stock: x.stock.map((y) => {
                    const stockObj = {
                      ticker: y.ticker,
                      qty: y.qty,
                    };
                    return stockObj;
                  }),
                  balance: x.balance,
                });
              }
              targetUser.save();

              const obj = {
                uid: x.uid,
                nickname: targetUser.nickname,
                stock: x.stock.map((y) => {
                  const stockName = Stock.find({ ticker: y.ticker }).then(
                    (z) => z.name
                  );
                  const stockObj = {
                    ticker: y.ticker,
                    name: stockName,
                    qty: y.qty,
                    price: y.price,
                    estimatedValue: y.estimatedValue,
                  };
                  return stockObj;
                }),
                inputBalance: x.balance,
                balance: x.balance,
              };
              return obj;
            });
          });
          user.lastSynced = new Date();
          user.portfolioRatio = newPortfolioRatio;

          user.save();
          syncPortfolioToKoInv(uid);
        });
      });
    });
  });
};

//Base Domain
router.get("/", function (req, res) {
  res.send("Stock Base Domain");
});

// SearchStock
router.get("/SearchStock", function ({ body: { name } }, res) {
  Stock.find({
    $or: [
      { name: new RegExp(`^${name}`, "i") },
      { ticker: new RegExp(`^${name}`, "i") },
    ],
  })
    .limit(10)
    .then((stocks) => {
      res.send({ stocks });
    });
});

// Portfolio - 종목별 - 종목명, 지분율, 수익률
// 총자산, 전체 수익률
router.get("/Portfolio", function ({ body: { uid } }, res) {
  syncPortfolioToKoInv(uid).then(() => {
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
});

//IsSubscribed
router.get("/IsSubscribed", function ({ body: { uid, targetUid } }, res) {
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

//SyncPortfolio
router.post(
  "/SyncPortfolio",
  function ({ body: { uid, newPortfolioRatio } }, res) {
    syncPortfolioToRatio(uid, newPortfolioRatio);
  }
);

//AddStock
router.post("/AddStock", function ({ body: { stocks } }, res) {
  for (const stock of stocks)
    Stock.create({ ticker: stock.ticker, name: stock.name });

  res.send({ msg: `${stocks.length} stocks has been added` });
});

router.get("/test", function ({ body: { uid } }, res) {
  syncPortfolioToKoInv(uid).then(() => res.send({ msg: "Done" }));
});

export default router;
