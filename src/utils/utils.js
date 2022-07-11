import Stock from "../models/stock.js";
import User from "../models/user.js";
import Client from "../api/koInvTokenUpdate.js";
import { response } from "express";

const checkId = (id) => {
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    return true;
  }
  return false;
};

const getApi = async (user) => {
  const api = new Client(
    user.appkey,
    user.appsecret,
    user.accNumFront,
    user.accNumBack,
    { token: user.token, tokenExpiration: user.tokenExpiration }
  );

  return api;
};

const getUser = async (uid, update = true, forceUpdate = false) => {
  // check uid
  if (!uid) throw `Uid not sent: ${uid}`;
  if (!checkId(uid)) throw `Wrong uid sent: ${uid}`;

  // get user
  const user = await User.findById(uid);
  if (!user) throw `User not found: ${uid}`;

  if (!update) return user;

  // check user needs a new update
  const dt = new Date();
  if (forceUpdate || dt - user.lastSynced > 10) {
    await syncPortfolioToKoInv(uid);
    const newUser = await User.findById(uid);
    return newUser;
  }

  return user;
};

const getStock = async (ticker, api, update = true) => {
  // check ticker
  if (!ticker) throw `Invalid ticker has been sent: ${ticker}`;

  // get stock
  const stock = await Stock.findOne({ ticker: ticker });
  if (!stock) throw `Invalid ticker has been sent: ${ticker}`;

  if (!update) return stock;

  // check stock needs a new update
  const dt = new Date();
  if (dt - stock.lastUpdated > 10) {
    if (!api) throw "Api was not passed to getStock when updating";

    const res = await api.getPrice(ticker);

    await Stock.findOneAndUpdate(
      { ticker: ticker },
      {
        $set: {
          lastUpdated: dt,
          price: res.body.output.stck_prpr,
          marginRate: res.body.output.marg_rate,
          dailyProfit: response.body.output.prdy_ctrt,
        },
      }
    );

    const newStock = await Stock.findOne({ ticker: ticker });

    return newStock;
  }

  return stock;
};

const calculateAccRateOfReturn = (response) =>
  (
    response.body.output2[0].asst_icdc_amt /
    response.body.output2[0].bfdy_tot_asst_evlu_amt
  ).toFixed(4);

const syncPortfolioToKoInv = async function (uid) {
  const user = await getUser(uid, false);
  const api = await getApi(user);

  const response = await api.balance("01");

  const newPortfolio = [];
  for (const elem of response.body.output1) {
    if (elem.hldg_qty === "0") continue;
    newPortfolio.push({
      ticker: elem.pdno,
      name: elem.prdt_name,
      qty: elem.hldg_qty,
      estimatedValue: elem.evlu_amt,
      rateOfReturn: elem.evlu_pfls_rt * 0.01,
    });
    // cannot update stock here because there is no dailyProfit value
  }

  // 예수금
  let remainingCash = response.body.output2[0].prvs_rcdl_excc_amt;

  // update estimatedValue of each subscription
  const newSubscription = [];
  for (const elem of user.subscription) {
    const x = {
      uid: elem.uid,
      nickname: elem.nickname,
      stock: [],
      balance: 0,
      inputBalance: elem.inputBalance, // inputBalance only changes during sync portfolio to ratio
    };

    for (const stock of elem.stock) {
      if (stock.ticker === "000000") {
        remainingCash -= stock.qty; //Subscription 예수금과 일반 예수금 따로 관리
        x.stock.push({
          ticker: stock.ticker,
          name: stock.name,
          qty: stock.qty,
          estimatedValue: stock.estimatedValue, // should be same to stock.qty because this is 예수금
        });
        x.balance += stock.estimatedValue;
        continue;
      }
      const portfolioObj = response.body.output1.find(
        (x) => x.pdno === stock.ticker
      );

      x.stock.push({
        ticker: stock.ticker,
        name: stock.name,
        qty: stock.qty,
        estimatedValue: portfolioObj.prpr * stock.qty,
      });

      portfolioObj.estimatedValue -= stock.estimatedValue;
      portfolioObj.qty -= stock.qty;

      x.balance += portfolioObj.prpr * stock.qty;
    }
    newSubscription.push(x);
  }

  newPortfolio.push({
    ticker: "000000",
    name: "예수금",
    qty: remainingCash,
    estimatedValue: remainingCash,
    rateOfReturn: "0",
  });

  // 바꾼 정보를 DB에 저장
  await User.findByIdAndUpdate(uid, {
    $set: {
      portfolio: newPortfolio,
      subscription: user.subscription,
      totalBalance: response.body.output2[0].tot_evlu_amt,
      rateOfReturn: calculateAccRateOfReturn(response),
    },
  }).exec();
};

const getPriceNMarginRate = async (ticker, api) => {
  const stock = getStock(ticker, api);
  return { price: stock.price, marginRate: stock.marginRate };
};

const syncPortfolioToRatio = async function (uid, newPortfolioRatio = null) {
  // newPortfolioRatio: [{identifier, ratio, type}]
  const user = await getUser(uid, true, true);
  const api = await getApi(user);

  // get current raw portfolio(made of only stocks and not subscriptions)
  // from korea Invest
  if (!newPortfolioRatio) newPortfolioRatio = user.portfolioRatio;

  const currentRawPortfolio = {};
  for (const stock of user.portfolio)
    if (stock.ticker !== "000000")
      currentRawPortfolio[stock.ticker] = stock.qty;

  for (const subscription of user.subscription)
    for (const stock of subscription.stock)
      if (stock.ticker !== "000000")
        currentRawPortfolio[stock.ticker] = currentRawPortfolio[stock.ticker]
          ? currentRawPortfolio[stock.ticker] + stock.qty
          : stock.qty;

  const totalBalance = user.totalBalance;

  // calculate new raw portfolio from new ratio
  // and what stock/remaining cash will each subscription have
  const newRawPortfolio = {}, // qty
    newSubscription = [];
  for (const elem of newPortfolioRatio) {
    if (elem.ratioType === "stock") {
      if (elem.identifier === "000000") continue;

      const priceNMarginRate = await getPriceNMarginRate(elem.identifier, api);
      newRawPortfolio[elem.identifier] = newRawPortfolio[elem.identifier]
        ? newRawPortfolio[elem.identifier] +
          calQty(totalBalance * elem.ratio, priceNMarginRate)
        : calQty(totalBalance * elem.ratio, priceNMarginRate);
    } else if (elem.ratioType === "subscription") {
      const subBalance = parseInt(totalBalance * elem.ratio),
        obj = {
          uid: elem.identifier,
          stock: [],
          balance: subBalance,
        };

      let remainingCash = subBalance;
      const targetUser = await getUser(obj.uid, false);
      // get portfolio ratio of target user
      for (const stockRatio of targetUser.portfolioRatio) {
        if (
          stockRatio.ratioType === "subscription" ||
          stockRatio.identifier === "000000"
        )
          continue;
        const priceNMarginRate = await getPriceNMarginRate(
          stockRatio.identifier,
          api
        );
        const balance = parseInt(stockRatio.ratio * obj.balance),
          qty = calQty(balance, priceNMarginRate);

        const a = await Stock.findOne({ ticker: stockRatio.identifier });
        const stockName = a.name;

        const stockObj = {
          ticker: stockRatio.identifier,
          name: stockName,
          qty: qty,
          estimatedValue: qty * priceNMarginRate.price,
        };

        newRawPortfolio[stockObj.ticker] = newRawPortfolio[stockObj.ticker]
          ? newRawPortfolio[stockObj.ticker] + stockObj.qty
          : stockObj.qty;

        remainingCash -= stockObj.estimatedValue;
        obj.stock.push(stockObj);
      }
      obj.stock.push({
        ticker: "000000",
        name: "예수금",
        qty: remainingCash,
        estimatedValue: remainingCash,
      });
      newSubscription.push(obj);
    }
  }

  // newRawPortfolio to list of stocks
  // call api.getPrice and get price, marginRatio to calculate qty
  const tickerList = new Set([
    ...Object.keys(currentRawPortfolio),
    ...Object.keys(newRawPortfolio),
  ]);

  const sellActions = [],
    buyActions = [];
  for (const ticker of tickerList) {
    const oldQty = currentRawPortfolio[ticker]
      ? currentRawPortfolio[ticker]
      : 0;
    const newQty = newRawPortfolio[ticker] ? newRawPortfolio[ticker] : 0;
    if (oldQty > newQty) sellActions.push({ ticker, qty: oldQty - newQty });
    else if (newQty > oldQty) buyActions.push({ ticker, qty: newQty - oldQty });
  }

  const sellPromises = [];
  for (const action of sellActions) {
    const promise = api.MarketSell(action.ticker, action.qty.toString());
    sellPromises.push(promise);
  }
  await Promise.all(sellPromises);

  const buyPromises = [];
  for (const action of buyActions) {
    const promise = api.MarketBuy(action.ticker, action.qty.toString());
    buyPromises.push(promise);
  }
  await Promise.all(buyPromises);

  const arr = [];
  for (const x of newSubscription) {
    const targetUser = await getUser(x.uid, false);
    const subscriber = targetUser.subscriber.find((y) => y.uid === uid);
    if (subscriber) {
      await User.findOneAndUpdate(
        { _id: x.uid, "subscriber.uid": uid },
        {
          $set: {
            "subscriber.$.stock": x.stock.map((y) => ({
              ticker: y.ticker,
              qty: y.qty,
            })),
            "subscriber.$.balance": x.balance,
          },
        }
      ).exec();
    } else {
      await User.findByIdAndUpdate(x.uid, {
        $push: {
          subscriber: {
            uid: uid,
            stock: x.stock.map((y) => ({
              ticker: y.ticker,
              qty: y.qty,
            })),
            balance: x.balance,
          },
        },
      }).exec();
    }

    const obj = {
      uid: x.uid,
      nickname: targetUser.nickname,
      stock: x.stock,
      inputBalance: x.balance,
      balance: x.balance,
    };

    arr.push(obj);
  }
  user.subscription = arr;

  await User.findByIdAndUpdate(uid, {
    $set: {
      lastSynced: new Date(),
      portfolioRatio: newPortfolioRatio,
      subscription: arr,
    },
  }).exec();

  await syncPortfolioToKoInv(uid);
};

export {
  syncPortfolioToRatio,
  getStock,
  getApi,
  getUser,
  calculateAccRateOfReturn,
};
