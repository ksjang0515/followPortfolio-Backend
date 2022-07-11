import express from "express";
import User from "../models/user.js";
import Client from "../api/koInvTokenUpdate.js";
import Stock from "../models/stock.js";
import {
  getStock,
  getUser,
  getApi,
  calculateAccRateOfReturn,
} from "../utils/utils.js";

const router = express.Router();

const getUserInfo = async (uid) => {
  const user = await getUser(uid, true, true);

  const portfolioRatio = user.portfolioRatio.map((x) => {
    if (x.ratioType === "stock") {
      const stock = user.portfolio.find((y) => y.ticker === x.identifier);
      if (!stock)
        throw `Stock in portfolioRatio was not found in portfolio: ${x.identifier}`;
      x.name = stock.name;
      x.rateOfReturn = stock.rateOfReturn;
    } else {
      const subscription = user.subscription.find(
        (y) => y.uid === x.identifier
      );
      x.name = subscription.nickname;
      x.rateOfReturn = (
        subscription.balance / subscription.inputBalance -
        1
      ).toFixed(3);
    }

    return {
      identifier: x.identifier,
      name: x.name,
      ratio: x.ratio,
      ratioType: x.ratioType,
      rateOfReturn: x.rateOfReturn,
    };
  });

  //console.log(portfolioRatio);

  return {
    uid: user.id.toString(),
    nickname: user.nickname,
    description: user.description,
    portfolio: user.portfolio,
    totalFollower: user.follower.length,
    totalSubscriber: user.subscriber.length,
    portfolioRatio: portfolioRatio,
    syncPeriod: user.syncPeriod,
    totalBalance: user.totalBalance,
    rateOfReturn: user.rateOfReturn,
  };
};

router.get("/", function (req, res) {
  res.send({ msg: "User Base Domain" });
});

//FollowingList
router.get("/FollowingList", async function ({ query: { uid } }, res) {
  const user = await getUser(uid, false);

  const following = [];
  for (const x of user.following) {
    const info = await getUserInfo(x.uid);
    following.push(info);
  }

  res.send({ followingList: following });
});

// SyncPeriod
router.get("/SyncPeriod", async function ({ query: { uid } }, res) {
  const user = await getUser(uid, false);

  res.send({ syncPeriod: user.syncPeriod });
});

// Description
router.get("/Description", async function ({ query: { uid } }, res) {
  const user = await getUser(uid, false);

  res.send({ description: user.description });
});

// FollowingListStock
router.get("/FollowingListStock", async function ({ query: { uid } }, res) {
  const user = await getUser(uid, false);
  const api = getApi(user);

  const followingStock = [];
  for (const stock of user.followingStock) {
    const stockRes = await getStock(stock.ticker, api);
    followingStock.push({
      ticker: stockRes.ticker,
      name: stockRes.name,
      dailyProfit: stockRes.dailyProfit * 0.01, //TODO
    });
  }

  res.send({ followingStock: followingStock });
});

// RecommendUser
router.get("/RecommendUser", async function ({ query: { type } }, res) {
  const users = User.find({});

  if (type === "subscriber") {
    users.sort((a, b) => {
      const aFollowerLen = a.subscriber.length,
        bFollowerLen = b.subscriber.length;

      if (aFollowerLen > bFollowerLen) return -1;
      if (aFollowerLen < bFollowerLen) return 1;
      return 0;
    });
  } else if (type === "profit") {
    users.sort((a, b) => {
      const aProfit = parseFloat(a.rateOfReturn.toString()),
        bProfit = parseFloat(b.rateOfReturn.toString());

      if (aProfit > bProfit) return -1;
      if (aProfit < bProfit) return 1;
      return 0;
    });
  } else if (type === "balance") {
    users.sort((a, b) => {
      if (a.totalBalance > b.totalBalance) return -1;
      if (a.totalBalance < b.totalBalance) return 1;
      return 0;
    });
  } else {
    res.status(500).send({ msg: "Wrong type has been sent" });
    return;
  }

  const recommendList = [];
  for (const x of users) {
    const info = await getUserInfo(x._id);
    recommendList.push(info);
  }

  res.send({ recommendation: recommendList });
});

// UserInfo
router.get("/UserInfo", async function ({ query: { uid } }, res) {
  console.log(`${new Date()} UserInfo: ${uid}`);

  const obj = await getUserInfo(uid);

  res.send(obj);
});

// isFollowing
router.get("/isFollowing", async function ({ query: { uid, targetUid } }, res) {
  const user = await User.findById(uid);

  let flag = false;
  for (let i = 0; i < user.following.length; i++)
    if (user.following[i].uid === targetUid) {
      flag = true;
      break;
    }
  res.send({ isFollowing: flag });
});

// ChangeSyncPeriod
router.post("/ChangeSyncPeriod", function ({ body: { uid, newPeriod } }, res) {
  User.findByIdAndUpdate(uid, { $set: { syncPeriod: newPeriod } })
    .then((user) => {
      if (!user) res.status(404).send({ error: "Failed to update syncPeriod" });
      else res.send({ msg: "Successfully updated Sync Period" });
    })
    .catch((error) => res.status(500).send(error));
});

// ChangeDescription
router.post(
  "/ChangeDescription",
  function ({ body: { uid, newDescription } }, res) {
    User.findByIdAndUpdate(uid, { $set: { description: newDescription } })
      .then((user) => {
        if (!user)
          res.status(404).send({ error: "Failed to update description" });
        else res.send({ msg: "Successfully updated description" });
      })
      .catch((error) => res.status(500).send(error));
  }
);

// ToggleFollowing
router.post("/ToggleFollowing", function ({ body: { uid, targetUid } }, res) {
  User.findById(targetUid).then((followingUser) => {
    if (!followingUser)
      res.status(500).send({ msg: "followingUser does not exist" });

    User.findById(uid).then((user) => {
      if (!followingUser) res.status(500).send({ msg: "User does not exist" });

      let flag = false;
      for (let i = 0; i < user.following.length; i++)
        if (user.following[i].uid === targetUid) flag = true;

      if (flag)
        User.findByIdAndUpdate(uid, {
          $pull: { following: { uid: targetUid } },
        }).then(() => {
          User.findByIdAndUpdate(targetUid, {
            $pull: { follower: { uid: uid } },
          }).then(() => res.send({ msg: "Unfollowed User" }));
        });
      else
        User.findByIdAndUpdate(uid, {
          $push: { following: { uid: targetUid } },
        }).then(
          User.findByIdAndUpdate(targetUid, {
            $push: { follower: { uid: uid } },
          }).then(() => res.send({ msg: "Followed User" }))
        );
    });
  });
});

//
router.post(
  "/ToggleFollowingStock",
  async function ({ body: { uid, ticker } }, res) {
    const user = await User.findById(uid);

    for (const stock of user.followingStock)
      if (stock.ticker === ticker) {
        await User.findByIdAndUpdate(uid, { $pull: { followingStock: stock } });

        res.send({ msg: "Unfollowed Stock" });
        return;
      }

    const stock = await Stock.findOne({ ticker: ticker });

    await User.findByIdAndUpdate(uid, {
      $push: {
        followingStock: {
          ticker: ticker,
          name: stock.name,
        },
      },
    });

    res.send({ msg: "Followed Stock" });
  }
);

// AddNewUser
router.post(
  "/AddNewUser",
  function (
    {
      body: {
        nickname,
        description,
        appkey,
        appsecret,
        accNumFront,
        accNumBack,
      },
    },
    res
  ) {
    const api = new Client(appkey, appsecret, accNumFront, accNumBack);

    api.balance("01").then((response) => {
      const totalBalance = response.body.output2[0].tot_evlu_amt,
        portfolio = [],
        portfolioRatio = [];

      for (const stock of response.body.output1) {
        portfolio.push({
          ticker: stock.pdno,
          name: stock.prdt_name,
          qty: stock.hldg_qty,
          estimatedValue: stock.evlu_amt,
          rateOfReturn: stock.evlu_erng_rt,
        });
        portfolioRatio.push({
          identifier: stock.pdno,
          ratio: (stock.evlu_amt / totalBalance).toFixed(3),
          ratioType: "stock",
        });
      }

      const remainingCash = response.body.output2[0].prvs_rcdl_excc_amt;
      portfolio.push({
        ticker: "000000",
        name: "예치금",
        qty: remainingCash,
        estimatedValue: remainingCash,
        rateOfReturn: 1,
      });
      portfolioRatio.push({
        identifier: "000000",
        ratio: (remainingCash / totalBalance).toFixed(3),
        ratioType: "stock",
      });

      User.create({
        nickname,
        description: description ? description : "",
        appkey,
        appsecret,
        accNumFront,
        accNumBack,
        portfolio,
        portfolioRatio,
        remainingCash,
        totalBalance,
        rateOfReturn: calculateAccRateOfReturn(response),
        token: api.options.token,
        tokenExpiration: api.options.tokenExpiration,
      }).then((user) => res.send({ msg: "Added new User", user }));
    });
  }
);

// RemoveUser
router.delete("/RemoveUser", function ({ body: { uid } }, res) {
  User.findByIdAndDelete(uid)
    .then((user) => {
      if (!user) res.status(404).send({ error: "User not found" });
      else res.send({ msg: "Removed user", user });
    })
    .catch((err) => res.status(500).send({ error: err }));
});

export default router;
