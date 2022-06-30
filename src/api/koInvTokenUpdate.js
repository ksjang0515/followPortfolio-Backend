import client from "./KoreaInvestmentAPI.js";
import User from "../models/user.js";

class newClient extends client {
  setToken(_token, _expire_in) {
    console.log("calling setToken");
    super.setToken(_token, _expire_in);

    console.log(
      { appkey: this.options.appkey },
      {
        token: this.options.token,
        tokenExpiration: this.options.tokenExpiration,
      }
    );
    User.findOneAndUpdate(
      { appkey: this.options.APIKEY },
      {
        token: this.options.token,
        tokenExpiration: this.options.tokenExpiration,
      }
    )
      .then(console.log)
      .catch(console.log);

    console.log("end setToken");
  }
}

export default newClient;
