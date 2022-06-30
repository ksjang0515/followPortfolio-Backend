import express from "express";
import Dotenv from "dotenv";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import userRoute from "./src/routes/users.js";
import stockRoute from "./src/routes/stocks.js";

Dotenv.config();

const app = express();
const { PORT, MONGO_URI } = process.env;

app.use(express.static("public"));
// body-parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// router
app.use("/users", userRoute);
app.use("/stocks", stockRoute);

mongoose
  .connect(MONGO_URI, { useNewUrlParser: true })
  .then(() => console.log("\nSuccessfully connected to MongoDB"))
  .catch((err) =>
    console.log(`\nError occurred connecting to MongoDB\n${err}`)
  );

app.listen(PORT, () => {
  console.log("Sever Started!");
});
