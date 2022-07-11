import mongoose from "mongoose";

const stockSchema = new mongoose.Schema({
  ticker: { type: String, unique: true, index: true },
  name: String,
  lastUpdated: Date,
  price: Number,
  marginRate: String,
  dailyProfit: String,
});

stockSchema.statics.create = function ({ ticker, name }) {
  const newStock = new this({ ticker, name });
  newStock.save();
};

const stockModel = mongoose.model("Stock", stockSchema);

export default stockModel;
