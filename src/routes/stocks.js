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

const syncPortfolioToKoInv = async function (uid) {
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

const syncPortfolioToSub = function (uid, targetUid) {};

const getPriceNMarginRate = async (api, ticker) => {
  return await api.getPrice(ticker).then((response) => ({
    price: response.body.stck_prpr,
    marginRate: response.body.marg_rate,
  }));
};

const calQty = (balance, { price, marginRate }) =>
  (balance * (1 / (1 + marginRate))) / price;

const syncPortfolioToRatio = async function (uid, newPortfolioRatio) {
  // newPortfolioRatio: [{identifier, ratio, type}]
  User.findById(uid).then(
    (user) => {
      // get current raw portfolio(made of only stocks and not subscriptions)
      // from korea Invest
      const api = new Client(
        user.appkey,
        user.appsecret,
        user.accNumFront,
        user.accNumBack,
        { token: user.token, tokenExpiration: user.tokenExpiration }
      );
      api.balance("01").then((response) => {
        const currentRawPortfolio = {};
        for (let i = 0; i < response.body.output1.length; i++) {
          const stock = response.body.output1[i];
          currentRawPortfolio[stock.pdno] = stock.hldg_qty;
        }
        const totalBalance = response.body.output2[0].tot_evlu_amt;

        // calculate new raw portfolio from new ratio
        // and what stock/remaining cash will each subscription have
        const newRawPortfolio = {}, // qty
          newSubscription = [];
        for (const elem of newPortfolioRatio) {
          if (elem.type === "stock") {
            const priceNMarginRate = getPriceNMarginRate(api, elem.identifier);
            newRawPortfolio[elem.identifier] = newRawPortfolio[elem.identifier]
              ? newRawPortfolio[elem.identifier] +
                calQty(totalBalance * elem.ratio, priceNMarginRate)
              : calQty(totalBalance * elem.ratio, priceNMarginRate);
          } else if (elem.type === "subscription") {
            const subBalance = totalBalance * elem.ratio,
              obj = {
                uid: elem.identifier,
                stock: [],
                balance: subBalance,
                remainingCash: subBalance,
              };
            User.findById(obj.uid).then((targetUser) => {
              // get portfolio ratio of target user
              for (const stockRatio of targetUser.portfolioRatio) {
                const priceNMarginRate = getPriceNMarginRate(
                  api,
                  stockRatio.ticker
                );

                const stockObj = {
                  ticker: stockRatio.ticker,
                  balance: stockRatio.ratio * obj.balance,
                  qty: calQty(this.balance, priceNMarginRate),
                  price: priceNMarginRate.price,
                  estimatedValue: this.qty * this.price,
                };

                newRawPortfolio[stockObj.ticker] = newRawPortfolio[
                  stockObj.ticker
                ]
                  ? newRawPortfolio[stockObj.ticker] + stockObj.qty
                  : stockObj.qty;

                obj.remainingCash -= stockObj.balance;
                obj.stock.push(stockObj);
              }
            });
            newSubscription.push(obj);
          }
        }

        // newRawPortfolio to number of stocks
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
          if (oldQty > newQty)
            sellActions.push({ ticker, qty: oldQty - newQty });
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
              /*
              {
                uid,
                stock: [{
                  ticker,
                  balance,
                  qty,
                  price,
                  estimatedValue
                }],
                balance,
                remainingCash,
              };
               */
              return User.findById(x.uid).then((targetUser) => {
                const subscriber = targetUser.follower.find(
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
                  balance: x.balance,
                  remainingCash: x.remainingCash,
                };
                return obj;
              });
            });
            user.save();
            syncPortfolioToKoInv(uid).then(() => {});
          });
        });
      });
    }

    // take action
    // sync portfolio to korea invest
  );
};

const subscribe = function (uid, targetUid, amount) {
  // sync portfolio
  syncPortfolioToKoInv(targetUid).then(() => {
    User.findById(uid).then((user) => {
      User.findById(targetUid).then((targetUser) => {
        const promises = [],
          subscription = {
            uid: targetUid,
            nickname: targetUser._id,
            stock: [],
            inputBalance: amount,
            balance: amount,
            remainingCash: 0,
          },
          subscriber = { uid: uid, stock: [], balance: amount };
        let remainingCash = amount;
        for (const ratio of targetUser.portfolioRatio) {
          // decide how much to buy
          const amt = parseInt(ratio.rate.toString()) * amount,
            ticker = ratio.ticker;
          Stock.findOne({ ticker: ticker }).then(({ marginRate, name }) => {
            const price = targetUser.portfolio.findIndex((elem) => {
              return (elem.ticker = ticker);
            }).price;
            const qty = parseInt((amt * (1 / (marginRate + 1))) / qty);

            // buy stock and set remaining cash
            promises.push(api.MarketBuy(ticker, qty));
            remainingCash -= price * qty;

            subscription.stock.push({
              ticker: ticker,
              name: name,
              qty: qty,
              price: price,
              entryPrice: price,
              estimatedValue: price * qty,
              rateOfReturn: 1,
            });
            subscriber.stock.push([
              {
                ticker: ticker,
                qty: qty,
              },
            ]);
          });
        }

        subscription.remainingCash = remainingCash;

        Promise.all(promises).then(() => {
          // save
          User.findByIdAndUpdate(uid, {
            $push: { subscription: subscription },
          });
          User.findByIdAndUpdate(targetUid, {
            $push: { subscriber: subscriber },
          });
        });
      });
    });
  });
};

//Unsubscribe
const unsubscribe = function (uid, targetUid) {
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

        syncPortfolioToKoInv(uid).then(() => {
          res.send({ msg: "Unsubscribed" });
        });
      });
    });
  });
};

router.get("/", function (req, res) {
  res.send("Stock Base Domain");
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
router.post(
  "/ChangePortfolio",
  function ({ body: { uid, newPortfolioRatio } }, res) {
    // sync portfolio to korea invest
    // identify what stocks and subscriptions are included in old and new portfolio using set
    // get user
    // calculate what action needs to be taken
    // take action
  }
);

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
