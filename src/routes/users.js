import express from "express";
import User from "../models/user.js";
import Client from "../api/koInvTokenUpdate.js";

const router = express.Router();

router.get("/", function (req, res) {
  res.send("User Base Domain");
});

router.get("/FollowingList", function ({ body: { uid } }, res) {
  User.findById(uid).then((user) => {
    res.send({ followingList: user.following });
  });
});

// SyncPeriod
router.get("/SyncPeriod", function ({ body: { uid } }, res) {
  User.findById(uid).then((user) => {
    res.send({ syncPeriod: user.syncPeriod });
  });
});

// Description
router.get("/Description", function ({ body: { uid } }, res) {
  User.findById(uid)
    .then((user) => {
      if (!user) res.status(404).send({ error: "User not found" });
      else res.send({ description: user.description });
    })
    .catch((err) => res.status(500).send(err));
});

// FollowingListStock
router.get("/FollowingListStock", function ({ body: { uid } }, res) {
  User.findById(uid).then((user) => {
    res.send({ followingStock: user.followingStock });
  });
});

// RecommendUser
router.get("/RecommendUser", function ({ body: { type } }, res) {
  User.find({}).then((users) => {
    if (type === "follower") {
      users.sort((a, b) => {
        const aFollowerLen = a.follower.length,
          bFollowerLen = b.follower.length;

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
    } else {
      res.status(500).send({ msg: "Wrong type has been sent" });
      return;
    }

    res.send(
      users.slice(0, 10).map((user) => {
        return {
          uid: user._id,
          nickname: user.nickname,
          description: user.description,
          portfolio: user.portfolio,
          rateOfReturn: parseFloat(user.rateOfReturn.toString()),
          followerNum: user.follower.length,
        };
      })
    );
  });
});

// UserInfo
router.get("/UserInfo", function ({ body: { uid } }, res) {
  User.findById(uid)
    .then((user) => {
      if (!user) res.status(404).send({ error: "User not found" });
      else
        res.send({
          uid: user._id,
          nickname: user.nickname,
          description: user.description,
          portfolio: user.portfolio,
          rateOfReturn: user.rateOfReturn,
          followerNum: user.follower.length,
        });
    })
    .catch((err) => res.status(500).send(err));
});

// isFollowing
router.get("/isFollowing", function ({ body: { uid, targetUid } }, res) {
  User.findById(uid).then((user) => {
    let flag = false;
    for (let i = 0; i < user.following.length; i++)
      if (user.following[i].uid === targetUid) {
        flag = true;
        break;
      }
    res.send({ isFollowing: flag });
  });
});

// ChangeSyncPeriod
router.post("/ChangeSyncPeriod", function ({ body: { uid, newPeriod } }, res) {
  User.findByIdAndUpdate(uid, { $set: { syncPeriod: newPeriod } })
    .then((user) => {
      if (!user) res.status(404).send({ error: "Failed to update syncPeriod" });
      else res.send({ msg: "Successfully updated syncPeriod" });
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
        rateOfReturn = response.body.output2[0].asst_icdc_erng_rt,
        portfolio = [];
      const token = api.options.token,
        tokenExpiration = api.options.tokenExpiration;

      for (let i = 0; i < response.body.output1.length; i++) {
        const stock = response.body.output1[i];
        portfolio.push({
          ticker: stock.pdno,
          name: stock.prdt_name,
          qty: stock.hldg_qty,
          entryPrice: stock.pchs_avg_pric,
        });
      }

      User.create({
        nickname,
        description: description ? description : "",
        appkey,
        appsecret,
        accNumFront,
        accNumBack,
        portfolio,
        totalBalance,
        rateOfReturn,
        token,
        tokenExpiration,
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
    .catch((err) => res.status(500).send(err));
});

export default router;
