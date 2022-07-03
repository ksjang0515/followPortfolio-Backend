import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  nickname: { type: String, required: true, unique: true },
  description: { type: String },
  appkey: { type: String, required: true },
  appsecret: { type: String, required: true },
  accNumFront: { type: String, required: true },
  accNumBack: { type: String, required: true },
  following: [{ uid: String }],
  follower: [{ uid: String }],
  followingStock: [{ ticker: String, name: String }],
  subscription: [
    {
      uid: String,
      nickname: String,
      stock: [
        {
          ticker: String,
          name: String,
          qty: Number,
          estimatedValue: Number,
        },
      ],
      inputBalance: Number,
      balance: Number,
      remainingCash: Number,
    },
  ],
  subscriber: [
    {
      uid: String,
      stock: [{ ticker: String, qty: Number }],
      balance: Number,
    },
  ],
  portfolio: [
    {
      ticker: String,
      name: String,
      qty: Number,
      estimatedValue: Number,
      rateOfReturn: String,
    },
  ],
  portfolioRatio: [
    {
      identifier: String,
      ratio: String,
      ratioType: String,
    },
  ],
  remainingCash: Number,
  syncPeriod: { type: Number, default: 1 },
  totalBalance: Number,
  rateOfReturn: String,
  token: String,
  tokenExpiration: Number,
});

userSchema.statics.create = function ({
  nickname,
  description,
  appkey,
  appsecret,
  accNumFront,
  accNumBack,
  portfolio,
  portfolioRatio,
  remainingCash,
  totalBalance,
  rateOfReturn,
  token,
  tokenExpiration,
}) {
  const newUser = new this({
    nickname,
    description,
    appkey,
    appsecret,
    accNumFront,
    accNumBack,
    portfolio,
    portfolioRatio,
    remainingCash,
    totalBalance,
    rateOfReturn,
    token,
    tokenExpiration,
  });

  return newUser.save();
};

const userModel = mongoose.model("User", userSchema);

export default userModel;
