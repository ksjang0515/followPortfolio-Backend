import client from "./KoreaInvestmentAPI.js";
import User from "../models/user.js";

class newClient extends client {
  async setToken(_token, _expire_in) {
    super.setToken(_token, _expire_in);

    await User.findOneAndUpdate(
      { appkey: this.options.APIKEY },
      {
        token: this.options.token,
        tokenExpiration: this.options.tokenExpiration,
      }
    );
  }
}

export default newClient;
