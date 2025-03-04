var carwings = require("carwings");

var Service, Characteristic;
var carwingsSession = null;

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory(
    "homebridge-carwings",
    "Carwings",
    CarwingsAccessory,
  );
};

var base64regex =
  /^(?:[A-Z0-9+\/]{4})*(?:[A-Z0-9+\/]{2}==|[A-Z0-9+\/]{3}=|[A-Z0-9+\/]{4})$/i;

var email, password, region;
function loginCarwings(callback) {
  carwingsSession = null;
  carwings.loginSession(email, password, region).then(function (session) {
    carwingsSession = session;
    if (callback) {
      callback(session);
    }
  });
}

function CarwingsAccessory(log, config) {
  this.log = log;
  this.config = config;
  this.name = config["name"];
  email = config["email"];
  password = config["password"];
  region = config["region"];
  if (base64regex.test(password)) {
    password = Buffer.from(password, "base64");
  }

  this.battery = new Service.BatteryService(this.name);

  this.heater = new Service.HeaterCooler(this.name);

  this.heater
    .getCharacteristic(Characteristic.Active)
    .on("set", this.setHVAC.bind(this));

  var updateInterval = config["updateInterval"]
    ? config["updateInterval"]
    : 3600;

  _this = this;
  loginCarwings(async () => {
    await _this.updateBattery();
    await _this.updateHVACStatus();
    await _this.updateCabinTemp();
    if (updateInterval != "never") {
      setInterval(async () => {
        await _this.updateBattery();
        await _this.updateHVACStatus();
        await _this.updateCabinTemp();
      }, updateInterval * 1000);
    }
  });
}

CarwingsAccessory.prototype.updateBattery = async function () {
  if (!carwingsSession) {
    return;
  }

  var _this = this;
  let status = await carwings.batteryStatusCheck(carwingsSession);
  // console.log(status);
  if (status.status == 401) {
    loginCarwings();
    return;
  }

  var chargePercent = Math.round(
    (parseInt(status.batteryDegradation) / parseInt(status.batteryCapacity)) *
      100,
  );
  console.log("LEAF charge percent = ", chargePercent);
  _this.battery
    .getCharacteristic(Characteristic.BatteryLevel)
    .updateValue(chargePercent);
  _this.battery
    .getCharacteristic(Characteristic.ChargingState)
    .updateValue(status.charging == "YES");
  _this.battery
    .getCharacteristic(Characteristic.StatusLowBattery)
    .updateValue(chargePercent < 20);
};

CarwingsAccessory.prototype.updateHVACStatus = async function () {
  if (!carwingsSession) {
    return;
  }

  var _this = this;
  let status = await carwings.hvacStatus(carwingsSession);
  if (status.status == 401) {
    loginCarwings();
    return;
  }
  if (status.RemoteACRecords) {
    _this.heater
      .getCharacteristic(Characteristic.Active)
      .updateValue(status.RemoteACRecords.RemoteACOperation !== "STOP");
    _this.heater
      .getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .updateValue(parseInt(status.RemoteACRecords.PreAC_temp));
    _this.heater
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .updateValue(parseInt(status.RemoteACRecords.PreAC_temp));
  }
};

CarwingsAccessory.prototype.updateCabinTemp = async function () {
  if (!carwingsSession) {
    return;
  }

  var _this = this;
  let status = await carwings.cabinTemp(carwingsSession);
  if (status.status == 401) {
    loginCarwings();
  }
  console.log("LEAF cabin temp = ", status.Inc_temp);
  _this.heater
    .getCharacteristic(Characteristic.CurrentTemperature)
    .updateValue(parseInt(status.Inc_temp));
};

CarwingsAccessory.prototype.setHVAC = function (on, callback) {
  if (!carwingsSession) {
    return;
  }
  if (on) {
    carwings.hvacOn(carwingsSession).then(function (status) {
      if (status.status == 401) {
        loginCarwings();
      }
      callback(null, true);
    });
  } else {
    carwings.hvacOff(carwingsSession).then(function (status) {
      if (status.status == 401) {
        loginCarwings();
      }
      callback(null, false);
    });
  }
};

CarwingsAccessory.prototype.setCharge = function (on, callback) {
  if (!carwingsSession) {
    return;
  }
  if (on) {
    carwings.batteryStartCharging(carwingsSession).then(function (status) {
      if (status.status == 401) {
        loginCarwings();
      }
      callback(null, true);
    });
  }
};

CarwingsAccessory.prototype.getServices = function () {
  return [this.battery, this.heater];
};
