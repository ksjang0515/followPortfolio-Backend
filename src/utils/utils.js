import Stock from "../models/stock.js";
import User from "../models/user.js";
import Client from "../api/koInvTokenUpdate.js";

const syncPortfolioToKoInv = async function (uid) {
  const user = await User.findById(uid);
  if (!user) return;

  const api = new Client(
    user.appkey,
    user.appsecret,
    user.accNumFront,
    user.accNumBack,
    { token: user.token, tokenExpiration: user.tokenExpiration }
  );
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
  }

  // 예수금
  let remainingCash = response.body.output2[0].prvs_rcdl_excc_amt;

  // Subscription마다 주식 잔고와 예수금 제외 및 subscription 정보로 저장
  const newSubscription = [];
  for (const elem of user.subscription) {
    const x = {
      uid: elem.uid,
      nickname: elem.nickname,
      stock: [],
      balance: 0,
    };

    for (const stock of elem.stock) {
      if (stock.ticker === "000000") {
        remainingCash -= stock.qty; //Subscription 예수금과 일반 예수금 따로 관리
        x.stock.push({
          ticker: stock.ticker,
          name: stock.name,
          qty: stock.qty,
          estimatedValue: stock.estimatedValue,
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
    x.inputBalance = x.balance;
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
    },
  }).exec();
};

const getPriceNMarginRate = async (api, ticker) => {
  const res = await api.getPrice(ticker);

  return {
    price: res.body.output.stck_prpr,
    marginRate: res.body.output.marg_rate,
  };
};

const calQty = (balance, { marginRate, price }) =>
  parseInt((balance * (1 / (1 + marginRate / 100))) / price);

const syncPortfolioToRatio = async function (uid, newPortfolioRatio = null) {
  await syncPortfolioToKoInv(uid);

  // newPortfolioRatio: [{identifier, ratio, type}]
  const user = await User.findById(uid);

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

      const priceNMarginRate = await getPriceNMarginRate(api, elem.identifier);
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
      const targetUser = await User.findById(obj.uid);
      // get portfolio ratio of target user
      for (const stockRatio of targetUser.portfolioRatio) {
        if (
          stockRatio.ratioType === "subscription" ||
          stockRatio.identifier === "000000"
        )
          continue;
        const priceNMarginRate = await getPriceNMarginRate(
          api,
          stockRatio.identifier
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
    const targetUser = await User.findById(x.uid);
    const subscriber = targetUser.subscriber.find((y) => y.uid === uid);
    if (subscriber) {
      const test = await User.findOne({
        _id: x.uid,
        "subscriber.uid": uid,
      });
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

export { syncPortfolioToKoInv, syncPortfolioToRatio };
