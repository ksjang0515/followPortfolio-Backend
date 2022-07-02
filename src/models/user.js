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
          price: Number,
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
      price: Number,
      entryPrice: Number,
      estimatedValue: Number,
      rateOfReturn: mongoose.Decimal128,
    },
  ],
  portfolioRatio: [
    {
      identifier: String,
      ratio: mongoose.Decimal128,
      type: String,
    },
  ],
  remainingCash: Number,
  syncPeriod: { type: Number, default: 1 },
  totalBalance: Number,
  rateOfReturn: mongoose.Decimal128,
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
    totalBalance,
    rateOfReturn,
    token,
    tokenExpiration,
  });

  return newUser.save();
};

const userModel = mongoose.model("User", userSchema);

export default userModel;
