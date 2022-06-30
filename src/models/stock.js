import mongoose from "mongoose";

const stockSchema = new mongoose.Schema({
  ticker: String,
  name: String,
  market: String,
  marginRate: String,
});

stockSchema.statics.create = function ({ ticker, name, market }) {
  const newUser = new this({
    ticker,
    name,
    market,
  });

  return newUser.save();
};

stockSchema.statics.create = function ({ ticker, name }) {
  const newStock = new this({ ticker, name });
};

const stockModel = mongoose.model("Stock", stockSchema);

export default stockModel;
